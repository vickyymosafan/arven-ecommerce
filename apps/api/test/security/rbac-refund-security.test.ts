import 'reflect-metadata';
import type { Redis } from 'ioredis';
import { generate, generateSecret } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ROLE_CODES,
  DEFAULT_WAREHOUSE_CODE,
  HTTP_HEADERS,
  loadRuntimeConfig,
  type AdminRoleCode,
  type RoleCode,
  type RuntimeConfig,
} from '@arven/config';
import {
  CouponStatus,
  DiscountType,
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  RefundStatus,
  ReturnStatus,
  SessionScope,
  StockReservationStatus,
  UserStatus,
} from '@arven/database';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  SessionStoreService,
  TokenCryptoService,
  checkRouteAuthMetadata,
} from '../../src/common/security/index.js';
import { createApp } from '../../src/main.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/shared/redis/redis.module.js';

interface AdminSessionHandle {
  roleCode: AdminRoleCode;
  userId: string;
  email: string;
  cookieHeader: string;
  csrfToken: string;
  totpSecret: string;
}

interface CustomerSessionHandle {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  cookieHeader: string;
  csrfToken: string;
}

describe('Phase 06 Security & RBAC Gate (7-Role Matrix, PII Masking, Dual-Step Refunds, Return Ownership & CMS Isolation)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let config: RuntimeConfig;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;
  let warehouseId: string;

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdShipmentIds: string[] = [];
  const createdReturnIds: string[] = [];
  const createdRefundIds: string[] = [];
  const createdCouponIds: string[] = [];
  const createdPageIds: string[] = [];
  const createdLookbookIds: string[] = [];
  const createdJournalIds: string[] = [];
  const createdIdempotencyActors: string[] = [];

  beforeAll(async () => {
    const baseConfig = loadRuntimeConfig();
    const testConfig: RuntimeConfig = {
      ...baseConfig,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      PAYMENT_DRIVER: 'local_stub',
      REDIS_URL: 'redis://127.0.0.1:6379/12',
    };

    const bootstrapped = await createApp(testConfig);
    app = bootstrapped.app;
    config = bootstrapped.config;
    await app.init();

    checkRouteAuthMetadata(app);

    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    tokenCrypto = app.get(TokenCryptoService);
    sessionStore = app.get(SessionStoreService);

    const warehouse = await prisma.client.warehouse.findFirstOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
    });
    warehouseId = warehouse.id;

    await redis.flushdb();
  });

  beforeEach(async () => {
    await clearThrottleBuckets();
  });

  afterAll(async () => {
    if (prisma) {
      if (createdRefundIds.length > 0 || createdOrderIds.length > 0) {
        await prisma.client.refund.deleteMany({
          where: {
            OR: [
              ...(createdRefundIds.length > 0 ? [{ id: { in: createdRefundIds } }] : []),
              ...(createdOrderIds.length > 0
                ? [{ orderId: { in: createdOrderIds } }]
                : []),
            ],
          },
        });
      }

      if (createdReturnIds.length > 0 || createdOrderIds.length > 0) {
        await prisma.client.return.deleteMany({
          where: {
            OR: [
              ...(createdReturnIds.length > 0 ? [{ id: { in: createdReturnIds } }] : []),
              ...(createdOrderIds.length > 0
                ? [{ orderId: { in: createdOrderIds } }]
                : []),
            ],
          },
        });
      }

      if (createdShipmentIds.length > 0 || createdOrderIds.length > 0) {
        await prisma.client.shipment.deleteMany({
          where: {
            OR: [
              ...(createdShipmentIds.length > 0
                ? [{ id: { in: createdShipmentIds } }]
                : []),
              ...(createdOrderIds.length > 0
                ? [{ orderId: { in: createdOrderIds } }]
                : []),
            ],
          },
        });
      }

      if (createdOrderIds.length > 0) {
        await prisma.client.paymentEvent.deleteMany({
          where: { payment: { orderId: { in: createdOrderIds } } },
        });
        await prisma.client.payment.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.client.couponRedemption.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.client.stockReservation.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.client.inventoryMovement.deleteMany({
          where: {
            OR: [
              { referenceId: { in: createdOrderIds } },
              ...(createdReturnIds.length > 0
                ? [{ referenceId: { in: createdReturnIds } }]
                : []),
            ],
          },
        });
        await prisma.client.orderStatusHistory.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.client.orderItem.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.client.order.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }

      const allAggregateIds = [
        ...createdOrderIds,
        ...createdShipmentIds,
        ...createdReturnIds,
        ...createdRefundIds,
      ];
      if (allAggregateIds.length > 0) {
        await prisma.client.outboxEvent.deleteMany({
          where: { aggregateId: { in: allAggregateIds } },
        });
      }

      if (createdCouponIds.length > 0) {
        await prisma.client.coupon.deleteMany({
          where: { id: { in: createdCouponIds } },
        });
      }
      if (createdPageIds.length > 0) {
        await prisma.client.page.deleteMany({
          where: { id: { in: createdPageIds } },
        });
      }
      if (createdLookbookIds.length > 0) {
        await prisma.client.lookbook.deleteMany({
          where: { id: { in: createdLookbookIds } },
        });
      }
      if (createdJournalIds.length > 0) {
        await prisma.client.journalArticle.deleteMany({
          where: { id: { in: createdJournalIds } },
        });
      }

      if (createdVariantIds.length > 0) {
        await prisma.client.inventoryMovement.deleteMany({
          where: { variantId: { in: createdVariantIds } },
        });
        await prisma.client.inventoryLevel.deleteMany({
          where: { variantId: { in: createdVariantIds } },
        });
      }

      if (createdProductIds.length > 0) {
        await prisma.client.product.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }

      if (createdIdempotencyActors.length > 0) {
        await prisma.client.idempotencyRecord.deleteMany({
          where: { actorScope: { in: createdIdempotencyActors } },
        });
      }

      if (createdUserIds.length > 0) {
        await prisma.client.mfaRecoveryCode.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.client.session.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.client.address.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.client.userRole.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.client.user.updateMany({
          where: { id: { in: createdUserIds } },
          data: { status: UserStatus.SUSPENDED },
        });
      }
    }

    if (redis) {
      await redis.flushdb();
    }
    if (app) {
      await app.close();
    }
  });

  async function clearThrottleBuckets(): Promise<void> {
    if (!redis) {
      return;
    }
    const keys = await redis.keys('throttle:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  function uniqueSuffix(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function nextIdemKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function issuePreAuthCsrf(): Promise<{ cookieHeader: string; csrfToken: string }> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/csrf-token')
      .set('Origin', config.APP_URL)
      .expect(200);
    const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cookieHeader = cookies.map((c) => c.split(';')[0]!).join('; ');
    const body = res.body as { data: { csrfToken: string } };
    return { cookieHeader, csrfToken: body.data.csrfToken };
  }

  async function seedAdminActor(
    roleCode: AdminRoleCode,
    mfaVerifiedAt: Date | null = new Date(),
  ): Promise<AdminSessionHandle> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: roleCode },
    });
    const suffix = uniqueSuffix(roleCode.toLowerCase());
    const email = `p6-sec-${suffix}@arven.local`;
    const totpSecret = generateSecret();
    const user = await prisma.client.user.create({
      data: {
        email,
        passwordHash: 'argon2id-test-placeholder',
        fullName: `Phase06 Security ${roleCode}`,
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        mfaEnabled: true,
        mfaSecretEncrypted: tokenCrypto.encryptTotpSecret(totpSecret),
        userRoles: { create: { roleId: role.id } },
      },
    });
    createdUserIds.push(user.id);
    createdIdempotencyActors.push(`admin:${user.id}`);

    const rawToken = `raw-p6-sec-admin-${user.id}-${suffix}`;
    const tokenHash = tokenCrypto.sha256Hex(rawToken);
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();

    await prisma.client.session.create({
      data: {
        userId: user.id,
        scope: SessionScope.ADMIN,
        tokenHash,
        csrfSecret,
        mfaVerifiedAt,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    const cookieName = sessionStore.getCookieName(SessionScope.ADMIN);
    return {
      roleCode,
      userId: user.id,
      email,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
      totpSecret,
    };
  }

  async function seedAllSevenAdmins(): Promise<Record<AdminRoleCode, AdminSessionHandle>> {
    const entries = await Promise.all(
      ADMIN_ROLE_CODES.map(async (roleCode) => [roleCode, await seedAdminActor(roleCode)] as const),
    );
    return Object.fromEntries(entries) as Record<AdminRoleCode, AdminSessionHandle>;
  }

  async function seedCustomerActor(opts?: {
    email?: string;
    fullName?: string;
    phone?: string;
  }): Promise<CustomerSessionHandle> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: 'CUSTOMER' satisfies RoleCode },
    });
    const suffix = uniqueSuffix('cust');
    const email = opts?.email ?? `p6-sec-${suffix}@arven.local`;
    const fullName = opts?.fullName ?? 'Alyssa Hartono';
    const phone = opts?.phone ?? '+6281234567890';

    const user = await prisma.client.user.create({
      data: {
        email,
        passwordHash: 'argon2id-test-placeholder',
        fullName,
        phone,
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        userRoles: { create: { roleId: role.id } },
      },
    });
    createdUserIds.push(user.id);
    createdIdempotencyActors.push(`user:${user.id}`);

    const rawToken = `raw-p6-sec-cust-${user.id}-${suffix}`;
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();
    await prisma.client.session.create({
      data: {
        userId: user.id,
        scope: SessionScope.CUSTOMER,
        tokenHash: tokenCrypto.sha256Hex(rawToken),
        csrfSecret,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    const cookieName = sessionStore.getCookieName(SessionScope.CUSTOMER);
    return {
      userId: user.id,
      email,
      fullName,
      phone,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
    };
  }

  async function seedVariant(opts: { priceIdr: number; stock: number }) {
    const suffix = uniqueSuffix('var');
    const product = await prisma.client.product.create({
      data: {
        slug: `p6-sec-garment-${suffix}`,
        name: `ARVEN Silk Atelier Coat ${suffix}`,
        description: 'Architectural garment for Phase 06 security verification.',
        material: '100% Mulberry Silk',
        fit: 'Tailored Fit',
        careInstruction: 'Dry clean only.',
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        publishedAt: new Date(),
        variants: {
          create: {
            sku: `ARV-P6SEC-${suffix}`.slice(0, 48).toUpperCase(),
            size: 'M',
            color: 'Charcoal',
            colorHex: '#17191B',
            priceIdr: BigInt(opts.priceIdr),
            weightGrams: 750,
            isActive: true,
          },
        },
      },
      include: { variants: true },
    });

    const variant = product.variants[0]!;
    createdProductIds.push(product.id);
    createdVariantIds.push(variant.id);

    await prisma.client.inventoryLevel.create({
      data: {
        warehouseId,
        variantId: variant.id,
        quantityOnHand: opts.stock,
        quantityReserved: 0,
        lowStockThreshold: 2,
      },
    });

    return variant;
  }

  async function seedOrderWithPayment(opts: {
    userId: string | null;
    guestEmail?: string | null;
    guestToken?: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    items: Array<{
      variantId: string;
      sku: string;
      name: string;
      unitPriceIdr: number;
      quantity: number;
    }>;
    withActiveReservation?: boolean;
    recipientName?: string;
    phone?: string;
    addressLine1?: string;
    deliveredAt?: Date;
  }) {
    const suffix = uniqueSuffix('ord');
    const orderNumber = `ARV-S6-${suffix.slice(-10).toUpperCase()}`;
    const subtotalIdr = opts.items.reduce(
      (sum, item) => sum + item.unitPriceIdr * item.quantity,
      0,
    );
    const shippingTotalIdr = 25_000;
    const grandTotalIdr = subtotalIdr + shippingTotalIdr;
    const now = new Date();
    const guestTokenHash = opts.guestToken
      ? tokenCrypto.sha256Hex(opts.guestToken)
      : null;
    if (opts.guestToken) {
      createdIdempotencyActors.push(
        `guest:${tokenCrypto.sha256Hex(opts.guestToken).slice(0, 24)}`,
      );
    }

    const order = await prisma.client.order.create({
      data: {
        orderNumber,
        userId: opts.userId,
        guestEmail: opts.guestEmail ?? null,
        guestTokenHash,
        status: opts.status,
        currency: 'IDR',
        subtotalIdr: BigInt(subtotalIdr),
        discountTotalIdr: 0n,
        shippingTotalIdr: BigInt(shippingTotalIdr),
        taxTotalIdr: 0n,
        grandTotalIdr: BigInt(grandTotalIdr),
        shippingProvider: 'jne-adapter',
        shippingService: 'REG',
        addressSnapshot: {
          recipientName: opts.recipientName ?? 'Alyssa Hartono',
          phone: opts.phone ?? '+6281234567890',
          line1: opts.addressLine1 ?? 'Jl. Kemang Raya No. 42',
          line2: 'Suite 9B',
          subdistrict: 'Mampang Prapatan',
          city: 'Jakarta Selatan',
          province: 'DKI Jakarta',
          postalCode: '12730',
          countryCode: 'ID',
        },
        paymentExpiresAt: new Date(now.getTime() + 15 * 60_000),
        paidAt: opts.paymentStatus === PaymentStatus.SETTLEMENT ? now : null,
        items: {
          create: opts.items.map((item) => ({
            variantId: item.variantId,
            skuSnapshot: item.sku,
            productNameSnapshot: item.name,
            sizeSnapshot: 'M',
            colorSnapshot: 'Charcoal',
            unitPriceIdr: BigInt(item.unitPriceIdr),
            discountAllocatedIdr: 0n,
            quantity: item.quantity,
            lineTotalIdr: BigInt(item.unitPriceIdr * item.quantity),
          })),
        },
        payments: {
          create: {
            provider: 'midtrans',
            providerReference: `${orderNumber}-MID-REF`,
            providerTransactionId: `mid-tx-${suffix}`,
            method: 'bank_transfer',
            status: opts.paymentStatus,
            amountIdr: BigInt(grandTotalIdr),
            currency: 'IDR',
            snapToken: `secret-snap-token-${suffix}`,
            redirectUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${suffix}`,
            expiresAt: new Date(now.getTime() + 15 * 60_000),
            settledAt: opts.paymentStatus === PaymentStatus.SETTLEMENT ? now : null,
          },
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: opts.status,
            reason: 'Seeded for Phase 06 security verification',
            actorType: 'SYSTEM',
            ...(opts.deliveredAt ? { createdAt: opts.deliveredAt } : {}),
          },
        },
      },
      include: { items: true, payments: true },
    });
    createdOrderIds.push(order.id);

    if (opts.withActiveReservation) {
      for (const item of opts.items) {
        await prisma.client.inventoryLevel.update({
          where: {
            warehouseId_variantId: {
              warehouseId,
              variantId: item.variantId,
            },
          },
          data: {
            quantityReserved: { increment: item.quantity },
          },
        });
        await prisma.client.stockReservation.create({
          data: {
            orderId: order.id,
            warehouseId,
            variantId: item.variantId,
            quantity: item.quantity,
            status: StockReservationStatus.ACTIVE,
            expiresAt: new Date(now.getTime() + 15 * 60_000),
          },
        });
      }
    }

    return order;
  }

  async function seedReturnRecord(opts: {
    orderId: string;
    orderItemId: string;
    userId: string | null;
    quantity: number;
    status: ReturnStatus;
  }) {
    const created = await prisma.client.return.create({
      data: {
        orderId: opts.orderId,
        userId: opts.userId,
        status: opts.status,
        reason: 'Sizing adjustment requested',
        customerNotes: 'Unworn garment with tags intact',
        evidenceKeys: [],
        items: {
          create: {
            orderItemId: opts.orderItemId,
            quantity: opts.quantity,
          },
        },
      },
      include: { items: true },
    });
    createdReturnIds.push(created.id);
    return created;
  }

  describe('1. Full 7-Role Admin RBAC + CUSTOMER + Anonymous Matrix Across Phase 06 Endpoints', () => {
    it('enforces unauthenticated 401, CUSTOMER 401/403 isolation, and MFA_REQUIRED 401 on /admin/* routes', async () => {
      const customer = await seedCustomerActor();
      const unverifiedAdmin = await seedAdminActor('OWNER', null);
      const preAuth = await issuePreAuthCsrf();

      const adminGetRoutes = [
        '/api/v1/admin/orders',
        '/api/v1/admin/returns',
        '/api/v1/admin/refunds',
        '/api/v1/admin/coupons',
        '/api/v1/admin/cms/pages',
        '/api/v1/admin/cms/lookbooks',
        '/api/v1/admin/cms/journal',
        '/api/v1/admin/analytics/sales',
      ];

      for (const route of adminGetRoutes) {
        const anonRes = await request(app.getHttpServer()).get(route);
        expect(anonRes.status).toBe(401);
        expect(anonRes.body.error.code).toBe('UNAUTHORIZED');

        const custRes = await request(app.getHttpServer())
          .get(route)
          .set('Cookie', customer.cookieHeader);
        expect(custRes.status).toBe(401);
        expect(custRes.body.error.code).toBe('UNAUTHORIZED');

        const unverifiedRes = await request(app.getHttpServer())
          .get(route)
          .set('Cookie', unverifiedAdmin.cookieHeader);
        expect(unverifiedRes.status).toBe(401);
        expect(unverifiedRes.body.error.code).toBe('MFA_REQUIRED');
      }

      // Unauthenticated & CUSTOMER state-changing requests to /admin/* must fail closed
      const anonMutateRes = await request(app.getHttpServer())
        .post('/api/v1/admin/coupons')
        .set('Origin', config.APP_URL)
        .set('Cookie', preAuth.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, preAuth.csrfToken)
        .send({
          code: 'ANONHACK',
          name: 'Blocked',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          startsAt: '2026-01-01T00:00:00Z',
          endsAt: '2029-12-31T23:59:59Z',
        });
      expect(anonMutateRes.status).toBe(401);

      // CUSTOMER sending their own session cookie without admin cookie fails CSRF/SessionAuth
      const custMutateNoPreAuthRes = await request(app.getHttpServer())
        .post('/api/v1/admin/coupons')
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .send({});
      expect(custMutateNoPreAuthRes.status).toBe(403);
      expect(custMutateNoPreAuthRes.body.error.code).toBe('CSRF_INVALID');

      const custMutateWithPreAuthRes = await request(app.getHttpServer())
        .post('/api/v1/admin/coupons')
        .set('Origin', config.APP_URL)
        .set('Cookie', `${customer.cookieHeader}; ${preAuth.cookieHeader}`)
        .set(HTTP_HEADERS.CSRF_TOKEN, preAuth.csrfToken)
        .send({});
      expect(custMutateWithPreAuthRes.status).toBe(401);
    });

    it('enforces Orders & Shipments 7-role RBAC matrix including SUPPORT post-shipment cancel guard', async () => {
      const admins = await seedAllSevenAdmins();
      const customer = await seedCustomerActor();
      const preAuth = await issuePreAuthCsrf();
      const variant = await seedVariant({ priceIdr: 800_000, stock: 20 });

      const sampleOrder = await seedOrderWithPayment({
        userId: customer.userId,
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.SETTLEMENT,
        items: [
          {
            variantId: variant.id,
            sku: variant.sku,
            name: 'Silk Coat',
            unitPriceIdr: 800_000,
            quantity: 1,
          },
        ],
      });

      // GET /admin/orders & GET /admin/orders/:id
      const orderReadAllowed = new Set<AdminRoleCode>([
        'OWNER',
        'MANAGER',
        'PRODUCT',
        'INVENTORY',
        'ORDER',
        'SUPPORT',
      ]);

      for (const roleCode of ADMIN_ROLE_CODES) {
        const listRes = await request(app.getHttpServer())
          .get('/api/v1/admin/orders')
          .set('Cookie', admins[roleCode].cookieHeader);
        const detailRes = await request(app.getHttpServer())
          .get(`/api/v1/admin/orders/${sampleOrder.id}`)
          .set('Cookie', admins[roleCode].cookieHeader);

        if (orderReadAllowed.has(roleCode)) {
          expect(listRes.status).toBe(200);
          expect(detailRes.status).toBe(200);
        } else {
          expect(listRes.status).toBe(403);
          expect(listRes.body.error.code).toBe('FORBIDDEN');
          expect(detailRes.status).toBe(403);
          expect(detailRes.body.error.code).toBe('FORBIDDEN');
        }
      }

      // POST /admin/orders/:id/transition (fulfillment -> PROCESSING / READY_TO_SHIP)
      const fulfillAllowed = new Set<AdminRoleCode>(['OWNER', 'MANAGER', 'ORDER']);
      for (const roleCode of ADMIN_ROLE_CODES) {
        const targetOrder = fulfillAllowed.has(roleCode)
          ? await seedOrderWithPayment({
              userId: customer.userId,
              status: OrderStatus.PAID,
              paymentStatus: PaymentStatus.SETTLEMENT,
              items: [
                {
                  variantId: variant.id,
                  sku: variant.sku,
                  name: 'Silk Coat',
                  unitPriceIdr: 800_000,
                  quantity: 1,
                },
              ],
            })
          : sampleOrder;

        const res = await request(app.getHttpServer())
          .post(`/api/v1/admin/orders/${targetOrder.id}/transition`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .send({ toStatus: 'PROCESSING', reason: 'RBAC fulfillment test' });

        if (fulfillAllowed.has(roleCode)) {
          expect(res.status).toBe(200);
          expect(res.body.data.status).toBe('PROCESSING');

          const rtsRes = await request(app.getHttpServer())
            .post(`/api/v1/admin/orders/${targetOrder.id}/transition`)
            .set('Origin', config.APP_URL)
            .set('Cookie', admins[roleCode].cookieHeader)
            .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
            .send({ toStatus: 'READY_TO_SHIP', reason: 'Ready for courier' });
          expect(rtsRes.status).toBe(200);
          expect(rtsRes.body.data.status).toBe('READY_TO_SHIP');
        } else {
          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('FORBIDDEN');
        }
      }

      // POST /admin/orders/:id/transition (cancel PENDING_PAYMENT)
      const cancelAllowed = new Set<AdminRoleCode>([
        'OWNER',
        'MANAGER',
        'ORDER',
        'SUPPORT',
      ]);
      for (const roleCode of ADMIN_ROLE_CODES) {
        const pendingOrder = await seedOrderWithPayment({
          userId: customer.userId,
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.PENDING,
          items: [
            {
              variantId: variant.id,
              sku: variant.sku,
              name: 'Silk Coat',
              unitPriceIdr: 800_000,
              quantity: 1,
            },
          ],
          withActiveReservation: true,
        });

        const res = await request(app.getHttpServer())
          .post(`/api/v1/admin/orders/${pendingOrder.id}/transition`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .send({ toStatus: 'CANCELLED', reason: 'Pre-shipment cancel test' });

        if (cancelAllowed.has(roleCode)) {
          expect(res.status).toBe(200);
          expect(res.body.data.status).toBe('CANCELLED');
        } else {
          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('FORBIDDEN');
        }
      }

      // SUPPORT strictly blocked from cancelling post-shipment (SHIPPED, DELIVERED, COMPLETED)
      for (const protectedStatus of [
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
        OrderStatus.COMPLETED,
      ]) {
        const protectedOrder = await seedOrderWithPayment({
          userId: customer.userId,
          status: protectedStatus,
          paymentStatus: PaymentStatus.SETTLEMENT,
          items: [
            {
              variantId: variant.id,
              sku: variant.sku,
              name: 'Silk Coat',
              unitPriceIdr: 800_000,
              quantity: 1,
            },
          ],
        });

        const supportCancelRes = await request(app.getHttpServer())
          .post(`/api/v1/admin/orders/${protectedOrder.id}/transition`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins.SUPPORT.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins.SUPPORT.csrfToken)
          .send({ toStatus: 'CANCELLED', reason: 'Attempt post-shipment cancel' });

        expect(supportCancelRes.status).toBe(403);
        expect(supportCancelRes.body.error.code).toBe('FORBIDDEN');
      }

      await clearThrottleBuckets();

      // Shipments: POST /admin/orders/:id/shipments & POST /admin/shipments/:id/sync-tracking
      let lastShipmentId = '';
      for (const roleCode of ADMIN_ROLE_CODES) {
        const shipOrder = fulfillAllowed.has(roleCode)
          ? await seedOrderWithPayment({
              userId: customer.userId,
              status: OrderStatus.READY_TO_SHIP,
              paymentStatus: PaymentStatus.SETTLEMENT,
              items: [
                {
                  variantId: variant.id,
                  sku: variant.sku,
                  name: 'Silk Coat',
                  unitPriceIdr: 800_000,
                  quantity: 1,
                },
              ],
            })
          : sampleOrder;

        const shipRes = await request(app.getHttpServer())
          .post(`/api/v1/admin/orders/${shipOrder.id}/shipments`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey(`ship-${roleCode}`))
          .send({
            provider: 'jne-adapter',
            serviceCode: 'REG',
            warehouseCode: DEFAULT_WAREHOUSE_CODE,
          });

        if (fulfillAllowed.has(roleCode)) {
          expect(shipRes.status).toBe(201);
          lastShipmentId = shipRes.body.data.id as string;
          createdShipmentIds.push(lastShipmentId);
        } else {
          expect(shipRes.status).toBe(403);
          expect(shipRes.body.error.code).toBe('FORBIDDEN');
        }
      }

      // CUSTOMER & ANON on shipment creation -> 401
      const anonShipRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${sampleOrder.id}/shipments`)
        .set('Origin', config.APP_URL)
        .set('Cookie', preAuth.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, preAuth.csrfToken)
        .send({ provider: 'jne-adapter', serviceCode: 'REG' });
      expect(anonShipRes.status).toBe(401);

      const custShipRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${sampleOrder.id}/shipments`)
        .set('Origin', config.APP_URL)
        .set('Cookie', `${customer.cookieHeader}; ${preAuth.cookieHeader}`)
        .set(HTTP_HEADERS.CSRF_TOKEN, preAuth.csrfToken)
        .send({ provider: 'jne-adapter', serviceCode: 'REG' });
      expect(custShipRes.status).toBe(401);

      // POST /admin/shipments/:id/sync-tracking
      for (const roleCode of ADMIN_ROLE_CODES) {
        const syncRes = await request(app.getHttpServer())
          .post(`/api/v1/admin/shipments/${lastShipmentId}/sync-tracking`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .send({});

        if (fulfillAllowed.has(roleCode)) {
          expect(syncRes.status).toBe(200);
        } else {
          expect(syncRes.status).toBe(403);
          expect(syncRes.body.error.code).toBe('FORBIDDEN');
        }
      }
    });

    it('enforces Returns & Refunds 7-role RBAC matrix (OWNER-only refund.approve)', async () => {
      const admins = await seedAllSevenAdmins();
      const customer = await seedCustomerActor();
      const variant = await seedVariant({ priceIdr: 600_000, stock: 15 });

      const order = await seedOrderWithPayment({
        userId: customer.userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.SETTLEMENT,
        items: [
          {
            variantId: variant.id,
            sku: variant.sku,
            name: 'Silk Coat',
            unitPriceIdr: 600_000,
            quantity: 2,
          },
        ],
      });
      const orderItemId = order.items[0]!.id;

      const sampleReturn = await seedReturnRecord({
        orderId: order.id,
        orderItemId,
        userId: customer.userId,
        quantity: 1,
        status: ReturnStatus.REQUESTED,
      });

      // GET /admin/returns & GET /admin/returns/:id
      const returnReadAllowed = new Set<AdminRoleCode>([
        'OWNER',
        'MANAGER',
        'INVENTORY',
        'ORDER',
        'SUPPORT',
      ]);
      for (const roleCode of ADMIN_ROLE_CODES) {
        const listRes = await request(app.getHttpServer())
          .get('/api/v1/admin/returns')
          .set('Cookie', admins[roleCode].cookieHeader);
        const detailRes = await request(app.getHttpServer())
          .get(`/api/v1/admin/returns/${sampleReturn.id}`)
          .set('Cookie', admins[roleCode].cookieHeader);

        if (returnReadAllowed.has(roleCode)) {
          expect(listRes.status).toBe(200);
          expect(detailRes.status).toBe(200);
        } else {
          expect(listRes.status).toBe(403);
          expect(detailRes.status).toBe(403);
        }
      }

      // POST /admin/returns/:id/review -> OWNER, MANAGER, SUPPORT only
      const returnReviewAllowed = new Set<AdminRoleCode>([
        'OWNER',
        'MANAGER',
        'SUPPORT',
      ]);
      for (const roleCode of ADMIN_ROLE_CODES) {
        const targetReturn = returnReviewAllowed.has(roleCode)
          ? await seedReturnRecord({
              orderId: order.id,
              orderItemId,
              userId: customer.userId,
              quantity: 1,
              status: ReturnStatus.REQUESTED,
            })
          : sampleReturn;

        const res = await request(app.getHttpServer())
          .post(`/api/v1/admin/returns/${targetReturn.id}/review`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .send({ notes: 'Eligibility verified' });

        if (returnReviewAllowed.has(roleCode)) {
          expect(res.status).toBe(200);
          expect(res.body.data.status).toBe('UNDER_REVIEW');
        } else {
          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('FORBIDDEN');
        }
      }

      // POST /admin/returns/:id/approve -> OWNER, MANAGER only (SUPPORT & INVENTORY blocked!)
      const returnApproveAllowed = new Set<AdminRoleCode>(['OWNER', 'MANAGER']);
      for (const roleCode of ADMIN_ROLE_CODES) {
        const targetReturn = await seedReturnRecord({
          orderId: order.id,
          orderItemId,
          userId: customer.userId,
          quantity: 1,
          status: ReturnStatus.UNDER_REVIEW,
        });

        const res = await request(app.getHttpServer())
          .post(`/api/v1/admin/returns/${targetReturn.id}/approve`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .send({ decision: 'APPROVE', adminNotes: 'Approved for inspection' });

        if (returnApproveAllowed.has(roleCode)) {
          expect(res.status).toBe(200);
          expect(res.body.data.status).toBe('APPROVED');
        } else {
          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('FORBIDDEN');
        }
      }

      // POST /admin/returns/:id/receive -> OWNER, MANAGER, INVENTORY only
      const returnReceiveAllowed = new Set<AdminRoleCode>([
        'OWNER',
        'MANAGER',
        'INVENTORY',
      ]);
      for (const roleCode of ADMIN_ROLE_CODES) {
        const targetReturn = await seedReturnRecord({
          orderId: order.id,
          orderItemId,
          userId: customer.userId,
          quantity: 1,
          status: ReturnStatus.APPROVED,
        });

        const res = await request(app.getHttpServer())
          .post(`/api/v1/admin/returns/${targetReturn.id}/receive`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey(`recv-${roleCode}`))
          .send({
            warehouseCode: DEFAULT_WAREHOUSE_CODE,
            items: [
              {
                returnItemId: targetReturn.items[0]!.id,
                condition: 'DAMAGED',
                restock: false,
              },
            ],
          });

        if (returnReceiveAllowed.has(roleCode)) {
          expect(res.status).toBe(200);
          expect(res.body.data.status).toBe('RECEIVED');
        } else {
          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('FORBIDDEN');
        }
      }

      await clearThrottleBuckets();

      // Refunds: GET /admin/refunds & POST /admin/orders/:id/refunds/request & POST /admin/refunds/:id/approve
      const refundRequestAllowed = new Set<AdminRoleCode>([
        'OWNER',
        'MANAGER',
        'ORDER',
        'SUPPORT',
      ]);
      for (const roleCode of ADMIN_ROLE_CODES) {
        const listRes = await request(app.getHttpServer())
          .get('/api/v1/admin/refunds')
          .set('Cookie', admins[roleCode].cookieHeader);
        if (refundRequestAllowed.has(roleCode)) {
          expect(listRes.status).toBe(200);
        } else {
          expect(listRes.status).toBe(403);
        }
      }

      const refundIdsByRole: Partial<Record<AdminRoleCode, string>> = {};
      for (const roleCode of ADMIN_ROLE_CODES) {
        const reqRes = await request(app.getHttpServer())
          .post(`/api/v1/admin/orders/${order.id}/refunds/request`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey(`rf-req-${roleCode}`))
          .send({
            amountIdr: 100_000,
            reason: `Refund requested by ${roleCode}`,
          });

        if (refundRequestAllowed.has(roleCode)) {
          expect(reqRes.status).toBe(201);
          expect(reqRes.body.data.status).toBe('REQUESTED');
          const refundId = reqRes.body.data.id as string;
          refundIdsByRole[roleCode] = refundId;
          createdRefundIds.push(refundId);
        } else {
          expect(reqRes.status).toBe(403);
          expect(reqRes.body.error.code).toBe('FORBIDDEN');
        }
      }

      const targetRefundId = refundIdsByRole.SUPPORT!;
      // ONLY OWNER can approve refunds; all other 6 admin roles strictly 403 FORBIDDEN
      for (const roleCode of ADMIN_ROLE_CODES) {
        const approveRes = await request(app.getHttpServer())
          .post(`/api/v1/admin/refunds/${targetRefundId}/approve`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey(`rf-app-${roleCode}`))
          .send({ decision: 'APPROVE' });

        if (roleCode === 'OWNER') {
          expect(approveRes.status).toBe(200);
          expect(approveRes.body.data.status).toBe('SUCCEEDED');
        } else {
          expect(approveRes.status).toBe(403);
          expect(approveRes.body.error.code).toBe('FORBIDDEN');
        }
      }
    });

    it('enforces Coupons, CMS & Analytics 7-role RBAC matrix including SUPPORT limited analytics view', async () => {
      const admins = await seedAllSevenAdmins();
      const customer = await seedCustomerActor();
      const variant = await seedVariant({ priceIdr: 500_000, stock: 5 });

      await seedOrderWithPayment({
        userId: customer.userId,
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.SETTLEMENT,
        items: [
          {
            variantId: variant.id,
            sku: variant.sku,
            name: 'Analytics Garment',
            unitPriceIdr: 500_000,
            quantity: 1,
          },
        ],
      });

      // Coupons: GET /admin/coupons vs POST/PATCH/DELETE
      const couponReadAllowed = new Set<AdminRoleCode>([
        'OWNER',
        'MANAGER',
        'PRODUCT',
        'ORDER',
        'SUPPORT',
      ]);
      const couponManageAllowed = new Set<AdminRoleCode>(['OWNER', 'MANAGER']);

      for (const roleCode of ADMIN_ROLE_CODES) {
        const listRes = await request(app.getHttpServer())
          .get('/api/v1/admin/coupons')
          .set('Cookie', admins[roleCode].cookieHeader);
        if (couponReadAllowed.has(roleCode)) {
          expect(listRes.status).toBe(200);
        } else {
          expect(listRes.status).toBe(403);
        }

        const createRes = await request(app.getHttpServer())
          .post('/api/v1/admin/coupons')
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .send({
            code: `SEC-${roleCode}-${Date.now().toString().slice(-4)}`,
            name: `Security Coupon ${roleCode}`,
            discountType: 'PERCENTAGE',
            discountValue: 15,
            minOrderSubtotalIdr: 100_000,
            status: 'DRAFT',
            startsAt: '2026-01-01T00:00:00Z',
            endsAt: '2029-12-31T23:59:59Z',
          });

        if (couponManageAllowed.has(roleCode)) {
          expect(createRes.status).toBe(201);
          const couponId = createRes.body.data.id as string;
          createdCouponIds.push(couponId);

          const patchRes = await request(app.getHttpServer())
            .patch(`/api/v1/admin/coupons/${couponId}`)
            .set('Origin', config.APP_URL)
            .set('Cookie', admins[roleCode].cookieHeader)
            .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
            .send({ status: 'ACTIVE' });
          expect(patchRes.status).toBe(200);

          const delRes = await request(app.getHttpServer())
            .delete(`/api/v1/admin/coupons/${couponId}`)
            .set('Origin', config.APP_URL)
            .set('Cookie', admins[roleCode].cookieHeader)
            .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken);
          expect(delRes.status).toBe(204);
        } else {
          expect(createRes.status).toBe(403);
          expect(createRes.body.error.code).toBe('FORBIDDEN');
        }
      }

      // Ensure non-manager cannot PATCH/DELETE an existing coupon
      const seededCoupon = await prisma.client.coupon.create({
        data: {
          code: `SECBACK${Date.now().toString().slice(-5)}`,
          name: 'Protected Coupon',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 50_000n,
          minOrderSubtotalIdr: 200_000n,
          status: CouponStatus.ACTIVE,
          startsAt: new Date('2026-01-01T00:00:00Z'),
          endsAt: new Date('2029-12-31T23:59:59Z'),
        },
      });
      createdCouponIds.push(seededCoupon.id);

      for (const blockedRole of ['PRODUCT', 'ORDER', 'SUPPORT', 'INVENTORY', 'CONTENT'] as const) {
        const patchBlocked = await request(app.getHttpServer())
          .patch(`/api/v1/admin/coupons/${seededCoupon.id}`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[blockedRole].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[blockedRole].csrfToken)
          .send({ name: 'Tampered' });
        expect(patchBlocked.status).toBe(403);

        const delBlocked = await request(app.getHttpServer())
          .delete(`/api/v1/admin/coupons/${seededCoupon.id}`)
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[blockedRole].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[blockedRole].csrfToken);
        expect(delBlocked.status).toBe(403);
      }

      await clearThrottleBuckets();

      // CMS: read (OWNER, MANAGER, PRODUCT, CONTENT) vs write/publish (OWNER, MANAGER, CONTENT)
      const cmsReadAllowed = new Set<AdminRoleCode>([
        'OWNER',
        'MANAGER',
        'PRODUCT',
        'CONTENT',
      ]);
      const cmsWriteAllowed = new Set<AdminRoleCode>(['OWNER', 'MANAGER', 'CONTENT']);

      for (const roleCode of ADMIN_ROLE_CODES) {
        const readPagesRes = await request(app.getHttpServer())
          .get('/api/v1/admin/cms/pages')
          .set('Cookie', admins[roleCode].cookieHeader);
        const readJournalRes = await request(app.getHttpServer())
          .get('/api/v1/admin/cms/journal')
          .set('Cookie', admins[roleCode].cookieHeader);
        const readLookbooksRes = await request(app.getHttpServer())
          .get('/api/v1/admin/cms/lookbooks')
          .set('Cookie', admins[roleCode].cookieHeader);

        if (cmsReadAllowed.has(roleCode)) {
          expect(readPagesRes.status).toBe(200);
          expect(readJournalRes.status).toBe(200);
          expect(readLookbooksRes.status).toBe(200);
        } else {
          expect(readPagesRes.status).toBe(403);
          expect(readJournalRes.status).toBe(403);
          expect(readLookbooksRes.status).toBe(403);
        }

        const slug = `p6-sec-journal-${roleCode.toLowerCase()}-${Date.now()}`;
        const createJournalRes = await request(app.getHttpServer())
          .post('/api/v1/admin/cms/journal')
          .set('Origin', config.APP_URL)
          .set('Cookie', admins[roleCode].cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
          .send({
            slug,
            title: `Editorial ${roleCode}`,
            excerpt: 'Architectural tailoring study',
            body: { paragraphs: ['Tailored cashmere craftsmanship.'] },
          });

        if (cmsWriteAllowed.has(roleCode)) {
          expect(createJournalRes.status).toBe(201);
          const journalId = createJournalRes.body.data.id as string;
          createdJournalIds.push(journalId);

          const previewRes = await request(app.getHttpServer())
            .post(`/api/v1/admin/cms/journal/${journalId}/transition`)
            .set('Origin', config.APP_URL)
            .set('Cookie', admins[roleCode].cookieHeader)
            .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
            .send({ toStatus: 'PREVIEW' });
          expect(previewRes.status).toBe(200);
          expect(previewRes.body.data.status).toBe('PREVIEW');

          const publishRes = await request(app.getHttpServer())
            .post(`/api/v1/admin/cms/journal/${journalId}/transition`)
            .set('Origin', config.APP_URL)
            .set('Cookie', admins[roleCode].cookieHeader)
            .set(HTTP_HEADERS.CSRF_TOKEN, admins[roleCode].csrfToken)
            .send({ toStatus: 'PUBLISHED' });
          expect(publishRes.status).toBe(200);
          expect(publishRes.body.data.status).toBe('PUBLISHED');
        } else {
          expect(createJournalRes.status).toBe(403);
          expect(createJournalRes.body.error.code).toBe('FORBIDDEN');
        }
      }

      // PRODUCT has cms.read ONLY — verify PRODUCT cannot patch or transition CMS records
      const contentJournalId = createdJournalIds[createdJournalIds.length - 1]!;
      const productPatchCms = await request(app.getHttpServer())
        .patch(`/api/v1/admin/cms/journal/${contentJournalId}`)
        .set('Origin', config.APP_URL)
        .set('Cookie', admins.PRODUCT.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, admins.PRODUCT.csrfToken)
        .send({ title: 'Unauthorized Edit' });
      expect(productPatchCms.status).toBe(403);

      const productArchiveCms = await request(app.getHttpServer())
        .post(`/api/v1/admin/cms/journal/${contentJournalId}/transition`)
        .set('Origin', config.APP_URL)
        .set('Cookie', admins.PRODUCT.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, admins.PRODUCT.csrfToken)
        .send({ toStatus: 'ARCHIVED' });
      expect(productArchiveCms.status).toBe(403);

      // Analytics: GET /admin/analytics/sales
      const fullAnalyticsRoles = new Set<AdminRoleCode>(['OWNER', 'MANAGER', 'ORDER']);
      for (const roleCode of ADMIN_ROLE_CODES) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/admin/analytics/sales?days=30')
          .set('Cookie', admins[roleCode].cookieHeader);

        if (fullAnalyticsRoles.has(roleCode)) {
          expect(res.status).toBe(200);
          expect(res.body.data.limitedView).toBe(false);
          expect(typeof res.body.data.grossSalesIdr).toBe('number');
          expect(typeof res.body.data.netSalesIdr).toBe('number');
          expect(typeof res.body.data.averageOrderValueIdr).toBe('number');
          expect(typeof res.body.data.paymentSuccessRatePct).toBe('number');
          expect(typeof res.body.data.returnRatePct).toBe('number');
        } else if (roleCode === 'SUPPORT') {
          expect(res.status).toBe(200);
          expect(res.body.data.limitedView).toBe(true);
          expect(typeof res.body.data.totalOrders).toBe('number');
          expect(res.body.data.grossSalesIdr).toBeNull();
          expect(res.body.data.netSalesIdr).toBeNull();
          expect(res.body.data.totalRefundedIdr).toBeNull();
          expect(res.body.data.averageOrderValueIdr).toBeNull();
          expect(res.body.data.paymentSuccessRatePct).toBeNull();
          expect(res.body.data.returnRatePct).toBeNull();
          for (const point of res.body.data.dailySeries as Array<{
            grossSalesIdr: number | null;
            netSalesIdr: number | null;
          }>) {
            expect(point.grossSalesIdr).toBeNull();
            expect(point.netSalesIdr).toBeNull();
          }
        } else {
          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('FORBIDDEN');
        }
      }
    });
  });

  describe('2. SUPPORT PII Masking & Gateway Redaction vs Operational View', () => {
    it('masks email, phone, and address and redacts payment/gateway payloads for SUPPORT while keeping operational view free of secrets', async () => {
      const support = await seedAdminActor('SUPPORT');
      const owner = await seedAdminActor('OWNER');
      const orderAdmin = await seedAdminActor('ORDER');
      const productAdmin = await seedAdminActor('PRODUCT');

      const rawEmail = `alyssa.hartono.${Date.now()}@example-luxury.id`;
      const rawPhone = '+6281234567890';
      const rawRecipient = 'Alyssa Hartono';
      const rawAddressLine1 = 'Jl. Kemang Raya No. 42 Private';

      const customer = await seedCustomerActor({
        email: rawEmail,
        fullName: rawRecipient,
        phone: rawPhone,
      });
      const variant = await seedVariant({ priceIdr: 1_250_000, stock: 5 });

      const order = await seedOrderWithPayment({
        userId: customer.userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.SETTLEMENT,
        recipientName: rawRecipient,
        phone: rawPhone,
        addressLine1: rawAddressLine1,
        items: [
          {
            variantId: variant.id,
            sku: variant.sku,
            name: 'Wool Trench',
            unitPriceIdr: 1_250_000,
            quantity: 1,
          },
        ],
      });

      const returnRec = await seedReturnRecord({
        orderId: order.id,
        orderItemId: order.items[0]!.id,
        userId: customer.userId,
        quantity: 1,
        status: ReturnStatus.REQUESTED,
      });

      const refundRec = await prisma.client.refund.create({
        data: {
          orderId: order.id,
          paymentId: order.payments[0]!.id,
          returnId: returnRec.id,
          refundKey: `RF-MASK-${Date.now()}`,
          providerRefundId: `mid-rf-secret-${Date.now()}`,
          status: RefundStatus.SUCCEEDED,
          amountIdr: 250_000n,
          currency: 'IDR',
          reason: 'Partial compensation',
          requestedBy: support.userId,
          approvedBy: owner.userId,
          gatewayResponse: {
            merchantToken: 'RAW_GATEWAY_SECRET_SHOULD_NOT_LEAK_TO_SUPPORT',
            channelStatus: '200',
          },
          completedAt: new Date(),
        },
      });
      createdRefundIds.push(refundRec.id);

      // 1) SUPPORT GET /admin/orders
      const supportOrdersRes = await request(app.getHttpServer())
        .get('/api/v1/admin/orders?page=1&limit=20')
        .set('Cookie', support.cookieHeader);
      expect(supportOrdersRes.status).toBe(200);
      expect(supportOrdersRes.headers['cache-control']).toBe('no-store');
      const listedOrder = (supportOrdersRes.body.data as Array<{
        id: string;
        customerEmail: string;
        recipientName: string;
        piiMasked: boolean;
      }>).find((item) => item.id === order.id);
      expect(listedOrder).toBeDefined();
      expect(listedOrder!.piiMasked).toBe(true);
      expect(listedOrder!.customerEmail).toMatch(/^a\*+@example-luxury\.id$/);
      expect(listedOrder!.customerEmail).not.toBe(rawEmail);
      expect(listedOrder!.recipientName).toBe('A*** H***');
      expect(JSON.stringify(supportOrdersRes.body)).not.toContain(rawEmail);
      expect(JSON.stringify(supportOrdersRes.body)).not.toContain(rawRecipient);

      // 2) SUPPORT GET /admin/orders/:id
      const supportOrderDetailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/orders/${order.id}`)
        .set('Cookie', support.cookieHeader);
      expect(supportOrderDetailRes.status).toBe(200);
      const detail = supportOrderDetailRes.body.data;
      expect(detail.piiMasked).toBe(true);
      expect(detail.customerEmail).toMatch(/^a\*+@example-luxury\.id$/);
      expect(detail.addressSnapshot.phone).toBe('****7890');
      expect(detail.addressSnapshot.recipientName).toBe('A*** H***');
      expect(detail.addressSnapshot.line1).toBe('Jl***');
      expect(detail.addressSnapshot.city).toBe('Jakarta Selatan');
      expect(detail.latestPayment.providerReference).toBe('gateway-redacted');
      expect(detail.latestPayment.providerTransactionId).toBeNull();
      expect(detail.latestPayment.snapToken).toBeNull();
      expect(detail.latestPayment.redirectUrl).toBeNull();
      expect(detail.refunds[0].providerRefundId).toBe('gateway-redacted');
      expect(detail.refunds[0].gatewayResponse).toBeNull();
      expect(detail.returns[0].piiMasked).toBe(true);
      expect(detail.returns[0].customerEmail).toMatch(/^a\*+@example-luxury\.id$/);

      const serializedDetail = JSON.stringify(supportOrderDetailRes.body);
      expect(serializedDetail).not.toContain(rawEmail);
      expect(serializedDetail).not.toContain(rawPhone);
      expect(serializedDetail).not.toContain(rawAddressLine1);
      expect(serializedDetail).not.toContain('secret-snap-token');
      expect(serializedDetail).not.toContain('app.sandbox.midtrans.com');
      expect(serializedDetail).not.toContain('RAW_GATEWAY_SECRET_SHOULD_NOT_LEAK_TO_SUPPORT');

      // 3) SUPPORT GET /admin/returns/:id
      const supportReturnRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/returns/${returnRec.id}`)
        .set('Cookie', support.cookieHeader);
      expect(supportReturnRes.status).toBe(200);
      expect(supportReturnRes.body.data.piiMasked).toBe(true);
      expect(supportReturnRes.body.data.customerEmail).toMatch(
        /^a\*+@example-luxury\.id$/,
      );
      expect(JSON.stringify(supportReturnRes.body)).not.toContain(rawEmail);

      // 4) SUPPORT GET /returns/:id (public/portal route accessed by admin)
      const supportPortalReturnRes = await request(app.getHttpServer())
        .get(`/api/v1/returns/${returnRec.id}`)
        .set('Cookie', support.cookieHeader);
      expect(supportPortalReturnRes.status).toBe(200);
      expect(supportPortalReturnRes.body.data.piiMasked).toBe(true);
      expect(supportPortalReturnRes.body.data.customerEmail).toMatch(
        /^a\*+@example-luxury\.id$/,
      );

      // PRODUCT lacks return.read -> 403 on GET /returns/:id
      const productPortalReturnRes = await request(app.getHttpServer())
        .get(`/api/v1/returns/${returnRec.id}`)
        .set('Cookie', productAdmin.cookieHeader);
      expect(productPortalReturnRes.status).toBe(403);

      // 5) SUPPORT GET /admin/refunds
      const supportRefundsRes = await request(app.getHttpServer())
        .get('/api/v1/admin/refunds?page=1&limit=20')
        .set('Cookie', support.cookieHeader);
      expect(supportRefundsRes.status).toBe(200);
      expect(supportRefundsRes.headers['cache-control']).toBe('no-store');
      const supportRefundItem = (supportRefundsRes.body.data as Array<{
        id: string;
        providerRefundId: string | null;
        gatewayResponse: Record<string, unknown> | null;
      }>).find((item) => item.id === refundRec.id);
      expect(supportRefundItem).toBeDefined();
      expect(supportRefundItem!.providerRefundId).toBe('gateway-redacted');
      expect(supportRefundItem!.gatewayResponse).toBeNull();
      expect(JSON.stringify(supportRefundsRes.body)).not.toContain(
        'RAW_GATEWAY_SECRET_SHOULD_NOT_LEAK_TO_SUPPORT',
      );

      // 6) Operational ORDER/OWNER view receives full order context and zero internal auth secrets
      const orderAdminDetailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/orders/${order.id}`)
        .set('Cookie', orderAdmin.cookieHeader);
      expect(orderAdminDetailRes.status).toBe(200);
      expect(orderAdminDetailRes.body.data.piiMasked).toBe(false);
      expect(orderAdminDetailRes.body.data.customerEmail).toBe(rawEmail);
      expect(orderAdminDetailRes.body.data.addressSnapshot.phone).toBe(rawPhone);
      expect(orderAdminDetailRes.body.data.addressSnapshot.line1).toBe(rawAddressLine1);

      const serializedOps = JSON.stringify(orderAdminDetailRes.body);
      expect(serializedOps).not.toContain('passwordHash');
      expect(serializedOps).not.toContain('mfaSecretEncrypted');
      expect(serializedOps).not.toContain('guestTokenHash');
      expect(serializedOps).not.toContain('csrfSecret');
      expect(serializedOps).not.toContain('tokenHash');
      if (config.MIDTRANS_SERVER_KEY) {
        expect(serializedOps).not.toContain(config.MIDTRANS_SERVER_KEY);
      }
    });
  });

  describe('3. Dual-Step Refund Separation of Duties, Step-Up Freshness & Audit Trail', () => {
    it('enforces dual-step separation, rejects stale MFA (>15m) with 403 MFA_STEP_UP_REQUIRED, succeeds after live TOTP step-up, records dual actors in audit_logs, and blocks over-refunds (422)', async () => {
      const support = await seedAdminActor('SUPPORT');
      const manager = await seedAdminActor('MANAGER');
      const orderAdmin = await seedAdminActor('ORDER');
      // OWNER starts with stale mfaVerifiedAt (20 minutes ago > 900s)
      const staleMfaAt = new Date(Date.now() - 20 * 60 * 1000);
      const owner = await seedAdminActor('OWNER', staleMfaAt);

      const customer = await seedCustomerActor();
      const variant = await seedVariant({ priceIdr: 500_000, stock: 5 });
      const order = await seedOrderWithPayment({
        userId: customer.userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.SETTLEMENT,
        items: [
          {
            variantId: variant.id,
            sku: variant.sku,
            name: 'Tailored Jacket',
            unitPriceIdr: 500_000,
            quantity: 1,
          },
        ],
      });
      // grandTotalIdr = 500,000 + 25,000 shipping = 525,000
      const totalPaidIdr = Number(order.grandTotalIdr);

      // Missing Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED
      const missingIdemRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/refunds/request`)
        .set('Origin', config.APP_URL)
        .set('Cookie', support.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
        .send({ amountIdr: 200_000, reason: 'Missing idem key' });
      expect(missingIdemRes.status).toBe(400);
      expect(missingIdemRes.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      // .strict() rejects injected status/approvedBy fields -> 400 VALIDATION_ERROR
      const tamperedRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/refunds/request`)
        .set('Origin', config.APP_URL)
        .set('Cookie', support.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('rf-tamper'))
        .send({
          amountIdr: 200_000,
          reason: 'Tampered payload',
          status: 'SUCCEEDED',
          approvedBy: support.userId,
        });
      expect(tamperedRes.status).toBe(400);
      expect(tamperedRes.body.error.code).toBe('VALIDATION_ERROR');

      // Over-refund exceeding totalPaidIdr -> 422 REFUND_AMOUNT_EXCEEDS_PAID
      const overRefundInitialRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/refunds/request`)
        .set('Origin', config.APP_URL)
        .set('Cookie', support.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('rf-over-1'))
        .send({
          amountIdr: totalPaidIdr + 1,
          reason: 'Excessive refund attempt',
        });
      expect(overRefundInitialRes.status).toBe(422);
      expect(overRefundInitialRes.body.error.code).toBe('REFUND_AMOUNT_EXCEEDS_PAID');

      // Step 1: SUPPORT requests valid partial refund (300,000 IDR)
      const reqRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/refunds/request`)
        .set('Origin', config.APP_URL)
        .set('Cookie', support.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('rf-sod-req'))
        .send({
          amountIdr: 300_000,
          reason: 'Customer agreed partial refund',
        });
      expect(reqRes.status).toBe(201);
      const refundId = reqRes.body.data.id as string;
      createdRefundIds.push(refundId);
      expect(reqRes.body.data.status).toBe('REQUESTED');
      expect(reqRes.body.data.requestedBy).toBe(support.userId);
      expect(reqRes.body.data.approvedBy).toBeNull();

      // Remaining refundable = 525,000 - 300,000 = 225,000; requesting 225,001 -> 422
      const overRemainingRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/refunds/request`)
        .set('Origin', config.APP_URL)
        .set('Cookie', manager.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, manager.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('rf-over-2'))
        .send({
          amountIdr: 225_001,
          reason: 'Exceeds remaining refundable',
        });
      expect(overRemainingRes.status).toBe(422);
      expect(overRemainingRes.body.error.code).toBe('REFUND_AMOUNT_EXCEEDS_PAID');

      // Same requester (SUPPORT), MANAGER, and ORDER cannot approve -> 403 FORBIDDEN
      for (const nonOwner of [support, manager, orderAdmin]) {
        const denyApproveRes = await request(app.getHttpServer())
          .post(`/api/v1/admin/refunds/${refundId}/approve`)
          .set('Origin', config.APP_URL)
          .set('Cookie', nonOwner.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, nonOwner.csrfToken)
          .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey(`rf-deny-${nonOwner.roleCode}`))
          .send({ decision: 'APPROVE' });
        expect(denyApproveRes.status).toBe(403);
        expect(denyApproveRes.body.error.code).toBe('FORBIDDEN');
      }

      // OWNER with stale MFA (> 15m) -> 403 MFA_STEP_UP_REQUIRED
      const staleApproveRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${refundId}/approve`)
        .set('Origin', config.APP_URL)
        .set('Cookie', owner.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, owner.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('rf-stale-owner'))
        .send({ decision: 'APPROVE' });
      expect(staleApproveRes.status).toBe(403);
      expect(staleApproveRes.body.error.code).toBe('MFA_STEP_UP_REQUIRED');

      // OWNER performs live TOTP step-up via POST /api/v1/auth/mfa/verify
      const totpCode = await generate({ secret: owner.totpSecret });
      const mfaVerifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .set('Origin', config.APP_URL)
        .set('Cookie', owner.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, owner.csrfToken)
        .send({ code: totpCode });
      expect(mfaVerifyRes.status).toBe(200);
      expect(mfaVerifyRes.body.data.verified).toBe(true);

      // Step 2: OWNER approves with fresh MFA and Idempotency-Key -> 200 SUCCEEDED
      const approveRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${refundId}/approve`)
        .set('Origin', config.APP_URL)
        .set('Cookie', owner.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, owner.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('rf-fresh-owner'))
        .send({ decision: 'APPROVE', notes: 'Dual-step approved by OWNER' });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('SUCCEEDED');
      expect(approveRes.body.data.requestedBy).toBe(support.userId);
      expect(approveRes.body.data.approvedBy).toBe(owner.userId);

      // Verify immutable audit_logs entry records BOTH requestedBy and approvedBy
      const auditRow = await prisma.client.auditLog.findFirst({
        where: {
          action: 'refund.approved',
          resource: 'refund',
          resourceId: refundId,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditRow).toBeTruthy();
      expect(auditRow!.actorId).toBe(owner.userId);
      const afterState = auditRow!.afterState as Record<string, unknown>;
      expect(afterState['requestedBy']).toBe(support.userId);
      expect(afterState['approvedBy']).toBe(owner.userId);
      expect(afterState['amountIdr']).toBe(300_000);
      expect(afterState['orderId']).toBe(order.id);
    });
  });

  describe('4. Customer Return Ownership, Quantity Bounds, RETURN_TO_STOCK & Public CMS Isolation', () => {
    it('enforces return ownership (customer & guest token), item ownership, quantity bounds, and restock atomicity', async () => {
      const ownerCustomer = await seedCustomerActor({ fullName: 'Owner Buyer' });
      const attackerCustomer = await seedCustomerActor({ fullName: 'Attacker Buyer' });
      const support = await seedAdminActor('SUPPORT');
      const manager = await seedAdminActor('MANAGER');
      const inventoryAdmin = await seedAdminActor('INVENTORY');
      const preAuth = await issuePreAuthCsrf();

      const variant = await seedVariant({ priceIdr: 450_000, stock: 10 });

      const ownerOrder = await seedOrderWithPayment({
        userId: ownerCustomer.userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.SETTLEMENT,
        items: [
          {
            variantId: variant.id,
            sku: variant.sku,
            name: 'Silk Shirt',
            unitPriceIdr: 450_000,
            quantity: 2,
          },
        ],
        deliveredAt: new Date(),
      });
      const ownerOrderItemId = ownerOrder.items[0]!.id;

      const attackerOrder = await seedOrderWithPayment({
        userId: attackerCustomer.userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.SETTLEMENT,
        items: [
          {
            variantId: variant.id,
            sku: variant.sku,
            name: 'Silk Shirt',
            unitPriceIdr: 450_000,
            quantity: 1,
          },
        ],
        deliveredAt: new Date(),
      });
      const attackerOrderItemId = attackerOrder.items[0]!.id;

      const validGuestToken = `guest-token-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      const guestOrder = await seedOrderWithPayment({
        userId: null,
        guestEmail: `guest-ret-${Date.now()}@arven.local`,
        guestToken: validGuestToken,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.SETTLEMENT,
        items: [
          {
            variantId: variant.id,
            sku: variant.sku,
            name: 'Silk Shirt',
            unitPriceIdr: 450_000,
            quantity: 1,
          },
        ],
        deliveredAt: new Date(),
      });
      const guestOrderItemId = guestOrder.items[0]!.id;

      // 1) Unauthenticated without guest token -> 401
      const noCredsRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${ownerOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', preAuth.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, preAuth.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-nocreds'))
        .send({
          reason: 'No auth',
          items: [{ orderItemId: ownerOrderItemId, quantity: 1 }],
        });
      expect(noCredsRes.status).toBe(401);

      // 2) Attacker CUSTOMER trying to file return on Owner Customer's order -> 404 (no leak)
      const idorCreateRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${ownerOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', attackerCustomer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, attackerCustomer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-idor'))
        .send({
          reason: 'IDOR attempt',
          items: [{ orderItemId: ownerOrderItemId, quantity: 1 }],
        });
      expect(idorCreateRes.status).toBe(404);
      expect(JSON.stringify(idorCreateRes.body)).not.toContain('Owner Buyer');

      // 3) Forged guest token on guest order -> 404; valid guest token on customer-owned order -> 404
      const forgedGuestRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${guestOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', preAuth.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, preAuth.csrfToken)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, 'forged-wrong-guest-token-999999999')
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-forged-guest'))
        .send({
          reason: 'Forged guest token',
          items: [{ orderItemId: guestOrderItemId, quantity: 1 }],
        });
      expect(forgedGuestRes.status).toBe(404);

      const guestOnCustomerOrderRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${ownerOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', preAuth.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, preAuth.csrfToken)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, validGuestToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-guest-on-user'))
        .send({
          reason: 'Cross order token',
          items: [{ orderItemId: ownerOrderItemId, quantity: 1 }],
        });
      expect([403, 404]).toContain(guestOnCustomerOrderRes.status);

      // 4) Foreign orderItemId in Owner Customer's return -> 403 ORDER_ITEM_OWNERSHIP_DENIED
      const foreignItemRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${ownerOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', ownerCustomer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, ownerCustomer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-foreign-item'))
        .send({
          reason: 'Foreign item',
          items: [{ orderItemId: attackerOrderItemId, quantity: 1 }],
        });
      expect(foreignItemRes.status).toBe(403);
      expect(foreignItemRes.body.error.code).toBe('ORDER_ITEM_OWNERSHIP_DENIED');

      // 4b) Duplicate orderItemId in same return request -> 400 VALIDATION_ERROR
      const dupItemRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${ownerOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', ownerCustomer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, ownerCustomer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-dup-item'))
        .send({
          reason: 'Duplicate item payload',
          items: [
            { orderItemId: ownerOrderItemId, quantity: 1 },
            { orderItemId: ownerOrderItemId, quantity: 1 },
          ],
        });
      expect(dupItemRes.status).toBe(400);
      expect(dupItemRes.body.error.code).toBe('VALIDATION_ERROR');

      // 5) Over-quantity (qty 3 > purchased 2) -> 422 RETURN_QUANTITY_EXCEEDED
      const overQtyRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${ownerOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', ownerCustomer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, ownerCustomer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-over-qty1'))
        .send({
          reason: 'Too many units',
          items: [{ orderItemId: ownerOrderItemId, quantity: 3 }],
        });
      expect(overQtyRes.status).toBe(422);
      expect(overQtyRes.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED');

      // 6) Valid partial return of qty 1 -> 201, then attacker & forged guest cannot read GET /returns/:id
      const validRet1Res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${ownerOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', ownerCustomer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, ownerCustomer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-valid-1'))
        .send({
          reason: 'Damaged seam on first piece',
          items: [{ orderItemId: ownerOrderItemId, quantity: 1 }],
        });
      expect(validRet1Res.status).toBe(201);
      const ret1Id = validRet1Res.body.data.id as string;
      const ret1ItemId = validRet1Res.body.data.items[0].id as string;
      createdReturnIds.push(ret1Id);

      const attackerReadRet1 = await request(app.getHttpServer())
        .get(`/api/v1/returns/${ret1Id}`)
        .set('Cookie', attackerCustomer.cookieHeader);
      expect(attackerReadRet1.status).toBe(404);

      const forgedGuestReadRet1 = await request(app.getHttpServer())
        .get(`/api/v1/returns/${ret1Id}`)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, validGuestToken);
      expect(forgedGuestReadRet1.status).toBe(404);

      // 7) Second return on same orderItem requesting qty 2 (> remaining 2 - 1 = 1) -> 422
      const overRemainingRetRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${ownerOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', ownerCustomer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, ownerCustomer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-over-rem'))
        .send({
          reason: 'Exceeds remaining returnable',
          items: [{ orderItemId: ownerOrderItemId, quantity: 2 }],
        });
      expect(overRemainingRetRes.status).toBe(422);
      expect(overRemainingRetRes.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED');

      // 8) Valid second return of remaining qty 1 -> 201
      const validRet2Res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${ownerOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', ownerCustomer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, ownerCustomer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-valid-2'))
        .send({
          reason: 'Unopened second piece',
          items: [{ orderItemId: ownerOrderItemId, quantity: 1 }],
        });
      expect(validRet2Res.status).toBe(201);
      const ret2Id = validRet2Res.body.data.id as string;
      const ret2ItemId = validRet2Res.body.data.items[0].id as string;
      createdReturnIds.push(ret2Id);

      // 9) Guest valid return flow + forged guest read rejection
      const guestRetRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${guestOrder.id}/returns`)
        .set('Origin', config.APP_URL)
        .set('Cookie', preAuth.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, preAuth.csrfToken)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, validGuestToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('ret-guest-valid'))
        .send({
          reason: 'Guest return with valid token',
          items: [{ orderItemId: guestOrderItemId, quantity: 1 }],
        });
      expect(guestRetRes.status).toBe(201);
      const guestRetId = guestRetRes.body.data.id as string;
      createdReturnIds.push(guestRetId);

      const guestReadWrong = await request(app.getHttpServer())
        .get(`/api/v1/returns/${guestRetId}`)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, 'wrong-guest-token-12345678');
      expect(guestReadWrong.status).toBe(404);

      const guestReadValid = await request(app.getHttpServer())
        .get(`/api/v1/returns/${guestRetId}`)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, validGuestToken);
      expect(guestReadValid.status).toBe(200);

      // 10) Inspection restock atomicity:
      // Case A: DAMAGED item (even with restock: true) MUST NOT increment on_hand or create RETURN_TO_STOCK
      for (const retId of [ret1Id, ret2Id]) {
        await request(app.getHttpServer())
          .post(`/api/v1/admin/returns/${retId}/review`)
          .set('Origin', config.APP_URL)
          .set('Cookie', support.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
          .send({ notes: 'Reviewed' })
          .expect(200);

        await request(app.getHttpServer())
          .post(`/api/v1/admin/returns/${retId}/approve`)
          .set('Origin', config.APP_URL)
          .set('Cookie', manager.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, manager.csrfToken)
          .send({ decision: 'APPROVE', adminNotes: 'Approved' })
          .expect(200);
      }

      const beforeDamagedLevel = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: {
          warehouseId_variantId: {
            warehouseId,
            variantId: variant.id,
          },
        },
      });

      const damagedReceiveRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/returns/${ret1Id}/receive`)
        .set('Origin', config.APP_URL)
        .set('Cookie', inventoryAdmin.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, inventoryAdmin.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('recv-dmg'))
        .send({
          warehouseCode: DEFAULT_WAREHOUSE_CODE,
          items: [
            {
              returnItemId: ret1ItemId,
              condition: 'DAMAGED',
              restock: true,
            },
          ],
        });
      expect(damagedReceiveRes.status).toBe(200);
      expect(damagedReceiveRes.body.data.items[0].restocked).toBe(false);

      const afterDamagedLevel = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: {
          warehouseId_variantId: {
            warehouseId,
            variantId: variant.id,
          },
        },
      });
      expect(afterDamagedLevel.quantityOnHand).toBe(beforeDamagedLevel.quantityOnHand);

      const damagedMovementCount = await prisma.client.inventoryMovement.count({
        where: {
          referenceId: ret1Id,
          type: InventoryMovementType.RETURN_TO_STOCK,
        },
      });
      expect(damagedMovementCount).toBe(0);

      // Case B: GOOD item with restock: true atomically increments quantity_on_hand once & rejects duplicate receipt (409)
      const goodReceiveRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/returns/${ret2Id}/receive`)
        .set('Origin', config.APP_URL)
        .set('Cookie', inventoryAdmin.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, inventoryAdmin.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('recv-good-1'))
        .send({
          warehouseCode: DEFAULT_WAREHOUSE_CODE,
          items: [
            {
              returnItemId: ret2ItemId,
              condition: 'GOOD',
              restock: true,
            },
          ],
        });
      expect(goodReceiveRes.status).toBe(200);
      expect(goodReceiveRes.body.data.items[0].restocked).toBe(true);

      const afterGoodLevel = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: {
          warehouseId_variantId: {
            warehouseId,
            variantId: variant.id,
          },
        },
      });
      expect(afterGoodLevel.quantityOnHand).toBe(beforeDamagedLevel.quantityOnHand + 1);

      const goodMovements = await prisma.client.inventoryMovement.findMany({
        where: {
          referenceId: ret2Id,
          type: InventoryMovementType.RETURN_TO_STOCK,
        },
      });
      expect(goodMovements).toHaveLength(1);
      expect(goodMovements[0]!.quantityDelta).toBe(1);

      // Duplicate physical receipt with a NEW idempotency key -> 409, stock unchanged
      const dupReceiveRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/returns/${ret2Id}/receive`)
        .set('Origin', config.APP_URL)
        .set('Cookie', inventoryAdmin.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, inventoryAdmin.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, nextIdemKey('recv-good-dup'))
        .send({
          warehouseCode: DEFAULT_WAREHOUSE_CODE,
          items: [
            {
              returnItemId: ret2ItemId,
              condition: 'GOOD',
              restock: true,
            },
          ],
        });
      expect(dupReceiveRes.status).toBe(409);
      expect(dupReceiveRes.body.error.code).toBe('INVALID_STATE_TRANSITION');

      const afterDupLevel = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: {
          warehouseId_variantId: {
            warehouseId,
            variantId: variant.id,
          },
        },
      });
      expect(afterDupLevel.quantityOnHand).toBe(beforeDamagedLevel.quantityOnHand + 1);
    });

    it('isolates DRAFT, PREVIEW, and ARCHIVED CMS items from public routes and rejects XSS payloads', async () => {
      const contentAdmin = await seedAdminActor('CONTENT');
      const suffix = Date.now();
      const pageSlug = `sec-page-${suffix}`;
      const lookbookSlug = `sec-lookbook-${suffix}`;
      const journalSlug = `sec-journal-${suffix}`;

      // Reject XSS payloads across Page, Lookbook, and Journal
      const xssPayloads = [
        {
          url: '/api/v1/admin/cms/pages',
          body: {
            slug: `xss-page-${suffix}`,
            title: '<script>alert(1)</script>',
            blocks: [{ type: 'hero', heading: 'Valid' }],
          },
        },
        {
          url: '/api/v1/admin/cms/lookbooks',
          body: {
            slug: `xss-lb-${suffix}`,
            title: 'Lookbook Safe',
            season: 'FW26',
            slides: [
              {
                title: 'Slide 1',
                caption: 'Hover me onerror=alert(1)',
                imageUrl: 'https://cdn.arven.id/lookbook/slide-1.webp',
              },
            ],
          },
        },
        {
          url: '/api/v1/admin/cms/journal',
          body: {
            slug: `xss-jr-${suffix}`,
            title: 'Journal Safe',
            excerpt: 'Summary',
            body: { link: 'javascript:alert(1)' },
          },
        },
      ];

      for (const payload of xssPayloads) {
        const res = await request(app.getHttpServer())
          .post(payload.url)
          .set('Origin', config.APP_URL)
          .set('Cookie', contentAdmin.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
          .send(payload.body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }

      // Create valid DRAFT Page, Lookbook, JournalArticle
      const pageCreateRes = await request(app.getHttpServer())
        .post('/api/v1/admin/cms/pages')
        .set('Origin', config.APP_URL)
        .set('Cookie', contentAdmin.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
        .send({
          slug: pageSlug,
          title: 'Atelier Craftsmanship',
          blocks: [{ type: 'editorial', heading: 'Silk & Cashmere' }],
        });
      expect(pageCreateRes.status).toBe(201);
      const pageId = pageCreateRes.body.data.id as string;
      createdPageIds.push(pageId);

      const lookbookCreateRes = await request(app.getHttpServer())
        .post('/api/v1/admin/cms/lookbooks')
        .set('Origin', config.APP_URL)
        .set('Cookie', contentAdmin.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
        .send({
          slug: lookbookSlug,
          title: 'Autumn Architectural Silhouette',
          season: 'AW26',
          slides: [
            {
              title: 'Look 01',
              imageUrl: 'https://cdn.arven.id/lookbooks/aw26-01.webp',
            },
          ],
        });
      expect(lookbookCreateRes.status).toBe(201);
      const lookbookId = lookbookCreateRes.body.data.id as string;
      createdLookbookIds.push(lookbookId);

      const journalCreateRes = await request(app.getHttpServer())
        .post('/api/v1/admin/cms/journal')
        .set('Origin', config.APP_URL)
        .set('Cookie', contentAdmin.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
        .send({
          slug: journalSlug,
          title: 'Notes on Loom Tension',
          excerpt: 'Inside our textile workshop',
          body: { sections: [{ heading: 'Origin', copy: 'Woven in limited runs.' }] },
        });
      expect(journalCreateRes.status).toBe(201);
      const journalId = journalCreateRes.body.data.id as string;
      createdJournalIds.push(journalId);

      const expectPublicCmsHidden = async () => {
        expect(
          (await request(app.getHttpServer()).get(`/api/v1/cms/pages/${pageSlug}`)).status,
        ).toBe(404);
        expect(
          (await request(app.getHttpServer()).get(`/api/v1/cms/lookbooks/${lookbookSlug}`))
            .status,
        ).toBe(404);
        expect(
          (await request(app.getHttpServer()).get(`/api/v1/cms/journal/${journalSlug}`))
            .status,
        ).toBe(404);

        const lookbooksList = await request(app.getHttpServer()).get(
          '/api/v1/cms/lookbooks?page=1&limit=50',
        );
        expect(lookbooksList.status).toBe(200);
        expect(
          (lookbooksList.body.data as Array<{ slug: string }>).some(
            (item) => item.slug === lookbookSlug,
          ),
        ).toBe(false);

        const journalList = await request(app.getHttpServer()).get(
          '/api/v1/cms/journal?page=1&limit=50',
        );
        expect(journalList.status).toBe(200);
        expect(
          (journalList.body.data as Array<{ slug: string }>).some(
            (item) => item.slug === journalSlug,
          ),
        ).toBe(false);
      };

      // DRAFT -> public GET returns 404 & excluded from lists
      await expectPublicCmsHidden();

      // PREVIEW -> public GET still returns 404 & excluded from lists
      for (const path of [
        `/api/v1/admin/cms/pages/${pageId}/transition`,
        `/api/v1/admin/cms/lookbooks/${lookbookId}/transition`,
        `/api/v1/admin/cms/journal/${journalId}/transition`,
      ]) {
        await request(app.getHttpServer())
          .post(path)
          .set('Origin', config.APP_URL)
          .set('Cookie', contentAdmin.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
          .send({ toStatus: 'PREVIEW' })
          .expect(200);
      }

      await expectPublicCmsHidden();

      // PUBLISHED -> public GET returns 200
      for (const path of [
        `/api/v1/admin/cms/pages/${pageId}/transition`,
        `/api/v1/admin/cms/lookbooks/${lookbookId}/transition`,
        `/api/v1/admin/cms/journal/${journalId}/transition`,
      ]) {
        await request(app.getHttpServer())
          .post(path)
          .set('Origin', config.APP_URL)
          .set('Cookie', contentAdmin.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
          .send({ toStatus: 'PUBLISHED' })
          .expect(200);
      }

      expect(
        (await request(app.getHttpServer()).get(`/api/v1/cms/pages/${pageSlug}`)).status,
      ).toBe(200);
      expect(
        (await request(app.getHttpServer()).get(`/api/v1/cms/lookbooks/${lookbookSlug}`))
          .status,
      ).toBe(200);
      expect(
        (await request(app.getHttpServer()).get(`/api/v1/cms/journal/${journalSlug}`))
          .status,
      ).toBe(200);

      // ARCHIVED -> public GET returns 404 again & excluded from lists
      for (const path of [
        `/api/v1/admin/cms/pages/${pageId}/transition`,
        `/api/v1/admin/cms/lookbooks/${lookbookId}/transition`,
        `/api/v1/admin/cms/journal/${journalId}/transition`,
      ]) {
        await request(app.getHttpServer())
          .post(path)
          .set('Origin', config.APP_URL)
          .set('Cookie', contentAdmin.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
          .send({ toStatus: 'ARCHIVED' })
          .expect(200);
      }

      await expectPublicCmsHidden();
    });
  });
});
