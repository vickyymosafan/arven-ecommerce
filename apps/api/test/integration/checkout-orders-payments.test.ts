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
import {
  SessionStoreService,
  TokenCryptoService,
  checkRouteAuthMetadata,
} from '../../src/common/security/index.js';
import { createApp } from '../../src/main.js';
import {
  LOCAL_STUB_DEFAULT_MIDTRANS_SERVER_KEY,
  computeMidtransSignature,
} from '../../src/shared/adapters/payment.provider.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/shared/redis/redis.module.js';

describe('Phase 05 Checkout, Orders & Payments — Live PostgreSQL 18 + Redis Integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let config: RuntimeConfig;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;
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
        await prisma.client.coupon.deleteMany({
          where: { id: { in: createdCouponIds } },
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

  async function seedTestVariant(opts: {
    priceIdr: number;
    stock: number;
    weightGrams?: number;
  }): Promise<{ productId: string; variantId: string; sku: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const product = await prisma.client.product.create({
      data: {
        slug: `p5-garment-${suffix}`,
        name: `Phase05 Cashmere Coat ${suffix}`,
        description: 'Luxury double-faced wool coat for Phase 05 integration test.',
        material: '100% Virgin Wool',
        fit: 'Tailored Fit',
        careInstruction: 'Dry clean only.',
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        publishedAt: new Date(),
        variants: {
          create: {
            sku: `ARV-P5-${suffix}`.slice(0, 48).toUpperCase(),
            size: 'M',
            color: 'Obsidian',
            colorHex: '#17191B',
            priceIdr: BigInt(opts.priceIdr),
            weightGrams: opts.weightGrams ?? 900,
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

    return {
      productId: product.id,
      variantId: variant.id,
      sku: variant.sku,
    };
  }

  async function seedCustomerWithAddress(): Promise<{
    userId: string;
    email: string;
    addressId: string;
    cookieHeader: string;
    csrfToken: string;
  }> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: 'CUSTOMER' },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const email = `p5-customer-${suffix}@arven.local`;

    const user = await prisma.client.user.create({
      data: {
        email,
        passwordHash: 'argon2id-test-placeholder',
        fullName: 'Nadia Kusuma',
        phone: '+6281234567890',
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        userRoles: { create: { roleId: role.id } },
        addresses: {
          create: {
            label: 'Home',
            recipientName: 'Nadia Kusuma',
            phone: '+6281234567890',
            addressLine1: 'Jl. Kemang Raya No. 42',
            city: 'Jakarta Selatan',
            province: 'DKI Jakarta',
            postalCode: '12730',
            countryCode: 'ID',
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
    createdUserIds.push(user.id);
    createdIdempotencyActors.push(`user:${user.id}`);

    const rawToken = `raw-p5-session-${user.id}-${Date.now()}`;
    const tokenHash = tokenCrypto.sha256Hex(rawToken);
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();

    await prisma.client.session.create({
      data: {
        userId: user.id,
        scope: SessionScope.CUSTOMER,
        tokenHash,
        csrfSecret,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const cookieName = sessionStore.getCookieName(SessionScope.CUSTOMER);
    return {
      userId: user.id,
      email,
      addressId: user.addresses[0]!.id,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
    };
  }

  async function seedCoupon(code: string): Promise<string> {
    const coupon = await prisma.client.coupon.create({
      data: {
        code,
        name: `Test Coupon ${code}`,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10n,
        maxDiscountIdr: 500_000n,
        minOrderSubtotalIdr: 200_000n,
        usageLimitTotal: 10,
        usageLimitPerUser: 2,
        status: CouponStatus.ACTIVE,
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2029-12-31T23:59:59.000Z'),
      },
    });
    createdCouponIds.push(coupon.id);
    return coupon.id;
  }

  function issueGuestCsrf(): { cookieHeader: string; csrfToken: string } {
    const issued = tokenCrypto.issuePreAuthCsrf();
    return {
      cookieHeader: `${sessionStore.getPreAuthCsrfCookieName()}=${issued.cookieValue}`,
      csrfToken: issued.token,
    };
  }

  it('quotes IDR totals with coupon allocation and executes guest checkout -> payment -> Midtrans webhook settlement + dedup', async () => {
    const guestCsrf = issueGuestCsrf();
    const { variantId } = await seedTestVariant({
      priceIdr: 1_250_000,
      stock: 5,
      weightGrams: 1100,
    });
    const couponCode = `P5TEN${Date.now().toString(36).toUpperCase()}`;
    await seedCoupon(couponCode);

    const guestEmail = `guest-${Date.now()}@arven.local`;
    createdIdempotencyActors.push(
      `guest:${createHash('sha256').update(guestEmail).digest('hex').slice(0, 24)}`,
    );

    const guestAddress = {
      recipientName: 'Sora Pratama',
      phone: '+6281299988877',
      line1: 'Jl. Sunset Road No. 18',
      city: 'Denpasar',
      province: 'Bali',
      postalCode: '80361',
      countryCode: 'ID' as const,
    };

    const quoteRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/quote')
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCsrf.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
      .send({
        guestAddress,
        shipping: { provider: 'jne-adapter', service: 'REG' },
        couponCode,
        items: [{ variantId, quantity: 2 }],
      });

    expect(quoteRes.status).toBe(200);
    expect(quoteRes.headers['cache-control']).toContain('no-store');
    expect(quoteRes.body.success).toBe(true);
    expect(quoteRes.body.data.subtotalIdr).toBe(2_500_000);
    expect(quoteRes.body.data.discountTotalIdr).toBe(250_000);
    // 2 * 1100g = 2200g -> 3kg Outer Island JNE REG = 3 * 38_000 = 114_000
    expect(quoteRes.body.data.shippingTotalIdr).toBe(114_000);
    expect(quoteRes.body.data.grandTotalIdr).toBe(2_364_000);

    const idempotencyKey = `p5-guest-order-${Date.now()}`;
    const orderPayload = {
      guestEmail,
      guestAddress,
      shipping: { provider: 'jne-adapter', service: 'REG' },
      couponCode,
      items: [{ variantId, quantity: 2 }],
    };

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/orders')
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCsrf.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, idempotencyKey)
      .send(orderPayload);

    expect(createRes.status).toBe(201);
    expect(createRes.headers['cache-control']).toContain('no-store');
    const createdOrder = createRes.body.data.order;
    const guestToken = createRes.body.data.guestToken as string;
    expect(typeof guestToken).toBe('string');
    expect(guestToken.length).toBeGreaterThanOrEqual(32);
    createdOrderIds.push(createdOrder.id);

    const guestActorScope = `guest:${tokenCrypto.sha256Hex(guestToken).slice(0, 24)}`;
    createdIdempotencyActors.push(guestActorScope);

    // Idempotent replay returns identical result
    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/orders')
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCsrf.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, idempotencyKey)
      .send(orderPayload);
    expect(replayRes.status).toBe(201);
    expect(replayRes.headers['idempotent-replayed']).toBe('true');
    expect(replayRes.body.data.order.id).toBe(createdOrder.id);

    // Stock reserved in DB
    const reservedLevel = await prisma.client.inventoryLevel.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    expect(reservedLevel.quantityOnHand).toBe(5);
    expect(reservedLevel.quantityReserved).toBe(2);

    // Guest order lookup requires valid token
    const unauthLookup = await request(app.getHttpServer()).get(
      `/api/v1/orders/${createdOrder.orderNumber}`,
    );
    expect(unauthLookup.status).toBe(401);

    const wrongTokenLookup = await request(app.getHttpServer())
      .get(`/api/v1/orders/${createdOrder.orderNumber}`)
      .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, 'wrong-guest-token-value');
    expect(wrongTokenLookup.status).toBe(404);

    const validLookup = await request(app.getHttpServer())
      .get(`/api/v1/orders/${createdOrder.orderNumber}`)
      .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, guestToken);
    expect(validLookup.status).toBe(200);
    expect(validLookup.headers['cache-control']).toContain('no-store');
    expect(validLookup.body.data.grandTotalIdr).toBe(2_364_000);

    // Create payment session (and reuse on second request with new idempotency key)
    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/payments/${createdOrder.id}/session`)
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCsrf.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `p5-pay-1-${Date.now()}`)
      .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, guestToken)
      .send({});
    expect(payRes.status).toBe(201);
    const paymentSession = payRes.body.data;
    createdPaymentIds.push(paymentSession.paymentId);

    const payReuseRes = await request(app.getHttpServer())
      .post(`/api/v1/payments/${createdOrder.id}/session`)
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCsrf.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `p5-pay-2-${Date.now()}`)
      .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, guestToken)
      .send({});
    expect(payReuseRes.status).toBe(201);
    expect(payReuseRes.body.data.paymentId).toBe(paymentSession.paymentId);

    // GET /payments/:id returns summary with valid token
    const getPayRes = await request(app.getHttpServer())
      .get(`/api/v1/payments/${paymentSession.paymentId}`)
      .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, guestToken);
    expect(getPayRes.status).toBe(200);
    expect(getPayRes.body.data.providerReference).toBe(paymentSession.providerReference);

    // Unsupported webhook provider -> 404
    const badProviderRes = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/unknown-gateway')
      .send({
        order_id: paymentSession.providerReference,
        status_code: '200',
        gross_amount: '2364000',
        transaction_status: 'settlement',
        transaction_id: `tx-bad-provider-${Date.now()}`,
        signature_key: 'abc',
      });
    expect(badProviderRes.status).toBe(404);

    // Invalid webhook signature -> 401
    const badSigRes = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/midtrans')
      .send({
        order_id: paymentSession.providerReference,
        status_code: '200',
        gross_amount: '2364000',
        transaction_status: 'settlement',
        transaction_id: `tx-bad-sig-${Date.now()}`,
        signature_key: 'invalid-signature',
      });
    expect(badSigRes.status).toBe(401);

    // Valid Midtrans settlement webhook
    const txId = `tx-settle-${Date.now()}`;
    const validSig = computeMidtransSignature({
      orderId: paymentSession.providerReference,
      statusCode: '200',
      grossAmount: '2364000',
      serverKey: midtransServerKey,
    });

    const webhookRes = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/midtrans')
      .send({
        order_id: paymentSession.providerReference,
        status_code: '200',
        gross_amount: '2364000',
        transaction_status: 'settlement',
        transaction_id: txId,
        payment_type: 'qris',
        signature_key: validSig,
      });
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.data.acknowledged).toBe(true);
    expect(webhookRes.body.data.duplicate).toBe(false);
    expect(webhookRes.body.data.paymentStatus).toBe('SETTLEMENT');

    // Duplicate webhook replay acknowledged without double deduction
    const dupRes = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/midtrans')
      .send({
        order_id: paymentSession.providerReference,
        status_code: '200',
        gross_amount: '2364000',
        transaction_status: 'settlement',
        transaction_id: txId,
        payment_type: 'qris',
        signature_key: validSig,
      });
    expect(dupRes.status).toBe(200);
    expect(dupRes.body.data.duplicate).toBe(true);

    // Verify order PAID, stock committed (onHand=3, reserved=0), SALE movement written
    const settledOrder = await prisma.client.order.findUniqueOrThrow({
      where: { id: createdOrder.id },
    });
    expect(settledOrder.status).toBe(OrderStatus.PAID);

    const committedLevel = await prisma.client.inventoryLevel.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    expect(committedLevel.quantityOnHand).toBe(3);
    expect(committedLevel.quantityReserved).toBe(0);

    const saleMovement = await prisma.client.inventoryMovement.findFirst({
      where: {
        referenceType: 'order',
        referenceId: createdOrder.id,
        type: InventoryMovementType.SALE,
      },
    });
    expect(saleMovement?.quantityDelta).toBe(-2);

    // Cannot cancel an already PAID order
    const cancelPaidRes = await request(app.getHttpServer())
      .post(`/api/v1/orders/${createdOrder.id}/cancel`)
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCsrf.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `p5-cancel-paid-${Date.now()}`)
      .set(HTTP_HEADERS.GUEST_ORDER_TOKEN, guestToken)
      .send({ reason: 'Too late' });
    expect(cancelPaidRes.status).toBe(409);
  });

  it('allows authenticated customer checkout, listing, cancellation with reservation release, and flags late settlement after cancel', async () => {
    const customer = await seedCustomerWithAddress();
    const { variantId } = await seedTestVariant({
      priceIdr: 800_000,
      stock: 4,
      weightGrams: 700,
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/orders')
      .set('Origin', config.APP_URL)
      .set('Cookie', customer.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `p5-cust-order-${Date.now()}`)
      .send({
        addressId: customer.addressId,
        shipping: { provider: 'sicepat-adapter', service: 'REG' },
        items: [{ variantId, quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    const order = createRes.body.data.order;
    createdOrderIds.push(order.id);
    expect(order.isGuest).toBe(false);
    expect(createRes.body.data.guestToken).toBeNull();
    // Jabodetabek SiCepat REG 1kg = 16_000
    expect(order.shippingTotalIdr).toBe(16_000);
    expect(order.grandTotalIdr).toBe(816_000);

    // List customer orders
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Cookie', customer.cookieHeader);
    expect(listRes.status).toBe(200);
    expect(listRes.headers['cache-control']).toContain('no-store');
    expect(listRes.body.data.some((row: { id: string }) => row.id === order.id)).toBe(
      true,
    );

    // Create payment session before cancelling so we can test late settlement safeguard
    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.id}/session`)
      .set('Origin', config.APP_URL)
      .set('Cookie', customer.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `p5-cust-pay-${Date.now()}`)
      .send({});
    expect(payRes.status).toBe(201);
    const paymentSession = payRes.body.data;
    createdPaymentIds.push(paymentSession.paymentId);

    // Cancel order -> releases stock & expires pending payment
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set('Origin', config.APP_URL)
      .set('Cookie', customer.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `p5-cust-cancel-${Date.now()}`)
      .send({ reason: 'Changed mind before payment' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe(OrderStatus.CANCELLED);

    const levelAfterCancel = await prisma.client.inventoryLevel.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    expect(levelAfterCancel.quantityOnHand).toBe(4);
    expect(levelAfterCancel.quantityReserved).toBe(0);

    const releasedReservation = await prisma.client.stockReservation.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(releasedReservation.status).toBe(StockReservationStatus.RELEASED);

    // Late settlement webhook arrives AFTER order was already CANCELLED
    const lateTxId = `tx-late-${Date.now()}`;
    const lateSig = computeMidtransSignature({
      orderId: paymentSession.providerReference,
      statusCode: '200',
      grossAmount: '816000',
      serverKey: midtransServerKey,
    });

    const lateWebhookRes = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/midtrans')
      .send({
        order_id: paymentSession.providerReference,
        status_code: '200',
        gross_amount: '816000',
        transaction_status: 'settlement',
        transaction_id: lateTxId,
        signature_key: lateSig,
      });
    expect(lateWebhookRes.status).toBe(200);

    // Order must stay CANCELLED, stock untouched, PaymentEvent processingError flagged
    const orderAfterLate = await prisma.client.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderAfterLate.status).toBe(OrderStatus.CANCELLED);

    const paymentAfterLate = await prisma.client.payment.findUniqueOrThrow({
      where: { id: paymentSession.paymentId },
    });
    expect(paymentAfterLate.status).toBe(PaymentStatus.EXPIRED);
    expect(paymentAfterLate.failureReason).toContain('MANUAL_REVIEW_REQUIRED');

    const flaggedEvent = await prisma.client.paymentEvent.findUniqueOrThrow({
      where: {
        provider_providerEventId: {
          provider: 'midtrans',
          providerEventId: lateTxId,
        },
      },
    });
    expect(flaggedEvent.processingError).toContain('MANUAL_REVIEW_REQUIRED');
  });
});
