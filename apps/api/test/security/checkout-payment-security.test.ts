import 'reflect-metadata';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_WAREHOUSE_CODE,
  HTTP_HEADERS,
  loadRuntimeConfig,
  type RuntimeConfig,
} from '@arven/config';
import {
  CouponStatus,
  DiscountType,
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  SessionScope,
  StockReservationStatus,
  UserStatus,
} from '@arven/database';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DomainHttpException } from '../../src/common/http/index.js';
import {
  SessionStoreService,
  TokenCryptoService,
  checkRouteAuthMetadata,
  type HttpRequestLike,
} from '../../src/common/security/index.js';
import { createApp } from '../../src/main.js';
import { CheckoutService } from '../../src/modules/checkout/index.js';
import { InventoryReservationService } from '../../src/modules/inventory/index.js';
import {
  LOCAL_STUB_DEFAULT_MIDTRANS_SERVER_KEY,
  LocalStubPaymentAdapter,
  PAYMENT_PROVIDER,
  computeMidtransSignature,
} from '../../src/shared/adapters/payment.provider.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/shared/redis/redis.module.js';

interface SeededCustomer {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  addressId: string;
  cookieHeader: string;
  csrfToken: string;
}

describe('Phase 05 Security & Concurrency Gate (T-02, T-03, T-04, T-05, T-08)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let config: RuntimeConfig;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;
  let checkoutService: CheckoutService;
  let inventoryReservation: InventoryReservationService;
  let localPaymentStub: LocalStubPaymentAdapter;
  let warehouseId: string;
  let midtransServerKey: string;

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdCouponIds: string[] = [];
  const createdIdempotencyActors: string[] = [];

  beforeAll(async () => {
    const baseConfig = loadRuntimeConfig();
    const testConfig: RuntimeConfig = {
      ...baseConfig,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      PAYMENT_DRIVER: 'local_stub',
      REDIS_URL: 'redis://127.0.0.1:6379/14',
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
    checkoutService = app.get(CheckoutService);
    inventoryReservation = app.get(InventoryReservationService);

    const provider = app.get(PAYMENT_PROVIDER);
    if (!(provider instanceof LocalStubPaymentAdapter)) {
      throw new Error('Expected LocalStubPaymentAdapter in test environment');
    }
    localPaymentStub = provider;

    midtransServerKey =
      config.MIDTRANS_SERVER_KEY?.trim() || LOCAL_STUB_DEFAULT_MIDTRANS_SERVER_KEY;

    const warehouse = await prisma.client.warehouse.findFirstOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
    });
    warehouseId = warehouse.id;

    await redis.flushdb();
  });

  afterAll(async () => {
    if (prisma) {
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
          where: { referenceType: 'order', referenceId: { in: createdOrderIds } },
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
        await prisma.client.outboxEvent.deleteMany({
          where: {
            aggregateType: { in: ['order', 'payment'] },
            aggregateId: { in: [...createdOrderIds, ...createdPaymentIds] },
          },
        });
      }

      if (createdCouponIds.length > 0) {
        await prisma.client.couponRedemption.deleteMany({
          where: { couponId: { in: createdCouponIds } },
        });
        await prisma.client.coupon.deleteMany({
          where: { id: { in: createdCouponIds } },
        });
      }

      if (createdVariantIds.length > 0) {
        await prisma.client.stockReservation.deleteMany({
          where: { variantId: { in: createdVariantIds } },
        });
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

  function trackGuestEmailActor(email: string): void {
    const scope = `guest:${createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex')
      .slice(0, 24)}`;
    createdIdempotencyActors.push(scope);
  }

  function trackGuestTokenActor(guestToken: string): void {
    const scope = `guest:${tokenCrypto.sha256Hex(guestToken).slice(0, 24)}`;
    createdIdempotencyActors.push(scope);
  }

  function issueGuestCsrf(): { cookieHeader: string; csrfToken: string } {
    const issued = tokenCrypto.issuePreAuthCsrf();
    return {
      cookieHeader: `${sessionStore.getPreAuthCsrfCookieName()}=${issued.cookieValue}`,
      csrfToken: issued.token,
    };
  }

  async function seedTestVariant(opts: {
    priceIdr: number;
    stock: number;
    weightGrams?: number;
  }): Promise<{ productId: string; variantId: string; sku: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const product = await prisma.client.product.create({
      data: {
        slug: `p5-sec-garment-${suffix}`,
        name: `ARVEN Security Atelier Piece ${suffix}`,
        description: 'Architectural garment for Phase 05 security verification.',
        material: '100% Cashmere',
        fit: 'Tailored Fit',
        careInstruction: 'Dry clean only.',
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        publishedAt: new Date(),
        variants: {
          create: {
            sku: `ARV-SEC-${suffix}`.slice(0, 48).toUpperCase(),
            size: 'M',
            color: 'Charcoal',
            colorHex: '#17191B',
            priceIdr: BigInt(opts.priceIdr),
            weightGrams: opts.weightGrams ?? 800,
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
        lowStockThreshold: 1,
      },
    });

    return {
      productId: product.id,
      variantId: variant.id,
      sku: variant.sku,
    };
  }

  async function seedCustomerWithAddress(label: string): Promise<SeededCustomer> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: 'CUSTOMER' },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const email = `p5-sec-${label}-${suffix}@arven.local`;
    const fullName = `Victim ${label} Private`;
    const phone = '+6281198765432';

    const user = await prisma.client.user.create({
      data: {
        email,
        passwordHash: 'argon2id-test-placeholder',
        fullName,
        phone,
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        userRoles: { create: { roleId: role.id } },
        addresses: {
          create: {
            label: 'Private Residence',
            recipientName: fullName,
            phone,
            addressLine1: `Jl. Dharmawangsa Secret No. ${suffix}`,
            city: 'Jakarta Selatan',
            province: 'DKI Jakarta',
            postalCode: '12160',
            countryCode: 'ID',
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });

    createdUserIds.push(user.id);
    createdIdempotencyActors.push(`user:${user.id}`);

    const rawToken = `raw-p5-sec-${user.id}-${Date.now()}`;
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();

    await prisma.client.session.create({
      data: {
        userId: user.id,
        scope: SessionScope.CUSTOMER,
        tokenHash: tokenCrypto.sha256Hex(rawToken),
        csrfSecret,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const cookieName = sessionStore.getCookieName(SessionScope.CUSTOMER);
    return {
      userId: user.id,
      email,
      fullName,
      phone,
      addressId: user.addresses[0]!.id,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
    };
  }

  async function seedAdminSession(): Promise<{ userId: string; cookieHeader: string }> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: 'OWNER' },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.client.user.create({
      data: {
        email: `p5-sec-admin-${suffix}@arven.local`,
        passwordHash: 'argon2id-test-placeholder',
        fullName: 'ARVEN Owner Security',
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        mfaEnabled: true,
        userRoles: { create: { roleId: role.id } },
      },
    });
    createdUserIds.push(user.id);

    const rawToken = `raw-p5-admin-${user.id}-${Date.now()}`;
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();
    await prisma.client.session.create({
      data: {
        userId: user.id,
        scope: SessionScope.ADMIN,
        tokenHash: tokenCrypto.sha256Hex(rawToken),
        csrfSecret,
        mfaVerifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return {
      userId: user.id,
      cookieHeader: `${sessionStore.getCookieName(SessionScope.ADMIN)}=${rawToken}`,
    };
  }

  async function seedCustomCoupon(opts: {
    code: string;
    status?: CouponStatus;
    startsAt?: Date;
    endsAt?: Date;
    minOrderSubtotalIdr?: number;
    usageLimitTotal?: number | null;
    usedCount?: number;
  }): Promise<string> {
    const coupon = await prisma.client.coupon.create({
      data: {
        code: opts.code,
        name: `Security Coupon ${opts.code}`,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10n,
        maxDiscountIdr: 200_000n,
        minOrderSubtotalIdr: BigInt(opts.minOrderSubtotalIdr ?? 100_000),
        usageLimitTotal: opts.usageLimitTotal ?? 50,
        usageLimitPerUser: 5,
        usedCount: opts.usedCount ?? 0,
        status: opts.status ?? CouponStatus.ACTIVE,
        startsAt: opts.startsAt ?? new Date('2026-01-01T00:00:00.000Z'),
        endsAt: opts.endsAt ?? new Date('2029-12-31T23:59:59.000Z'),
      },
    });
    createdCouponIds.push(coupon.id);
    return coupon.id;
  }

  describe('T-02 — BOLA / IDOR & Guest Token Enforcement', () => {
    it('blocks Customer A from reading, cancelling, or initiating/reading payments for Customer B order without leaking PII', async () => {
      const customerA = await seedCustomerWithAddress('cust-a');
      const customerB = await seedCustomerWithAddress('cust-b');
      const admin = await seedAdminSession();
      const { variantId } = await seedTestVariant({ priceIdr: 950_000, stock: 5 });

      const createBRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerB.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerB.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-bola-b-order-${Date.now()}`)
        .send({
          addressId: customerB.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });

      expect(createBRes.status).toBe(201);
      const orderB = createBRes.body.data.order;
      createdOrderIds.push(orderB.id);

      const paySessionBRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${orderB.id}/session`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customerB.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerB.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-bola-b-pay-${Date.now()}`)
        .send({});

      expect(paySessionBRes.status).toBe(201);
      const paymentBId = paySessionBRes.body.data.paymentId as string;
      createdPaymentIds.push(paymentBId);

      // Customer A listing only shows Customer A orders (never Customer B)
      const listARes = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Cookie', customerA.cookieHeader);
      expect(listARes.status).toBe(200);
      expect(listARes.body.data.some((o: { id: string }) => o.id === orderB.id)).toBe(false);

      // Admin cookie on customer-scoped GET /orders fails closed (401)
      const adminListRes = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Cookie', admin.cookieHeader);
      expect(adminListRes.status).toBe(401);

      // Customer A cannot read Customer B order by orderNumber
      const readBAsARes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderB.orderNumber}`)
        .set('Cookie', customerA.cookieHeader);
      expect([403, 404]).toContain(readBAsARes.status);
      const readBodyText = JSON.stringify(readBAsARes.body);
      expect(readBodyText).not.toContain(customerB.fullName);
      expect(readBodyText).not.toContain(customerB.email);
      expect(readBodyText).not.toContain('Dharmawangsa Secret');
      expect(readBodyText).not.toContain(orderB.orderNumber);

      // Customer A cannot cancel Customer B order
      const cancelBAsARes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderB.id}/cancel`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-bola-cancel-${Date.now()}`)
        .send({ reason: 'Unauthorized cancellation probe' });
      expect([403, 404]).toContain(cancelBAsARes.status);

      const orderBAfterCancelAttempt = await prisma.client.order.findUniqueOrThrow({
        where: { id: orderB.id },
      });
      expect(orderBAfterCancelAttempt.status).toBe(OrderStatus.PENDING_PAYMENT);

      // Customer A cannot create payment session for Customer B order
      const payBAsARes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${orderB.id}/session`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-bola-pay-${Date.now()}`)
        .send({});
      expect([403, 404]).toContain(payBAsARes.status);

      // Customer A cannot read Customer B payment
      const getPayBAsARes = await request(app.getHttpServer())
        .get(`/api/v1/payments/${paymentBId}`)
        .set('Cookie', customerA.cookieHeader);
      expect([403, 404]).toContain(getPayBAsARes.status);
      expect(JSON.stringify(getPayBAsARes.body)).not.toContain(
        paySessionBRes.body.data.providerReference,
      );

      // Customer A cannot use Customer B's saved addressId on quote or order creation
      const quoteCrossAddrRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .send({
          addressId: customerB.addressId,
          items: [{ variantId, quantity: 1 }],
        });
      expect(quoteCrossAddrRes.status).toBe(404);
      expect(quoteCrossAddrRes.body.error.code).toBe('ADDRESS_NOT_FOUND');

      const orderCrossAddrRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-bola-addr-${Date.now()}`)
        .send({
          addressId: customerB.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });
      expect(orderCrossAddrRes.status).toBe(404);
      expect(orderCrossAddrRes.body.error.code).toBe('ADDRESS_NOT_FOUND');
    });

    it('rejects guest order lookup, cancellation, and payment endpoints without valid X-Guest-Order-Token', async () => {
      const guestCsrf = issueGuestCsrf();
      const customerA = await seedCustomerWithAddress('guest-probe');
      const { variantId } = await seedTestVariant({ priceIdr: 620_000, stock: 3 });

      const guestEmail = `guest-bola-${Date.now()}@arven.local`;
      trackGuestEmailActor(guestEmail);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-guest-create-${Date.now()}`)
        .send({
          guestEmail,
          guestAddress: {
            recipientName: 'Guest Victim Private',
            phone: '+6281377788899',
            line1: 'Jl. Senopati Secret Residence No. 99',
            city: 'Jakarta Selatan',
            province: 'DKI Jakarta',
            postalCode: '12190',
            countryCode: 'ID',
          },
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });

      expect(createRes.status).toBe(201);
      const guestOrder = createRes.body.data.order;
      const validGuestToken = createRes.body.data.guestToken as string;
      createdOrderIds.push(guestOrder.id);
      trackGuestTokenActor(validGuestToken);

      // Valid guest token creates payment session
      const validPayRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${guestOrder.id}/session`)
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-guest-pay-valid-${Date.now()}`)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, validGuestToken)
        .send({});
      expect(validPayRes.status).toBe(201);
      const paymentId = validPayRes.body.data.paymentId as string;
      createdPaymentIds.push(paymentId);

      // 1) orderNumber alone without token -> 401
      const noTokenRead = await request(app.getHttpServer()).get(
        `/api/v1/orders/${guestOrder.orderNumber}`,
      );
      expect(noTokenRead.status).toBe(401);
      expect(JSON.stringify(noTokenRead.body)).not.toContain('Guest Victim Private');
      expect(JSON.stringify(noTokenRead.body)).not.toContain(guestEmail);

      // 2) tampered token on GET /orders/:orderNumber -> 404
      const tamperedToken = `${validGuestToken.slice(0, -4)}XXXX`;
      const badTokenRead = await request(app.getHttpServer())
        .get(`/api/v1/orders/${guestOrder.orderNumber}`)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, tamperedToken);
      expect([401, 403, 404]).toContain(badTokenRead.status);
      expect(JSON.stringify(badTokenRead.body)).not.toContain('Guest Victim Private');
      expect(JSON.stringify(badTokenRead.body)).not.toContain('guestTokenHash');

      // 3) Authenticated unrelated Customer A cannot read guest order -> 404
      const custAReadGuest = await request(app.getHttpServer())
        .get(`/api/v1/orders/${guestOrder.orderNumber}`)
        .set('Cookie', customerA.cookieHeader);
      expect(custAReadGuest.status).toBe(404);

      // 4) Missing / tampered token on cancel, payment session, get payment
      const noTokenCancel = await request(app.getHttpServer())
        .post(`/api/v1/orders/${guestOrder.id}/cancel`)
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-guest-cancel-no-${Date.now()}`)
        .send({});
      expect(noTokenCancel.status).toBe(401);

      const badTokenCancel = await request(app.getHttpServer())
        .post(`/api/v1/orders/${guestOrder.id}/cancel`)
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-guest-cancel-bad-${Date.now()}`)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, tamperedToken)
        .send({});
      expect([401, 403, 404]).toContain(badTokenCancel.status);

      const noTokenPaySession = await request(app.getHttpServer())
        .post(`/api/v1/payments/${guestOrder.id}/session`)
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-guest-paysess-no-${Date.now()}`)
        .send({});
      expect(noTokenPaySession.status).toBe(401);

      const badTokenPayRead = await request(app.getHttpServer())
        .get(`/api/v1/payments/${paymentId}`)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, tamperedToken);
      expect([401, 403, 404]).toContain(badTokenPayRead.status);

      // 5) Valid token succeeds cleanly and never exposes guestTokenHash
      const validRead = await request(app.getHttpServer())
        .get(`/api/v1/orders/${guestOrder.orderNumber}`)
        .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, validGuestToken);
      expect(validRead.status).toBe(200);
      expect(validRead.body.data.id).toBe(guestOrder.id);
      expect(JSON.stringify(validRead.body.data)).not.toContain('guestTokenHash');
    });
  });

  describe('T-03 — Authoritative Pricing, Mass-Assignment, Coupon & Idempotency Protection', () => {
    it('rejects unknown price/discount/status/userId fields via .strict(), invalid quantities, and stale/ineligible coupons', async () => {
      const guestCsrf = issueGuestCsrf();
      const customerA = await seedCustomerWithAddress('t03-strict');
      const { variantId } = await seedTestVariant({ priceIdr: 299_000, stock: 10 });

      const baseGuestAddress = {
        recipientName: 'T03 Tester',
        phone: '+6281200011122',
        line1: 'Jl. Kemang Selatan No. 10',
        city: 'Jakarta Selatan',
        province: 'DKI Jakarta',
        postalCode: '12560',
        countryCode: 'ID' as const,
      };

      // 1) Mass-assignment on POST /checkout/quote
      const tamperedQuoteRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .send({
          guestAddress: baseGuestAddress,
          items: [{ variantId, quantity: 1 }],
          unitPrice: 1,
          total: 1,
          discountTotalIdr: 999_999,
          status: 'PAID',
        });
      expect(tamperedQuoteRes.status).toBe(400);
      expect(tamperedQuoteRes.body.error.code).toBe('VALIDATION_ERROR');

      // 2) Mass-assignment on POST /checkout/orders (top-level & nested item fields)
      const tamperedOrderTopRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t03-top-${Date.now()}`)
        .send({
          addressId: customerA.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
          unitPrice: 1,
          total: 1,
          discountTotalIdr: 999_999,
          status: 'PAID',
          userId: customerA.userId,
        });
      expect(tamperedOrderTopRes.status).toBe(400);
      expect(tamperedOrderTopRes.body.error.code).toBe('VALIDATION_ERROR');

      const tamperedOrderItemRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t03-item-${Date.now()}`)
        .send({
          addressId: customerA.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1, unitPrice: 1 }],
        });
      expect(tamperedOrderItemRes.status).toBe(400);
      expect(tamperedOrderItemRes.body.error.code).toBe('VALIDATION_ERROR');

      // 3) Negative / zero / over-cap quantity rejected
      for (const badQty of [-1, 0, 100]) {
        const badQtyRes = await request(app.getHttpServer())
          .post('/api/v1/checkout/orders')
          .set('Origin', config.APP_URL)
          .set('Cookie', customerA.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
          .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t03-qty-${badQty}-${Date.now()}`)
          .send({
            addressId: customerA.addressId,
            shipping: { provider: 'jne-adapter', service: 'REG' },
            items: [{ variantId, quantity: badQty }],
          });
        expect(badQtyRes.status).toBe(400);
        expect(badQtyRes.body.error.code).toBe('VALIDATION_ERROR');
      }

      // 4) Coupon checks: unknown, expired, paused, below minimum subtotal, usage limit reached
      const unknownCouponRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .send({
          guestAddress: baseGuestAddress,
          couponCode: `NOPE${Date.now()}`,
          items: [{ variantId, quantity: 1 }],
        });
      expect(unknownCouponRes.status).toBe(404);
      expect(unknownCouponRes.body.error.code).toBe('COUPON_NOT_FOUND');

      const expiredCode = `EXPIRED${Date.now().toString(36).toUpperCase()}`;
      await seedCustomCoupon({
        code: expiredCode,
        startsAt: new Date('2025-01-01T00:00:00.000Z'),
        endsAt: new Date('2025-02-01T00:00:00.000Z'),
      });
      const expiredRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .send({
          guestAddress: baseGuestAddress,
          couponCode: expiredCode,
          items: [{ variantId, quantity: 1 }],
        });
      expect(expiredRes.status).toBe(400);
      expect(expiredRes.body.error.code).toBe('COUPON_EXPIRED');

      const pausedCode = `PAUSED${Date.now().toString(36).toUpperCase()}`;
      await seedCustomCoupon({
        code: pausedCode,
        status: CouponStatus.PAUSED,
      });
      const pausedRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .send({
          guestAddress: baseGuestAddress,
          couponCode: pausedCode,
          items: [{ variantId, quantity: 1 }],
        });
      expect(pausedRes.status).toBe(400);
      expect(pausedRes.body.error.code).toBe('COUPON_NOT_ACTIVE');

      const minSubtotalCode = `MINHIGH${Date.now().toString(36).toUpperCase()}`;
      await seedCustomCoupon({
        code: minSubtotalCode,
        minOrderSubtotalIdr: 5_000_000,
      });
      const minSubtotalRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .send({
          guestAddress: baseGuestAddress,
          couponCode: minSubtotalCode,
          items: [{ variantId, quantity: 1 }],
        });
      expect(minSubtotalRes.status).toBe(400);
      expect(minSubtotalRes.body.error.code).toBe('COUPON_MIN_SUBTOTAL_NOT_MET');

      const exhaustedCode = `MAXED${Date.now().toString(36).toUpperCase()}`;
      await seedCustomCoupon({
        code: exhaustedCode,
        usageLimitTotal: 1,
        usedCount: 1,
      });
      const exhaustedRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .send({
          guestAddress: baseGuestAddress,
          couponCode: exhaustedCode,
          items: [{ variantId, quantity: 1 }],
        });
      expect(exhaustedRes.status).toBe(409);
      expect(exhaustedRes.body.error.code).toBe('COUPON_USAGE_LIMIT_REACHED');

      // 5) CsrfGuard rejects missing X-CSRF-Token or untrusted Origin on checkout/order/payment mutations
      const badOriginQuote = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', 'https://evil-attacker.example')
        .set('Cookie', guestCsrf.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
        .send({
          guestAddress: baseGuestAddress,
          items: [{ variantId, quantity: 1 }],
        });
      expect(badOriginQuote.status).toBe(403);
      expect(badOriginQuote.body.error.code).toBe('CSRF_INVALID');

      const missingCsrfOrder = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-nocsrf-${Date.now()}`)
        .send({
          addressId: customerA.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });
      expect(missingCsrfOrder.status).toBe(403);
      expect(missingCsrfOrder.body.error.code).toBe('CSRF_INVALID');

      // 6) Missing Idempotency-Key on POST /checkout/orders -> 400
      const missingIdemOrder = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .send({
          addressId: customerA.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });
      expect(missingIdemOrder.status).toBe(400);
      expect(missingIdemOrder.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('re-reads authoritative DB variant price and rejects Idempotency-Key payload mismatches with 409 without mutating stock', async () => {
      const customer = await seedCustomerWithAddress('t03-price-idem');
      const { variantId } = await seedTestVariant({ priceIdr: 299_000, stock: 5 });

      const initialQuote = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .send({
          addressId: customer.addressId,
          items: [{ variantId, quantity: 1 }],
        });
      expect(initialQuote.status).toBe(200);
      expect(initialQuote.body.data.subtotalIdr).toBe(299_000);

      // Simulate DB price update while client holds stale UI quote
      await prisma.client.productVariant.update({
        where: { id: variantId },
        data: { priceIdr: 349_000n },
      });

      const updatedQuote = await request(app.getHttpServer())
        .post('/api/v1/checkout/quote')
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .send({
          addressId: customer.addressId,
          items: [{ variantId, quantity: 1 }],
        });
      expect(updatedQuote.status).toBe(200);
      expect(updatedQuote.body.data.subtotalIdr).toBe(349_000);

      // Order creation must use 349_000
      const idemKey = `sec-t03-idem-${Date.now()}`;
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, idemKey)
        .send({
          addressId: customer.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });

      expect(orderRes.status).toBe(201);
      const createdOrder = orderRes.body.data.order;
      createdOrderIds.push(createdOrder.id);
      expect(createdOrder.subtotalIdr).toBe(349_000);
      expect(createdOrder.items[0].unitPriceIdr).toBe(349_000);

      // Same Idempotency-Key with DIFFERENT payload (quantity 2 instead of 1) -> 409 IDEMPOTENCY_CONFLICT
      const conflictRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, idemKey)
        .send({
          addressId: customer.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 2 }],
        });
      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

      // Stock must only have quantity 1 reserved (never 2 or 3)
      const level = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
      expect(level.quantityOnHand).toBe(5);
      expect(level.quantityReserved).toBe(1);

      const ordersForVariant = await prisma.client.orderItem.count({
        where: { variantId },
      });
      expect(ordersForVariant).toBe(1);
    });
  });

  describe('T-04 — 20-Way Concurrent Oversell Race Test & Rate Limiting', () => {
    it('allows strictly 1 of 20 concurrent HTTP POST /checkout/orders on stock=1 with zero oversell', async () => {
      const { variantId } = await seedTestVariant({ priceIdr: 1_450_000, stock: 1 });
      const batchId = Date.now();

      const requests = Array.from({ length: 20 }, (_, idx) => {
        const guestCsrf = issueGuestCsrf();
        const guestEmail = `race-http-${batchId}-${idx}@arven.local`;
        trackGuestEmailActor(guestEmail);

        return request(app.getHttpServer())
          .post('/api/v1/checkout/orders')
          .set('Origin', config.APP_URL)
          .set('X-Forwarded-For', `198.51.100.${idx + 1}`)
          .set('Cookie', guestCsrf.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
          .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-race-http-${batchId}-${idx}`)
          .send({
            guestEmail,
            guestAddress: {
              recipientName: `Race Buyer ${idx}`,
              phone: '+6281200099900',
              line1: `Jl. Scbd Lot ${idx + 1}`,
              city: 'Jakarta Selatan',
              province: 'DKI Jakarta',
              postalCode: '12190',
              countryCode: 'ID',
            },
            shipping: { provider: 'jne-adapter', service: 'REG' },
            items: [{ variantId, quantity: 1 }],
          });
      });

      const responses = await Promise.all(requests);
      const created = responses.filter((res) => res.status === 201);
      const outOfStock = responses.filter(
        (res) =>
          res.status === 409 && res.body?.error?.code === 'VARIANT_OUT_OF_STOCK',
      );

      expect(created).toHaveLength(1);
      expect(outOfStock).toHaveLength(19);

      const winner = created[0]!;
      createdOrderIds.push(winner.body.data.order.id);
      trackGuestTokenActor(winner.body.data.guestToken);

      const level = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
      expect(level.quantityOnHand).toBe(1);
      expect(level.quantityReserved).toBe(1);

      const reservations = await prisma.client.stockReservation.findMany({
        where: { variantId },
      });
      expect(reservations).toHaveLength(1);
      expect(reservations[0]!.status).toBe(StockReservationStatus.ACTIVE);
      expect(reservations[0]!.quantity).toBe(1);

      const movements = await prisma.client.inventoryMovement.findMany({
        where: { variantId, type: InventoryMovementType.RESERVATION },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.quantityDelta).toBe(1);
    });

    it('enforces atomic conditional row locking in CheckoutService.createOrder across 20 concurrent direct calls (1 success, 19 VARIANT_OUT_OF_STOCK)', async () => {
      const { variantId } = await seedTestVariant({ priceIdr: 1_850_000, stock: 1 });
      const batchId = Date.now();

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, idx) => {
          const guestEmail = `race-svc-${batchId}-${idx}@arven.local`;
          trackGuestEmailActor(guestEmail);

          const mockReq: HttpRequestLike = {
            method: 'POST',
            url: '/api/v1/checkout/orders',
            ip: `203.0.113.${idx + 1}`,
            headers: {
              [HTTP_HEADERS.IDEMPOTENCY_KEY]: `sec-race-svc-${batchId}-${idx}`,
            },
          };
          const mockRes = {
            statusCode: 201,
            setHeader: () => undefined,
          };

          return checkoutService.createOrder(mockReq, mockRes, {
            guestEmail,
            guestAddress: {
              recipientName: `Service Race ${idx}`,
              phone: '+6281200088877',
              line1: `Jl. Menteng Raya No. ${idx + 1}`,
              city: 'Jakarta Pusat',
              province: 'DKI Jakarta',
              postalCode: '10340',
              countryCode: 'ID',
            },
            shipping: { provider: 'jne-adapter', service: 'REG' },
            items: [{ variantId, quantity: 1 }],
          });
        }),
      );

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<CheckoutService['createOrder']>>> =>
          r.status === 'fulfilled',
      );
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(19);

      createdOrderIds.push(fulfilled[0]!.value.order.id);
      if (fulfilled[0]!.value.guestToken) {
        trackGuestTokenActor(fulfilled[0]!.value.guestToken);
      }

      for (const failure of rejected) {
        expect(failure.reason).toBeInstanceOf(DomainHttpException);
        const err = failure.reason as DomainHttpException;
        expect(err.getStatus()).toBe(409);
        expect(err.code).toBe('VARIANT_OUT_OF_STOCK');
      }

      const level = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
      expect(level.quantityOnHand).toBe(1);
      expect(level.quantityReserved).toBe(1);

      const reservations = await prisma.client.stockReservation.findMany({
        where: { variantId },
      });
      expect(reservations).toHaveLength(1);
      expect(reservations[0]!.status).toBe(StockReservationStatus.ACTIVE);
    });

    it('enforces @Throttle (15 req/min) on POST /checkout/orders from a single IP', async () => {
      const guestCsrf = issueGuestCsrf();
      const singleIp = '198.51.100.250';
      const statuses: number[] = [];

      // Trigger validation errors quickly on POST /checkout/orders to test guard threshold without creating 15 orders
      for (let i = 0; i < 16; i += 1) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/checkout/orders')
          .set('Origin', config.APP_URL)
          .set('X-Forwarded-For', singleIp)
          .set('Cookie', guestCsrf.cookieHeader)
          .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
          .send({});
        statuses.push(res.status);
      }

      expect(statuses.slice(0, 15).every((s) => s === 400)).toBe(true);
      expect(statuses[15]).toBe(429);
    });
  });

  describe('T-05 & T-08 — Midtrans Webhook Spoofing, Deduplication, Late Settlement & Sanitization', () => {
    it('rejects forged signature_key and altered gross_amount with 401 and zero DB mutation, and handles 3x sequential & concurrent replays idempotently', async () => {
      const customer = await seedCustomerWithAddress('t05-webhook');
      const { variantId } = await seedTestVariant({ priceIdr: 750_000, stock: 5 });

      // Create Order 1 (for forged + sequential 3x replay)
      const order1Res = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('X-Forwarded-For', '198.51.100.61')
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-o1-${Date.now()}`)
        .send({
          addressId: customer.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 2 }],
        });
      expect(order1Res.status).toBe(201);
      const order1 = order1Res.body.data.order;
      createdOrderIds.push(order1.id);

      const pay1Res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${order1.id}/session`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-p1-${Date.now()}`)
        .send({});
      expect(pay1Res.status).toBe(201);
      const pay1 = pay1Res.body.data;
      createdPaymentIds.push(pay1.paymentId);

      // Browser lookup / status check never mutates order status
      const pollBeforeWebhook = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order1.orderNumber}`)
        .set('Cookie', customer.cookieHeader);
      expect(pollBeforeWebhook.status).toBe(200);
      expect(pollBeforeWebhook.body.data.status).toBe(OrderStatus.PENDING_PAYMENT);

      const expectedGross = String(order1.grandTotalIdr);
      const validSig1 = computeMidtransSignature({
        orderId: pay1.providerReference,
        statusCode: '200',
        grossAmount: expectedGross,
        serverKey: midtransServerKey,
      });

      // 1) Forged signature_key -> 401 WEBHOOK_SIGNATURE_INVALID
      const forgedSigRes = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send({
          order_id: pay1.providerReference,
          status_code: '200',
          gross_amount: expectedGross,
          transaction_status: 'settlement',
          transaction_id: `tx-forged-${Date.now()}`,
          signature_key: '0'.repeat(128),
        });
      expect(forgedSigRes.status).toBe(401);
      expect(forgedSigRes.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
      expect(JSON.stringify(forgedSigRes.body)).not.toContain(midtransServerKey);

      // 2) Altered gross_amount with original signature_key -> 401 WEBHOOK_SIGNATURE_INVALID
      const alteredAmountRes = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send({
          order_id: pay1.providerReference,
          status_code: '200',
          gross_amount: '1',
          transaction_status: 'settlement',
          transaction_id: `tx-altered-${Date.now()}`,
          signature_key: validSig1,
        });
      expect(alteredAmountRes.status).toBe(401);
      expect(alteredAmountRes.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');

      // Assert zero DB mutation after spoof attempts
      const orderAfterSpoof = await prisma.client.order.findUniqueOrThrow({
        where: { id: order1.id },
      });
      expect(orderAfterSpoof.status).toBe(OrderStatus.PENDING_PAYMENT);
      const eventsAfterSpoof = await prisma.client.paymentEvent.count({
        where: { paymentId: pay1.paymentId },
      });
      expect(eventsAfterSpoof).toBe(0);

      // 3) Sequential 3x replay of valid settlement webhook
      const seqTxId = `tx-seq-settle-${Date.now()}`;
      const seqPayload = {
        order_id: pay1.providerReference,
        status_code: '200',
        gross_amount: expectedGross,
        transaction_status: 'settlement',
        transaction_id: seqTxId,
        payment_type: 'qris',
        signature_key: validSig1,
      };

      const seq1 = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send(seqPayload);
      const seq2 = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send(seqPayload);
      const seq3 = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send(seqPayload);

      expect(seq1.status).toBe(200);
      expect(seq1.body.data).toMatchObject({ acknowledged: true, duplicate: false });
      expect(seq2.status).toBe(200);
      expect(seq2.body.data).toMatchObject({ acknowledged: true, duplicate: true });
      expect(seq3.status).toBe(200);
      expect(seq3.body.data).toMatchObject({ acknowledged: true, duplicate: true });

      const seqEvents = await prisma.client.paymentEvent.findMany({
        where: { paymentId: pay1.paymentId },
      });
      expect(seqEvents).toHaveLength(1);
      // Signature key must be redacted in stored payment_events payload
      expect((seqEvents[0]!.payload as Record<string, unknown>)['signature_key']).toBe(
        '[REDACTED]',
      );

      const seqSaleMovements = await prisma.client.inventoryMovement.findMany({
        where: {
          referenceType: 'order',
          referenceId: order1.id,
          type: InventoryMovementType.SALE,
        },
      });
      expect(seqSaleMovements).toHaveLength(1);
      expect(seqSaleMovements[0]!.quantityDelta).toBe(-2);

      const levelAfterSeq = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
      expect(levelAfterSeq.quantityOnHand).toBe(3);
      expect(levelAfterSeq.quantityReserved).toBe(0);

      // 4) Concurrent 3x replay of valid settlement webhook on Order 2
      const order2Res = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('X-Forwarded-For', '198.51.100.61')
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-o2-${Date.now()}`)
        .send({
          addressId: customer.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });
      expect(order2Res.status).toBe(201);
      const order2 = order2Res.body.data.order;
      createdOrderIds.push(order2.id);

      const pay2Res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${order2.id}/session`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-p2-${Date.now()}`)
        .send({});
      expect(pay2Res.status).toBe(201);
      const pay2 = pay2Res.body.data;
      createdPaymentIds.push(pay2.paymentId);

      const concTxId = `tx-conc-settle-${Date.now()}`;
      const concGross = String(order2.grandTotalIdr);
      const concSig = computeMidtransSignature({
        orderId: pay2.providerReference,
        statusCode: '200',
        grossAmount: concGross,
        serverKey: midtransServerKey,
      });
      const concPayload = {
        order_id: pay2.providerReference,
        status_code: '200',
        gross_amount: concGross,
        transaction_status: 'settlement',
        transaction_id: concTxId,
        payment_type: 'bank_transfer',
        signature_key: concSig,
      };

      const concResponses = await Promise.all([
        request(app.getHttpServer()).post('/api/v1/payments/webhooks/midtrans').send(concPayload),
        request(app.getHttpServer()).post('/api/v1/payments/webhooks/midtrans').send(concPayload),
        request(app.getHttpServer()).post('/api/v1/payments/webhooks/midtrans').send(concPayload),
      ]);

      expect(concResponses.every((r) => r.status === 200 && r.body.data.acknowledged === true)).toBe(
        true,
      );
      expect(concResponses.filter((r) => r.body.data.duplicate === false)).toHaveLength(1);
      expect(concResponses.filter((r) => r.body.data.duplicate === true)).toHaveLength(2);

      const concEvents = await prisma.client.paymentEvent.findMany({
        where: { paymentId: pay2.paymentId },
      });
      expect(concEvents).toHaveLength(1);

      const concSaleMovements = await prisma.client.inventoryMovement.findMany({
        where: {
          referenceType: 'order',
          referenceId: order2.id,
          type: InventoryMovementType.SALE,
        },
      });
      expect(concSaleMovements).toHaveLength(1);
      expect(concSaleMovements[0]!.quantityDelta).toBe(-1);

      const levelAfterConc = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
      expect(levelAfterConc.quantityOnHand).toBe(2);
      expect(levelAfterConc.quantityReserved).toBe(0);
    });

    it('rejects amount mismatch from provider getStatus() without settling order or deducting stock', async () => {
      const customer = await seedCustomerWithAddress('t05-amt-mismatch');
      const { variantId } = await seedTestVariant({ priceIdr: 500_000, stock: 3 });

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('X-Forwarded-For', '198.51.100.62')
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-amt-o-${Date.now()}`)
        .send({
          addressId: customer.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });
      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data.order;
      createdOrderIds.push(order.id);

      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${order.id}/session`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-amt-p-${Date.now()}`)
        .send({});
      expect(payRes.status).toBe(201);
      const pay = payRes.body.data;
      createdPaymentIds.push(pay.paymentId);

      // Force provider status endpoint to report a mismatched grossAmountIdr
      await localPaymentStub.setStubStatus(pay.providerReference, {
        status: 'SETTLEMENT',
        grossAmountIdr: 1000,
      });

      const txId = `tx-amt-mismatch-${Date.now()}`;
      const sig = computeMidtransSignature({
        orderId: pay.providerReference,
        statusCode: '200',
        grossAmount: String(order.grandTotalIdr),
        serverKey: midtransServerKey,
      });

      const webhookRes = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send({
          order_id: pay.providerReference,
          status_code: '200',
          gross_amount: String(order.grandTotalIdr),
          transaction_status: 'settlement',
          transaction_id: txId,
          signature_key: sig,
        });
      expect(webhookRes.status).toBe(409);
      expect(webhookRes.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');

      const orderAfter = await prisma.client.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(orderAfter.status).toBe(OrderStatus.PENDING_PAYMENT);

      const levelAfter = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
      expect(levelAfter.quantityOnHand).toBe(3);
      expect(levelAfter.quantityReserved).toBe(1);
    });

    it('preserves CANCELLED and EXPIRED order states on late settlement webhook, prevents stock oversell, and flags PaymentEvent + Payment + AuditLog', async () => {
      const customer = await seedCustomerWithAddress('t05-late');
      const { variantId } = await seedTestVariant({ priceIdr: 900_000, stock: 2 });

      // --- Case A: Late settlement after CANCELLED ---
      const orderCancelRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('X-Forwarded-For', '198.51.100.63')
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-late-c-${Date.now()}`)
        .send({
          addressId: customer.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });
      expect(orderCancelRes.status).toBe(201);
      const cancelledOrder = orderCancelRes.body.data.order;
      createdOrderIds.push(cancelledOrder.id);

      const payCancelRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${cancelledOrder.id}/session`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-late-cp-${Date.now()}`)
        .send({});
      expect(payCancelRes.status).toBe(201);
      const cancelledPay = payCancelRes.body.data;
      createdPaymentIds.push(cancelledPay.paymentId);

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${cancelledOrder.id}/cancel`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-late-cc-${Date.now()}`)
        .send({ reason: 'Cancelled before late webhook' });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe(OrderStatus.CANCELLED);

      const lateCancelTxId = `tx-late-cancel-${Date.now()}`;
      const lateCancelSig = computeMidtransSignature({
        orderId: cancelledPay.providerReference,
        statusCode: '200',
        grossAmount: String(cancelledOrder.grandTotalIdr),
        serverKey: midtransServerKey,
      });

      const lateCancelWebhook = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send({
          order_id: cancelledPay.providerReference,
          status_code: '200',
          gross_amount: String(cancelledOrder.grandTotalIdr),
          transaction_status: 'settlement',
          transaction_id: lateCancelTxId,
          signature_key: lateCancelSig,
        });
      expect(lateCancelWebhook.status).toBe(200);

      const dbCancelledOrder = await prisma.client.order.findUniqueOrThrow({
        where: { id: cancelledOrder.id },
      });
      expect(dbCancelledOrder.status).toBe(OrderStatus.CANCELLED);

      const dbCancelledPayment = await prisma.client.payment.findUniqueOrThrow({
        where: { id: cancelledPay.paymentId },
      });
      expect(dbCancelledPayment.failureReason).toContain('MANUAL_REVIEW_REQUIRED');

      const dbCancelledEvent = await prisma.client.paymentEvent.findUniqueOrThrow({
        where: {
          provider_providerEventId: {
            provider: 'midtrans',
            providerEventId: lateCancelTxId,
          },
        },
      });
      expect(dbCancelledEvent.processingError).toContain('MANUAL_REVIEW_REQUIRED');

      const cancelAudit = await prisma.client.auditLog.findFirst({
        where: {
          action: 'payment.late_settlement_conflict',
          resource: 'payment',
          resourceId: cancelledPay.paymentId,
        },
      });
      expect(cancelAudit).toBeTruthy();

      // --- Case B: Late settlement after EXPIRED ---
      const orderExpireRes = await request(app.getHttpServer())
        .post('/api/v1/checkout/orders')
        .set('Origin', config.APP_URL)
        .set('X-Forwarded-For', '198.51.100.63')
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-late-e-${Date.now()}`)
        .send({
          addressId: customer.addressId,
          shipping: { provider: 'jne-adapter', service: 'REG' },
          items: [{ variantId, quantity: 1 }],
        });
      expect(orderExpireRes.status).toBe(201);
      const expiredOrder = orderExpireRes.body.data.order;
      createdOrderIds.push(expiredOrder.id);

      const payExpireRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${expiredOrder.id}/session`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customer.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
        .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `sec-t05-late-ep-${Date.now()}`)
        .send({});
      expect(payExpireRes.status).toBe(201);
      const expiredPay = payExpireRes.body.data;
      createdPaymentIds.push(expiredPay.paymentId);

      // Simulate expiry worker marking order & payment EXPIRED and releasing reservation
      await prisma.withTransaction(async (tx) => {
        await tx.order.update({
          where: { id: expiredOrder.id },
          data: { status: OrderStatus.EXPIRED },
        });
        await tx.payment.update({
          where: { id: expiredPay.paymentId },
          data: { status: PaymentStatus.EXPIRED },
        });
        await inventoryReservation.releaseOrderReservations(tx, {
          orderId: expiredOrder.id,
          targetStatus: 'EXPIRED',
          actorId: null,
          reason: 'Reservation window expired',
        });
      });

      const lateExpireTxId = `tx-late-expire-${Date.now()}`;
      const lateExpireSig = computeMidtransSignature({
        orderId: expiredPay.providerReference,
        statusCode: '200',
        grossAmount: String(expiredOrder.grandTotalIdr),
        serverKey: midtransServerKey,
      });

      const lateExpireWebhook = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send({
          order_id: expiredPay.providerReference,
          status_code: '200',
          gross_amount: String(expiredOrder.grandTotalIdr),
          transaction_status: 'settlement',
          transaction_id: lateExpireTxId,
          signature_key: lateExpireSig,
        });
      expect(lateExpireWebhook.status).toBe(200);

      const dbExpiredOrder = await prisma.client.order.findUniqueOrThrow({
        where: { id: expiredOrder.id },
      });
      expect(dbExpiredOrder.status).toBe(OrderStatus.EXPIRED);

      const dbExpiredPayment = await prisma.client.payment.findUniqueOrThrow({
        where: { id: expiredPay.paymentId },
      });
      expect(dbExpiredPayment.status).toBe(PaymentStatus.EXPIRED);
      expect(dbExpiredPayment.failureReason).toContain('MANUAL_REVIEW_REQUIRED');

      const dbExpiredEvent = await prisma.client.paymentEvent.findUniqueOrThrow({
        where: {
          provider_providerEventId: {
            provider: 'midtrans',
            providerEventId: lateExpireTxId,
          },
        },
      });
      expect(dbExpiredEvent.processingError).toContain('MANUAL_REVIEW_REQUIRED');

      const expireAudit = await prisma.client.auditLog.findFirst({
        where: {
          action: 'payment.late_settlement_conflict',
          resource: 'payment',
          resourceId: expiredPay.paymentId,
        },
      });
      expect(expireAudit).toBeTruthy();

      // Stock must remain completely untouched (2 onHand, 0 reserved, 0 SALE movements)
      const finalLevel = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
      expect(finalLevel.quantityOnHand).toBe(2);
      expect(finalLevel.quantityReserved).toBe(0);

      const saleCount = await prisma.client.inventoryMovement.count({
        where: { variantId, type: InventoryMovementType.SALE },
      });
      expect(saleCount).toBe(0);
    });
  });
});
