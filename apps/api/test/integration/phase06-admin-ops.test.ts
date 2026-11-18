import 'reflect-metadata';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_WAREHOUSE_CODE,
  HTTP_HEADERS,
  loadRuntimeConfig,
  type AdminRoleCode,
  type RoleCode,
  type RuntimeConfig,
} from '@arven/config';
import {
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
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
import {
  SHIPPING_PROVIDER,
  type ShippingProvider,
} from '../../src/shared/adapters/shipping.provider.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/shared/redis/redis.module.js';

describe('Phase 06 Admin Operations, Shipments, Returns, Refunds, Coupons, CMS & Analytics — Live PostgreSQL 18 + Redis Integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;
  let shippingProvider: ShippingProvider;
  let warehouseId: string;

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdReturnIds: string[] = [];
  const createdShipmentIds: string[] = [];
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
      REDIS_URL: 'redis://127.0.0.1:6379/13',
    };

    const bootstrapped = await createApp(testConfig);
    app = bootstrapped.app;
    await app.init();

    checkRouteAuthMetadata(app);

    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    tokenCrypto = app.get(TokenCryptoService);
    sessionStore = app.get(SessionStoreService);
    shippingProvider = app.get<ShippingProvider>(SHIPPING_PROVIDER);

    const warehouse = await prisma.client.warehouse.findFirstOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
    });
    warehouseId = warehouse.id;

    await redis.flushdb();
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

  async function seedAdminSession(
    roleCode: AdminRoleCode,
    mfaVerifiedAt: Date | null = new Date(),
  ): Promise<{
    userId: string;
    email: string;
    cookieHeader: string;
    csrfToken: string;
  }> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: roleCode },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const email = `p6-${roleCode.toLowerCase()}-${suffix}@arven.local`;
    const user = await prisma.client.user.create({
      data: {
        email,
        passwordHash: 'argon2id-test-placeholder',
        fullName: `Phase06 ${roleCode}`,
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        mfaEnabled: true,
        userRoles: { create: { roleId: role.id } },
      },
    });
    createdUserIds.push(user.id);
    createdIdempotencyActors.push(`admin:${user.id}`);

    const rawToken = `raw-p6-admin-${user.id}-${suffix}`;
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
      userId: user.id,
      email,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
    };
  }

  async function seedCustomerSession(fullName = 'Aria Pratama'): Promise<{
    userId: string;
    email: string;
    cookieHeader: string;
    csrfToken: string;
  }> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: 'CUSTOMER' satisfies RoleCode },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const email = `p6-customer-${suffix}@arven.local`;
    const user = await prisma.client.user.create({
      data: {
        email,
        passwordHash: 'argon2id-test-placeholder',
        fullName,
        phone: '+6281298765432',
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        userRoles: { create: { roleId: role.id } },
      },
    });
    createdUserIds.push(user.id);
    createdIdempotencyActors.push(`user:${user.id}`);

    const rawToken = `raw-p6-cust-${user.id}-${suffix}`;
    const tokenHash = tokenCrypto.sha256Hex(rawToken);
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();

    await prisma.client.session.create({
      data: {
        userId: user.id,
        scope: SessionScope.CUSTOMER,
        tokenHash,
        csrfSecret,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    const cookieName = sessionStore.getCookieName(SessionScope.CUSTOMER);
    return {
      userId: user.id,
      email,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
    };
  }

  async function seedVariant(opts: { priceIdr: number; stock: number }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const product = await prisma.client.product.create({
      data: {
        slug: `p6-garment-${suffix}`,
        name: `Phase06 Atelier Trench ${suffix}`,
        description: 'Architectural trench coat for Phase 06 test.',
        material: 'Organic Cotton Gabardine',
        fit: 'Relaxed Fit',
        careInstruction: 'Dry clean only.',
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        publishedAt: new Date(),
        variants: {
          create: {
            sku: `ARV-P6-${suffix}`.slice(0, 48).toUpperCase(),
            size: 'L',
            color: 'Ivory',
            colorHex: '#F8F7F3',
            priceIdr: BigInt(opts.priceIdr),
            weightGrams: 850,
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
    items: Array<{ variantId: string; sku: string; name: string; unitPriceIdr: number; quantity: number }>;
    withActiveReservation?: boolean;
  }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const orderNumber = `ARV-P6-${suffix.slice(-8).toUpperCase()}`;
    const subtotalIdr = opts.items.reduce(
      (sum, item) => sum + item.unitPriceIdr * item.quantity,
      0,
    );
    const shippingTotalIdr = 24_000;
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
          recipientName: 'Aria Pratama',
          phone: '+6281298765432',
          line1: 'Jl. Senopati No. 88',
          line2: 'Apt 4A',
          subdistrict: 'Kebayoran Baru',
          city: 'Jakarta Selatan',
          province: 'DKI Jakarta',
          postalCode: '12190',
          countryCode: 'ID',
        },
        paymentExpiresAt: new Date(now.getTime() + 15 * 60_000),
        paidAt: opts.paymentStatus === PaymentStatus.SETTLEMENT ? now : null,
        items: {
          create: opts.items.map((item) => ({
            variantId: item.variantId,
            skuSnapshot: item.sku,
            productNameSnapshot: item.name,
            sizeSnapshot: 'L',
            colorSnapshot: 'Ivory',
            unitPriceIdr: BigInt(item.unitPriceIdr),
            discountAllocatedIdr: 0n,
            quantity: item.quantity,
            lineTotalIdr: BigInt(item.unitPriceIdr * item.quantity),
          })),
        },
        payments: {
          create: {
            provider: 'midtrans',
            providerReference: `${orderNumber}-PAY`,
            providerTransactionId: `tx-${suffix}`,
            method: 'bank_transfer',
            status: opts.paymentStatus,
            amountIdr: BigInt(grandTotalIdr),
            currency: 'IDR',
            snapToken: `secret-snap-${suffix}`,
            redirectUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${suffix}`,
            expiresAt: new Date(now.getTime() + 15 * 60_000),
            settledAt: opts.paymentStatus === PaymentStatus.SETTLEMENT ? now : null,
          },
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: opts.status,
            reason: 'Seeded for Phase 06 integration test',
            actorType: 'SYSTEM',
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

  async function issueGuestPreAuthCsrf(): Promise<{ cookie: string; token: string }> {
    const res = await request(app.getHttpServer()).get('/api/v1/csrf-token').expect(200);
    const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const csrfCookie = cookies.map((c) => c.split(';')[0]!).join('; ');
    const body = res.body as { data: { csrfToken: string } };
    return { cookie: csrfCookie, token: body.data.csrfToken };
  }

  it('enforces SUPPORT PII masking, gateway redaction, order transition RBAC, and reservation release on cancel', async () => {
    const support = await seedAdminSession('SUPPORT');
    const orderAdmin = await seedAdminSession('ORDER');
    const customer = await seedCustomerSession();
    const variant = await seedVariant({ priceIdr: 500_000, stock: 10 });

    const paidOrder = await seedOrderWithPayment({
      userId: customer.userId,
      status: OrderStatus.PAID,
      paymentStatus: PaymentStatus.SETTLEMENT,
      items: [
        {
          variantId: variant.id,
          sku: variant.sku,
          name: 'Phase06 Trench',
          unitPriceIdr: 500_000,
          quantity: 1,
        },
      ],
    });

    const pendingOrder = await seedOrderWithPayment({
      userId: customer.userId,
      status: OrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      items: [
        {
          variantId: variant.id,
          sku: variant.sku,
          name: 'Phase06 Trench',
          unitPriceIdr: 500_000,
          quantity: 2,
        },
      ],
      withActiveReservation: true,
    });

    // SUPPORT list & detail -> masked PII & redacted gateway fields
    const supportList = await request(app.getHttpServer())
      .get(`/api/v1/admin/orders?q=${encodeURIComponent(paidOrder.orderNumber)}`)
      .set('Cookie', support.cookieHeader)
      .expect(200);

    expect(supportList.headers['cache-control']).toBe('no-store');
    expect(supportList.body.data).toHaveLength(1);
    expect(supportList.body.data[0].piiMasked).toBe(true);
    expect(supportList.body.data[0].customerEmail).toMatch(/^[a-z0-9]\*\*\*@arven\.local$/);
    expect(supportList.body.data[0].recipientName).toBe('A*** P***');

    const supportDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/orders/${paidOrder.id}`)
      .set('Cookie', support.cookieHeader)
      .expect(200);

    expect(supportDetail.body.data.piiMasked).toBe(true);
    expect(supportDetail.body.data.addressSnapshot.phone).toBe('****5432');
    expect(supportDetail.body.data.addressSnapshot.city).toBe('Jakarta Selatan');
    expect(supportDetail.body.data.latestPayment.snapToken).toBeNull();
    expect(supportDetail.body.data.latestPayment.redirectUrl).toBeNull();
    expect(supportDetail.body.data.latestPayment.providerReference).toBe('gateway-redacted');

    // ORDER admin sees full unmasked detail
    const orderDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/orders/${paidOrder.id}`)
      .set('Cookie', orderAdmin.cookieHeader)
      .expect(200);

    expect(orderDetail.body.data.piiMasked).toBe(false);
    expect(orderDetail.body.data.customerEmail).toBe(customer.email);
    expect(orderDetail.body.data.addressSnapshot.phone).toBe('+6281298765432');
    expect(orderDetail.body.data.latestPayment.snapToken).toContain('secret-snap-');

    // SUPPORT cannot fulfill orders
    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${paidOrder.id}/transition`)
      .set('Cookie', support.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
      .send({ toStatus: 'PROCESSING' })
      .expect(403);

    // ORDER transitions PAID -> PROCESSING -> READY_TO_SHIP
    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${paidOrder.id}/transition`)
      .set('Cookie', orderAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, orderAdmin.csrfToken)
      .send({ toStatus: 'PROCESSING', reason: 'Packing started' })
      .expect(200);

    const readyRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${paidOrder.id}/transition`)
      .set('Cookie', orderAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, orderAdmin.csrfToken)
      .send({ toStatus: 'READY_TO_SHIP', reason: 'Ready for courier' })
      .expect(200);

    expect(readyRes.body.data.status).toBe('READY_TO_SHIP');

    const readyOutbox = await prisma.client.outboxEvent.findFirst({
      where: { aggregateId: paidOrder.id, eventType: 'order.ready_to_ship' },
    });
    expect(readyOutbox).not.toBeNull();

    // ORDER cancels PENDING_PAYMENT order -> releases active stock reservation
    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${pendingOrder.id}/transition`)
      .set('Cookie', orderAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, orderAdmin.csrfToken)
      .send({ toStatus: 'CANCELLED', reason: 'Customer requested cancellation' })
      .expect(200);

    const levelAfterCancel = await prisma.client.inventoryLevel.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
    });
    expect(levelAfterCancel.quantityReserved).toBe(0);

    const reservationAfterCancel = await prisma.client.stockReservation.findFirstOrThrow({
      where: { orderId: pendingOrder.id },
    });
    expect(reservationAfterCancel.status).toBe(StockReservationStatus.RELEASED);
  });

  it('creates shipments, deduplicates tracking events, advances order to DELIVERED, and blocks SUPPORT post-shipment cancel', async () => {
    const orderAdmin = await seedAdminSession('ORDER');
    const support = await seedAdminSession('SUPPORT');
    const customer = await seedCustomerSession();
    const variant = await seedVariant({ priceIdr: 750_000, stock: 5 });

    const order = await seedOrderWithPayment({
      userId: customer.userId,
      status: OrderStatus.READY_TO_SHIP,
      paymentStatus: PaymentStatus.SETTLEMENT,
      items: [
        {
          variantId: variant.id,
          sku: variant.sku,
          name: 'Phase06 Coat',
          unitPriceIdr: 750_000,
          quantity: 1,
        },
      ],
    });

    const shipRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.id}/shipments`)
      .set('Cookie', orderAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, orderAdmin.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `ship-${order.id}`)
      .send({
        provider: 'jne-adapter',
        serviceCode: 'REG',
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
      })
      .expect(201);

    const shipmentId = shipRes.body.data.id as string;
    createdShipmentIds.push(shipmentId);
    expect(shipRes.body.data.status).toBe('IN_TRANSIT');
    expect(shipRes.body.data.trackingNumber).toMatch(/^ARVTRK/);
    expect(shipRes.body.data.events).toHaveLength(1);

    const updatedOrderAfterShip = await prisma.client.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrderAfterShip.status).toBe(OrderStatus.SHIPPED);

    const dispatchedOutbox = await prisma.client.outboxEvent.findFirst({
      where: { aggregateId: shipmentId, eventType: 'shipment.dispatched' },
    });
    expect(dispatchedOutbox).not.toBeNull();

    // SUPPORT cannot cancel SHIPPED order
    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.id}/transition`)
      .set('Cookie', support.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
      .send({ toStatus: 'CANCELLED', reason: 'Attempt post-shipment cancel' })
      .expect(403);

    // Sync tracking twice with default provider -> deduplicates MANIFEST_CREATED
    await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${shipmentId}/sync-tracking`)
      .set('Cookie', orderAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, orderAdmin.csrfToken)
      .expect(200);

    const secondSync = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipments/${shipmentId}/sync-tracking`)
      .set('Cookie', orderAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, orderAdmin.csrfToken)
      .expect(200);

    expect(secondSync.body.data.events).toHaveLength(2);
    expect(secondSync.body.data.status).toBe('IN_TRANSIT');

    // Simulate carrier reporting DELIVERED
    const originalGetTracking = shippingProvider.getTracking.bind(shippingProvider);
    shippingProvider.getTracking = async (trackingNumber: string) => ({
      trackingNumber,
      status: 'DELIVERED',
      events: [
        {
          occurredAt: new Date(),
          description: 'Delivered to recipient at front desk',
          location: 'Jakarta Selatan',
          rawCode: 'DELIVERED',
        },
      ],
    });

    try {
      const deliveredSync = await request(app.getHttpServer())
        .post(`/api/v1/admin/shipments/${shipmentId}/sync-tracking`)
        .set('Cookie', orderAdmin.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, orderAdmin.csrfToken)
        .expect(200);

      expect(deliveredSync.body.data.status).toBe('DELIVERED');
      expect(deliveredSync.body.data.deliveredAt).not.toBeNull();

      const orderAfterDelivery = await prisma.client.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(orderAfterDelivery.status).toBe(OrderStatus.DELIVERED);

      const deliveredOutbox = await prisma.client.outboxEvent.findFirst({
        where: { aggregateId: shipmentId, eventType: 'shipment.delivered' },
      });
      expect(deliveredOutbox).not.toBeNull();
    } finally {
      shippingProvider.getTracking = originalGetTracking;
    }
  });

  it('enforces full return lifecycle, ownership/guest tokens, qty bounds, and RETURN_TO_STOCK atomicity', async () => {
    const support = await seedAdminSession('SUPPORT');
    const manager = await seedAdminSession('MANAGER');
    const inventoryAdmin = await seedAdminSession('INVENTORY');
    const customer = await seedCustomerSession();
    const otherCustomer = await seedCustomerSession('Other Buyer');

    const variantA = await seedVariant({ priceIdr: 400_000, stock: 5 });
    const variantB = await seedVariant({ priceIdr: 600_000, stock: 5 });

    const deliveredOrder = await seedOrderWithPayment({
      userId: customer.userId,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.SETTLEMENT,
      items: [
        {
          variantId: variantA.id,
          sku: variantA.sku,
          name: 'Garment A',
          unitPriceIdr: 400_000,
          quantity: 2,
        },
        {
          variantId: variantB.id,
          sku: variantB.sku,
          name: 'Garment B',
          unitPriceIdr: 600_000,
          quantity: 1,
        },
      ],
    });

    const itemA = deliveredOrder.items.find((i) => i.variantId === variantA.id)!;
    const itemB = deliveredOrder.items.find((i) => i.variantId === variantB.id)!;

    // Other customer blocked (404 zero-leak)
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${deliveredOrder.id}/returns`)
      .set('Cookie', otherCustomer.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, otherCustomer.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `ret-other-${deliveredOrder.id}`)
      .send({
        reason: 'Wrong size',
        items: [{ orderItemId: itemA.id, quantity: 1 }],
      })
      .expect(404);

    // Owner submits return for 1 of itemA and 1 of itemB
    const createReturnRes = await request(app.getHttpServer())
      .post(`/api/v1/orders/${deliveredOrder.id}/returns`)
      .set('Cookie', customer.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `ret-create-${deliveredOrder.id}`)
      .send({
        reason: 'Size mismatch',
        customerNotes: 'Need smaller size',
        items: [
          { orderItemId: itemA.id, quantity: 1 },
          { orderItemId: itemB.id, quantity: 1 },
        ],
      })
      .expect(201);

    const returnId = createReturnRes.body.data.id as string;
    createdReturnIds.push(returnId);
    expect(createReturnRes.body.data.status).toBe('REQUESTED');

    // Second return attempting qty 2 on itemA (already returned 1 out of 2) -> 422 RETURN_QUANTITY_EXCEEDED
    const overQtyRes = await request(app.getHttpServer())
      .post(`/api/v1/orders/${deliveredOrder.id}/returns`)
      .set('Cookie', customer.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `ret-overqty-${deliveredOrder.id}`)
      .send({
        reason: 'Second attempt',
        items: [{ orderItemId: itemA.id, quantity: 2 }],
      })
      .expect(422);

    expect(overQtyRes.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED');

    // Guest token return flow
    const guestToken = 'guest-return-token-secret-1234567890';
    const guestOrder = await seedOrderWithPayment({
      userId: null,
      guestEmail: 'guest-return@arven.local',
      guestToken,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.SETTLEMENT,
      items: [
        {
          variantId: variantA.id,
          sku: variantA.sku,
          name: 'Garment A',
          unitPriceIdr: 400_000,
          quantity: 1,
        },
      ],
    });
    const csrf = await issueGuestPreAuthCsrf();
    const guestRetRes = await request(app.getHttpServer())
      .post(`/api/v1/orders/${guestOrder.id}/returns`)
      .set('Cookie', csrf.cookie)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf.token)
      .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, guestToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `ret-guest-${guestOrder.id}`)
      .send({
        reason: 'Guest fit issue',
        items: [{ orderItemId: guestOrder.items[0]!.id, quantity: 1 }],
      })
      .expect(201);

    const guestReturnId = guestRetRes.body.data.id as string;
    createdReturnIds.push(guestReturnId);

    await request(app.getHttpServer())
      .get(`/api/v1/returns/${guestReturnId}`)
      .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, guestToken)
      .expect(200);

    // SUPPORT sees masked email on GET /admin/returns/:id
    const supportReturnDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/returns/${returnId}`)
      .set('Cookie', support.cookieHeader)
      .expect(200);
    expect(supportReturnDetail.body.data.piiMasked).toBe(true);
    expect(supportReturnDetail.body.data.customerEmail).toMatch(/^[a-z0-9]\*\*\*@arven\.local$/);

    // SUPPORT reviews (REQUESTED -> UNDER_REVIEW)
    await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${returnId}/review`)
      .set('Cookie', support.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
      .send({ notes: 'Photos verified' })
      .expect(200);

    // SUPPORT cannot approve (403)
    await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${returnId}/approve`)
      .set('Cookie', support.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
      .send({ decision: 'APPROVE' })
      .expect(403);

    // MANAGER approves (UNDER_REVIEW -> APPROVED)
    await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${returnId}/approve`)
      .set('Cookie', manager.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, manager.csrfToken)
      .send({ decision: 'APPROVE', adminNotes: 'Approved for warehouse inspection' })
      .expect(200);

    // INVENTORY receives and inspects: itemA GOOD (restock: true) -> +1 on_hand; itemB DAMAGED (restock: true) -> NOT restocked
    const retItemA = createReturnRes.body.data.items.find(
      (ri: { orderItemId: string }) => ri.orderItemId === itemA.id,
    );
    const retItemB = createReturnRes.body.data.items.find(
      (ri: { orderItemId: string }) => ri.orderItemId === itemB.id,
    );

    const receiveRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${returnId}/receive`)
      .set('Cookie', inventoryAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, inventoryAdmin.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `ret-recv-${returnId}`)
      .send({
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
        adminNotes: 'Inspected at JKT-MAIN-01',
        items: [
          { returnItemId: retItemA.id, condition: 'GOOD', restock: true },
          { returnItemId: retItemB.id, condition: 'DAMAGED', restock: true },
        ],
      })
      .expect(200);

    expect(receiveRes.body.data.status).toBe('RECEIVED');
    const updatedItemA = receiveRes.body.data.items.find(
      (ri: { id: string }) => ri.id === retItemA.id,
    );
    const updatedItemB = receiveRes.body.data.items.find(
      (ri: { id: string }) => ri.id === retItemB.id,
    );
    expect(updatedItemA.restocked).toBe(true);
    expect(updatedItemB.restocked).toBe(false);

    const levelA = await prisma.client.inventoryLevel.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId: variantA.id } },
    });
    const levelB = await prisma.client.inventoryLevel.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId: variantB.id } },
    });
    expect(levelA.quantityOnHand).toBe(6);
    expect(levelB.quantityOnHand).toBe(5);

    const movements = await prisma.client.inventoryMovement.findMany({
      where: {
        referenceType: 'RETURN',
        referenceId: returnId,
      },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.type).toBe(InventoryMovementType.RETURN_TO_STOCK);
    expect(movements[0]!.variantId).toBe(variantA.id);
    expect(movements[0]!.quantityDelta).toBe(1);
  });

  it('enforces dual-step refund separation of duties, OWNER MFA step-up, ceiling guard, and dual-actor audit log', async () => {
    const support = await seedAdminSession('SUPPORT');
    const manager = await seedAdminSession('MANAGER');
    const staleOwner = await seedAdminSession(
      'OWNER',
      new Date(Date.now() - 20 * 60_000),
    );
    const freshOwner = await seedAdminSession('OWNER', new Date());
    const customer = await seedCustomerSession();
    const variant = await seedVariant({ priceIdr: 1_000_000, stock: 5 });

    const order = await seedOrderWithPayment({
      userId: customer.userId,
      status: OrderStatus.RETURNED,
      paymentStatus: PaymentStatus.SETTLEMENT,
      items: [
        {
          variantId: variant.id,
          sku: variant.sku,
          name: 'Atelier Wool Coat',
          unitPriceIdr: 1_000_000,
          quantity: 1,
        },
      ],
    });
    const ret = await prisma.client.return.create({
      data: {
        orderId: order.id,
        userId: customer.userId,
        status: ReturnStatus.RECEIVED,
        reason: 'Refund needed',
        items: {
          create: {
            orderItemId: order.items[0]!.id,
            quantity: 1,
          },
        },
      },
    });
    createdReturnIds.push(ret.id);

    const totalPaid = Number(order.grandTotalIdr);

    // Over-refund rejected (422)
    const overRefund = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.id}/refunds/request`)
      .set('Cookie', support.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `rf-over-${order.id}`)
      .send({
        amountIdr: totalPaid + 1,
        reason: 'Over refund attempt',
      })
      .expect(422);
    expect(overRefund.body.error.code).toBe('REFUND_AMOUNT_EXCEEDS_PAID');

    // Step 1: SUPPORT requests partial refund
    const reqRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.id}/refunds/request`)
      .set('Cookie', support.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `rf-req-1-${order.id}`)
      .send({
        amountIdr: 500_000,
        reason: 'Partial garment refund',
        returnId: ret.id,
      })
      .expect(201);

    const refundId = reqRes.body.data.id as string;
    createdRefundIds.push(refundId);
    expect(reqRes.body.data.status).toBe('REQUESTED');
    expect(reqRes.body.data.requestedBy).toBe(support.userId);
    expect(reqRes.body.data.approvedBy).toBeNull();

    // MANAGER cannot approve (403)
    await request(app.getHttpServer())
      .post(`/api/v1/admin/refunds/${refundId}/approve`)
      .set('Cookie', manager.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, manager.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `rf-mgr-${refundId}`)
      .send({ decision: 'APPROVE' })
      .expect(403);

    // Stale OWNER MFA blocked with 403 MFA_STEP_UP_REQUIRED
    const staleRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/refunds/${refundId}/approve`)
      .set('Cookie', staleOwner.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, staleOwner.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `rf-stale-${refundId}`)
      .send({ decision: 'APPROVE' })
      .expect(403);
    expect(staleRes.body.error.code).toBe('MFA_STEP_UP_REQUIRED');

    // Step 2: Fresh OWNER approves
    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/refunds/${refundId}/approve`)
      .set('Cookie', freshOwner.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, freshOwner.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `rf-owner-${refundId}`)
      .send({ decision: 'APPROVE' })
      .expect(200);

    expect(approveRes.body.data.status).toBe('SUCCEEDED');
    expect(approveRes.body.data.requestedBy).toBe(support.userId);
    expect(approveRes.body.data.approvedBy).toBe(freshOwner.userId);

    const updatedOrder = await prisma.client.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe(OrderStatus.PARTIALLY_REFUNDED);

    const updatedReturn = await prisma.client.return.findUniqueOrThrow({
      where: { id: ret.id },
    });
    expect(updatedReturn.status).toBe(ReturnStatus.REFUNDED);

    const approveAudit = await prisma.client.auditLog.findFirstOrThrow({
      where: { resource: 'refund', resourceId: refundId, action: 'refund.approved' },
    });
    const afterState = approveAudit.afterState as Record<string, unknown>;
    expect(afterState['requestedBy']).toBe(support.userId);
    expect(afterState['approvedBy']).toBe(freshOwner.userId);

    const outbox = await prisma.client.outboxEvent.findFirst({
      where: { aggregateId: refundId, eventType: 'refund.completed' },
    });
    expect(outbox).not.toBeNull();

    // SUPPORT sees gatewayResponse redacted on GET /admin/refunds
    const supportRefunds = await request(app.getHttpServer())
      .get('/api/v1/admin/refunds')
      .set('Cookie', support.cookieHeader)
      .expect(200);
    const matched = supportRefunds.body.data.find(
      (r: { id: string }) => r.id === refundId,
    );
    expect(matched).toBeDefined();
    expect(matched.gatewayResponse).toBeNull();
    expect(matched.providerRefundId).toBe('gateway-redacted');
  });

  it('supports coupons CRUD, CMS draft/preview/publish isolation, and full vs limited sales analytics', async () => {
    const manager = await seedAdminSession('MANAGER');
    const contentAdmin = await seedAdminSession('CONTENT');
    const productAdmin = await seedAdminSession('PRODUCT');
    const support = await seedAdminSession('SUPPORT');

    // Coupons CRUD + RBAC
    await request(app.getHttpServer())
      .get('/api/v1/admin/coupons')
      .set('Cookie', contentAdmin.cookieHeader)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/admin/coupons')
      .set('Cookie', support.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, support.csrfToken)
      .send({
        code: 'NOAUTH10',
        name: 'Forbidden',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2028-01-01T00:00:00.000Z',
      })
      .expect(403);

    const uniqueCode = `ARV${Date.now().toString().slice(-6)}`;
    const couponRes = await request(app.getHttpServer())
      .post('/api/v1/admin/coupons')
      .set('Cookie', manager.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, manager.csrfToken)
      .send({
        code: uniqueCode.toLowerCase(),
        name: 'Private Atelier 15%',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        status: 'ACTIVE',
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2028-01-01T00:00:00.000Z',
      })
      .expect(201);

    const couponId = couponRes.body.data.id as string;
    createdCouponIds.push(couponId);
    expect(couponRes.body.data.code).toBe(uniqueCode.toUpperCase());

    // Cross-validation PATCH failure (endsAt <= startsAt)
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/coupons/${couponId}`)
      .set('Cookie', manager.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, manager.csrfToken)
      .send({ endsAt: '2025-12-31T00:00:00.000Z' })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/coupons/${couponId}`)
      .set('Cookie', manager.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, manager.csrfToken)
      .expect(204);

    // CMS draft -> preview -> published -> soft delete + public isolation
    const slugSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const pageSlug = `atelier-story-${slugSuffix}`;
    const lookbookSlug = `aw26-lookbook-${slugSuffix}`;
    const journalSlug = `material-notes-${slugSuffix}`;

    const pageRes = await request(app.getHttpServer())
      .post('/api/v1/admin/cms/pages')
      .set('Cookie', contentAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
      .send({
        slug: pageSlug,
        title: 'Atelier Story',
        blocks: [{ type: 'hero', heading: 'Beyond Trends. Beyond Time.' }],
      })
      .expect(201);
    const pageId = pageRes.body.data.id as string;
    createdPageIds.push(pageId);

    const lookbookRes = await request(app.getHttpServer())
      .post('/api/v1/admin/cms/lookbooks')
      .set('Cookie', contentAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
      .send({
        slug: lookbookSlug,
        title: 'AW26 Monochrome',
        season: 'AW26',
        slides: [
          {
            title: 'Look 01',
            imageUrl:
              'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20600%20800%22%3E%3Crect%20width%3D%22600%22%20height%3D%22800%22%20fill%3D%22%23E9E4DA%22%2F%3E%3C%2Fsvg%3E',
          },
        ],
      })
      .expect(201);
    const lookbookId = lookbookRes.body.data.id as string;
    createdLookbookIds.push(lookbookId);

    const journalRes = await request(app.getHttpServer())
      .post('/api/v1/admin/cms/journal')
      .set('Cookie', contentAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
      .send({
        slug: journalSlug,
        title: 'Tailoring Notes',
        excerpt: 'Inside our double-faced wool construction.',
        body: { sections: [{ heading: 'Craft', text: 'Hand-finished seams.' }] },
      })
      .expect(201);
    const journalId = journalRes.body.data.id as string;
    createdJournalIds.push(journalId);

    // DRAFT must return 404 on public endpoints
    await request(app.getHttpServer()).get(`/api/v1/cms/pages/${pageSlug}`).expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/cms/lookbooks/${lookbookSlug}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/cms/journal/${journalSlug}`)
      .expect(404);

    // Transition DRAFT -> PREVIEW (still 404 publicly)
    await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/pages/${pageId}/transition`)
      .set('Cookie', contentAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
      .send({ toStatus: 'PREVIEW' })
      .expect(200);
    await request(app.getHttpServer()).get(`/api/v1/cms/pages/${pageSlug}`).expect(404);

    // PRODUCT (cms.read only) cannot transition
    await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/pages/${pageId}/transition`)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({ toStatus: 'PUBLISHED' })
      .expect(403);

    // Publish all 3
    await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/pages/${pageId}/transition`)
      .set('Cookie', contentAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
      .send({ toStatus: 'PUBLISHED' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/lookbooks/${lookbookId}/transition`)
      .set('Cookie', contentAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
      .send({ toStatus: 'PUBLISHED' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/journal/${journalId}/transition`)
      .set('Cookie', contentAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
      .send({ toStatus: 'PUBLISHED' })
      .expect(200);

    // Public endpoints now serve PUBLISHED content
    const publicPage = await request(app.getHttpServer())
      .get(`/api/v1/cms/pages/${pageSlug}`)
      .expect(200);
    expect(publicPage.body.data.status).toBe('PUBLISHED');

    const publicLookbook = await request(app.getHttpServer())
      .get(`/api/v1/cms/lookbooks/${lookbookSlug}`)
      .expect(200);
    expect(publicLookbook.body.data.title).toBe('AW26 Monochrome');

    const publicJournal = await request(app.getHttpServer())
      .get(`/api/v1/cms/journal/${journalSlug}`)
      .expect(200);
    expect(publicJournal.body.data.title).toBe('Tailoring Notes');

    // Soft delete removes from public
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/cms/pages/${pageId}`)
      .set('Cookie', contentAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, contentAdmin.csrfToken)
      .expect(204);
    await request(app.getHttpServer()).get(`/api/v1/cms/pages/${pageSlug}`).expect(404);

    // Sales Analytics: full view (MANAGER) vs limited view (SUPPORT)
    const fullAnalytics = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/sales?days=30')
      .set('Cookie', manager.cookieHeader)
      .expect(200);
    expect(fullAnalytics.body.data.limitedView).toBe(false);
    expect(typeof fullAnalytics.body.data.grossSalesIdr).toBe('number');
    expect(typeof fullAnalytics.body.data.netSalesIdr).toBe('number');
    expect(typeof fullAnalytics.body.data.totalRefundedIdr).toBe('number');
    expect(fullAnalytics.body.data.dailySeries.length).toBeGreaterThan(0);
    expect(typeof fullAnalytics.body.data.dailySeries[0].grossSalesIdr).toBe('number');

    const limitedAnalytics = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/sales?days=30')
      .set('Cookie', support.cookieHeader)
      .expect(200);
    expect(limitedAnalytics.body.data.limitedView).toBe(true);
    expect(typeof limitedAnalytics.body.data.totalOrders).toBe('number');
    expect(limitedAnalytics.body.data.grossSalesIdr).toBeNull();
    expect(limitedAnalytics.body.data.netSalesIdr).toBeNull();
    expect(limitedAnalytics.body.data.totalRefundedIdr).toBeNull();
    expect(limitedAnalytics.body.data.averageOrderValueIdr).toBeNull();
    expect(limitedAnalytics.body.data.paymentSuccessRatePct).toBeNull();
    expect(limitedAnalytics.body.data.returnRatePct).toBeNull();
    expect(limitedAnalytics.body.data.dailySeries[0].grossSalesIdr).toBeNull();
    expect(limitedAnalytics.body.data.dailySeries[0].netSalesIdr).toBeNull();
  });
});
