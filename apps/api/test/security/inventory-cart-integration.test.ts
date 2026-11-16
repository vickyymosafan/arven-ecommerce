import 'reflect-metadata';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_WAREHOUSE_CODE,
  GUEST_CART_COOKIE_NAME,
  HTTP_HEADERS,
  loadRuntimeConfig,
  type RuntimeConfig,
} from '@arven/config';
import {
  CartStatus,
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
  type AuthenticatedActor,
} from '../../src/common/security/index.js';
import { createApp } from '../../src/main.js';
import { InventoryService } from '../../src/modules/inventory/index.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/shared/redis/redis.module.js';

function extractCookiePair(
  setCookieHeaders: string | string[] | undefined,
  cookieName: string,
): { rawHeader: string; cookiePair: string; value: string } | null {
  if (!setCookieHeaders) {
    return null;
  }
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const header of list) {
    const firstPart = header.split(';')[0]?.trim() ?? '';
    const eqIndex = firstPart.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const name = firstPart.slice(0, eqIndex);
    if (name === cookieName) {
      return {
        rawHeader: header,
        cookiePair: firstPart,
        value: decodeURIComponent(firstPart.slice(eqIndex + 1)),
      };
    }
  }
  return null;
}

describe('Phase 04 Inventory Ledger & Cart Module — Live PostgreSQL 18 + Memurai Integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let config: RuntimeConfig;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;
  let inventoryService: InventoryService;

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdCartIds: string[] = [];
  const createdLevelIds: string[] = [];

  beforeAll(async () => {
    const baseConfig = loadRuntimeConfig();
    const testConfig: RuntimeConfig = {
      ...baseConfig,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
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
    inventoryService = app.get(InventoryService);

    await redis.flushdb();
  });

  afterAll(async () => {
    if (prisma) {
      if (createdCartIds.length > 0) {
        await prisma.client.cartItem.deleteMany({
          where: { cartId: { in: createdCartIds } },
        });
        await prisma.client.cart.updateMany({
          where: { id: { in: createdCartIds } },
          data: { mergedIntoCartId: null },
        });
        await prisma.client.cart.deleteMany({
          where: { id: { in: createdCartIds } },
        });
      }

      if (createdVariantIds.length > 0) {
        await prisma.client.cartItem.deleteMany({
          where: { variantId: { in: createdVariantIds } },
        });
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

      if (createdOrderIds.length > 0) {
        await prisma.client.order.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }

      if (createdProductIds.length > 0) {
        await prisma.client.product.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }

      if (createdLevelIds.length > 0) {
        await prisma.client.outboxEvent.deleteMany({
          where: {
            aggregateType: 'inventory_level',
            aggregateId: { in: createdLevelIds },
          },
        });
      }

      if (createdUserIds.length > 0) {
        const scopes = createdUserIds.map((id) => `admin:${id}`);
        await prisma.client.idempotencyRecord.deleteMany({
          where: { actorScope: { in: scopes } },
        });
        await prisma.client.session.deleteMany({
          where: { userId: { in: createdUserIds } },
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

  async function createAuthenticatedSession(opts: {
    roleCode: 'INVENTORY' | 'PRODUCT' | 'CONTENT' | 'CUSTOMER';
    scope: SessionScope;
    mfaVerified: boolean;
  }): Promise<{
    userId: string;
    email: string;
    cookieHeader: string;
    csrfToken: string;
  }> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: opts.roleCode },
    });

    const email = `p4-int-${opts.roleCode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@arven.local`;
    const user = await prisma.client.user.create({
      data: {
        email,
        passwordHash: 'argon2id-test-placeholder',
        fullName: `Phase04 Test ${opts.roleCode}`,
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        mfaEnabled: opts.scope === SessionScope.ADMIN,
        userRoles: {
          create: { roleId: role.id },
        },
      },
    });
    createdUserIds.push(user.id);

    const rawToken = `raw-p4-session-${user.id}-${Date.now()}`;
    const tokenHash = tokenCrypto.sha256Hex(rawToken);
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();

    await prisma.client.session.create({
      data: {
        userId: user.id,
        scope: opts.scope,
        tokenHash,
        csrfSecret,
        mfaVerifiedAt: opts.mfaVerified ? new Date() : null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const cookieName = sessionStore.getCookieName(opts.scope);
    return {
      userId: user.id,
      email,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
    };
  }

  async function createTestProductWithVariant(opts: {
    skuPrefix: string;
    priceIdr?: number;
    compareAtPriceIdr?: number | null;
    status?: ProductStatus;
    isVisible?: boolean;
    variantIsActive?: boolean;
    initialOnHand?: number;
    initialReserved?: number;
    lowStockThreshold?: number;
  }): Promise<{
    productId: string;
    variantId: string;
    sku: string;
    levelId: string | null;
  }> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const sku = `${opts.skuPrefix}-${suffix.toUpperCase()}`;
    const product = await prisma.client.product.create({
      data: {
        slug: `p4-garment-${suffix}`,
        name: `Phase 04 Atelier Garment ${suffix}`,
        description: 'Structured wool blend tailoring piece for Phase 04 tests.',
        material: '100% Virgin Wool',
        fit: 'Tailored Fit',
        careInstruction: 'Dry clean only.',
        status: opts.status ?? ProductStatus.PUBLISHED,
        isVisible: opts.isVisible ?? true,
        publishedAt: new Date(),
        media: {
          create: {
            type: 'IMAGE',
            objectKey: `test/${suffix}.svg`,
            url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22500%22%3E%3Crect%20width%3D%22400%22%20height%3D%22500%22%20fill%3D%22%2317191B%22%2F%3E%3C%2Fsvg%3E',
            altText: 'Atelier garment primary studio frame',
            position: 0,
            isPrimary: true,
          },
        },
        variants: {
          create: {
            sku,
            size: 'M',
            color: 'Obsidian',
            colorHex: '#17191B',
            priceIdr: BigInt(opts.priceIdr ?? 1_250_000),
            compareAtPriceIdr:
              opts.compareAtPriceIdr !== undefined
                ? opts.compareAtPriceIdr !== null
                  ? BigInt(opts.compareAtPriceIdr)
                  : null
                : BigInt(1_450_000),
            weightGrams: 420,
            isActive: opts.variantIsActive ?? true,
          },
        },
      },
      include: {
        variants: true,
      },
    });

    const variant = product.variants[0]!;
    createdProductIds.push(product.id);
    createdVariantIds.push(variant.id);

    let levelId: string | null = null;
    if (opts.initialOnHand !== undefined) {
      const warehouse = await prisma.client.warehouse.findUniqueOrThrow({
        where: { code: DEFAULT_WAREHOUSE_CODE },
      });
      const level = await prisma.client.inventoryLevel.create({
        data: {
          warehouseId: warehouse.id,
          variantId: variant.id,
          quantityOnHand: opts.initialOnHand,
          quantityReserved: opts.initialReserved ?? 0,
          lowStockThreshold: opts.lowStockThreshold ?? 5,
        },
      });
      levelId = level.id;
      createdLevelIds.push(level.id);
    }

    return {
      productId: product.id,
      variantId: variant.id,
      sku,
      levelId,
    };
  }

  async function issuePreAuthCsrf(): Promise<{ cookiePair: string; csrfToken: string }> {
    const res = await request(app.getHttpServer()).get('/api/v1/csrf-token');
    expect(res.status).toBe(200);
    const cookieName = config.COOKIE_SECURE ? '__Host-arven_csrf' : 'arven_csrf';
    const cookie = extractCookiePair(res.headers['set-cookie'], cookieName);
    expect(cookie).toBeTruthy();
    return {
      cookiePair: cookie!.cookiePair,
      csrfToken: res.body.data.csrfToken as string,
    };
  }

  it('enforces granular inventory RBAC (401, 403 for CUSTOMER/CONTENT, read-only PRODUCT, receive vs adjust separation)', async () => {
    const unauth = await request(app.getHttpServer()).get('/api/v1/admin/inventory/levels');
    expect(unauth.status).toBe(401);

    const customer = await createAuthenticatedSession({
      roleCode: 'CUSTOMER',
      scope: SessionScope.CUSTOMER,
      mfaVerified: false,
    });
    const customerRes = await request(app.getHttpServer())
      .get('/api/v1/admin/inventory/levels')
      .set('Cookie', customer.cookieHeader);
    expect([401, 403]).toContain(customerRes.status);

    const content = await createAuthenticatedSession({
      roleCode: 'CONTENT',
      scope: SessionScope.ADMIN,
      mfaVerified: true,
    });
    const contentRes = await request(app.getHttpServer())
      .get('/api/v1/admin/inventory/levels')
      .set('Cookie', content.cookieHeader);
    expect(contentRes.status).toBe(403);

    const productUser = await createAuthenticatedSession({
      roleCode: 'PRODUCT',
      scope: SessionScope.ADMIN,
      mfaVerified: true,
    });
    const productReadRes = await request(app.getHttpServer())
      .get('/api/v1/admin/inventory/levels')
      .set('Cookie', productUser.cookieHeader);
    expect(productReadRes.status).toBe(200);

    const { variantId } = await createTestProductWithVariant({
      skuPrefix: 'ARV-RBAC',
      initialOnHand: 10,
    });

    const productWriteRes = await request(app.getHttpServer())
      .post('/api/v1/admin/stock-movements')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productUser.cookieHeader)
      .set('X-CSRF-Token', productUser.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `idem-rbac-prod-${Date.now()}`)
      .send({
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
        variantId,
        type: 'RECEIPT',
        quantityDelta: 5,
      });
    expect(productWriteRes.status).toBe(403);

    // Fine-grained permission split: receive-only actor cannot adjust, adjust-only actor cannot receive
    const invOperator = await createAuthenticatedSession({
      roleCode: 'INVENTORY',
      scope: SessionScope.ADMIN,
      mfaVerified: true,
    });
    const noopRes = {
      setHeader: () => undefined,
      status: () => undefined,
    };

    const receiveOnlyActor: AuthenticatedActor = {
      userId: invOperator.userId,
      email: invOperator.email,
      fullName: 'Receive Only Actor',
      sessionId: '00000000-0000-4000-8000-000000000001',
      sessionTokenHash: 'a'.repeat(64),
      scope: SessionScope.ADMIN,
      roles: ['INVENTORY'],
      permissions: ['inventory.read', 'inventory.receive'],
      mfaEnabled: true,
      mfaVerifiedAt: new Date(),
    };

    await expect(
      inventoryService.createStockMovement({
        actor: receiveOnlyActor,
        body: {
          warehouseCode: DEFAULT_WAREHOUSE_CODE,
          variantId,
          type: 'ADJUSTMENT',
          quantityDelta: -2,
          referenceType: 'MANUAL_ADMIN',
          reason: 'Cycle count adjustment',
        },
        idempotencyKey: `idem-rbac-adj-${Date.now()}`,
        res: noopRes,
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const recvResult = await inventoryService.createStockMovement({
      actor: receiveOnlyActor,
      body: {
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
        variantId,
        type: 'RECEIPT',
        quantityDelta: 3,
        referenceType: 'MANUAL_ADMIN',
      },
      idempotencyKey: `idem-rbac-recv-${Date.now()}`,
      res: noopRes,
      ipAddress: '127.0.0.1',
    });
    expect(recvResult.level.quantityOnHand).toBe(13);

    const adjustOnlyActor: AuthenticatedActor = {
      ...receiveOnlyActor,
      fullName: 'Adjust Only Actor',
      permissions: ['inventory.read', 'inventory.adjust'],
    };

    await expect(
      inventoryService.createStockMovement({
        actor: adjustOnlyActor,
        body: {
          warehouseCode: DEFAULT_WAREHOUSE_CODE,
          variantId,
          type: 'RECEIPT',
          quantityDelta: 2,
          referenceType: 'MANUAL_ADMIN',
        },
        idempotencyKey: `idem-rbac-recv2-${Date.now()}`,
        res: noopRes,
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const adjResult = await inventoryService.createStockMovement({
      actor: adjustOnlyActor,
      body: {
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
        variantId,
        type: 'ADJUSTMENT',
        quantityDelta: -1,
        referenceType: 'MANUAL_ADMIN',
        reason: 'Damaged sample removal',
      },
      idempotencyKey: `idem-rbac-adj2-${Date.now()}`,
      res: noopRes,
      ipAddress: '127.0.0.1',
    });
    expect(adjResult.level.quantityOnHand).toBe(12);
  });

  it('enforces inventory ledger invariants, idempotency replay/conflict/recovery, outbox events, reservations view, and concurrency safety', async () => {
    const invAdmin = await createAuthenticatedSession({
      roleCode: 'INVENTORY',
      scope: SessionScope.ADMIN,
      mfaVerified: true,
    });

    // Uninitialized level (no inventory_levels row yet) -> will be initialized atomically on RECEIPT
    const { variantId, sku } = await createTestProductWithVariant({
      skuPrefix: 'ARV-LEDGER',
    });

    // 1. Missing / malformed Idempotency-Key -> 400 INVALID_IDEMPOTENCY_KEY
    const missingKeyRes = await request(app.getHttpServer())
      .post('/api/v1/admin/stock-movements')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', invAdmin.cookieHeader)
      .set('X-CSRF-Token', invAdmin.csrfToken)
      .send({
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
        variantId,
        type: 'RECEIPT',
        quantityDelta: 10,
      });
    expect(missingKeyRes.status).toBe(400);
    expect(missingKeyRes.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');

    // 2. Valid RECEIPT -> 201 + movement + audit + outbox inventory.received
    const idemKey = `idem-ledger-receipt-${Date.now()}`;
    const receiptRes = await request(app.getHttpServer())
      .post('/api/v1/admin/stock-movements')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', invAdmin.cookieHeader)
      .set('X-CSRF-Token', invAdmin.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, idemKey)
      .send({
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
        variantId,
        type: 'RECEIPT',
        quantityDelta: 10,
        referenceType: 'PO_RECEIPT',
        reason: 'Initial atelier batch arrival',
      });

    expect(receiptRes.status).toBe(201);
    expect(receiptRes.body.success).toBe(true);
    const levelId = receiptRes.body.data.level.id as string;
    createdLevelIds.push(levelId);
    expect(receiptRes.body.data.level.quantityOnHand).toBe(10);
    expect(receiptRes.body.data.level.availableQty).toBe(10);
    expect(receiptRes.body.data.level.stockStatus).toBe('IN_STOCK');
    expect(receiptRes.body.data.movement.type).toBe('RECEIPT');
    expect(receiptRes.body.data.movement.actorEmail).toBe(invAdmin.email);

    const outboxRow = await prisma.client.outboxEvent.findFirst({
      where: {
        aggregateType: 'inventory_level',
        aggregateId: levelId,
        eventType: 'inventory.received',
      },
    });
    expect(outboxRow).toBeTruthy();

    const auditRow = await prisma.client.auditLog.findFirst({
      where: {
        actorId: invAdmin.userId,
        action: 'inventory.movement.created',
        resourceId: levelId,
      },
    });
    expect(auditRow).toBeTruthy();

    // 3. Idempotent replay with reordered payload keys -> 201 + Idempotent-Replayed: true, no double increment
    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/admin/stock-movements')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', invAdmin.cookieHeader)
      .set('X-CSRF-Token', invAdmin.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, idemKey)
      .send({
        reason: 'Initial atelier batch arrival',
        referenceType: 'PO_RECEIPT',
        quantityDelta: 10,
        type: 'RECEIPT',
        variantId,
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
      });

    expect(replayRes.status).toBe(201);
    expect(replayRes.headers[HTTP_HEADERS.IDEMPOTENT_REPLAYED]).toBe('true');
    expect(replayRes.body.data).toEqual(receiptRes.body.data);

    // 4. Same Idempotency-Key with different payload -> 409 IDEMPOTENCY_CONFLICT
    const conflictRes = await request(app.getHttpServer())
      .post('/api/v1/admin/stock-movements')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', invAdmin.cookieHeader)
      .set('X-CSRF-Token', invAdmin.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, idemKey)
      .send({
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
        variantId,
        type: 'RECEIPT',
        quantityDelta: 15,
      });
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

    // 5. Create active reservation of 4 units so quantityReserved = 4, quantityOnHand = 10
    const warehouse = await prisma.client.warehouse.findUniqueOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
    });
    const order = await prisma.client.order.create({
      data: {
        orderNumber: `ARV-TEST-${Date.now().toString().slice(-6)}`,
        guestEmail: 'guest-res@arven.local',
        guestTokenHash: 'b'.repeat(64),
        subtotalIdr: BigInt(1_250_000),
        discountTotalIdr: BigInt(0),
        shippingTotalIdr: BigInt(25_000),
        grandTotalIdr: BigInt(1_275_000),
        shippingProvider: 'JNE',
        shippingService: 'REG',
        addressSnapshot: { city: 'Jakarta' },
        paymentExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    createdOrderIds.push(order.id);

    await prisma.client.inventoryLevel.update({
      where: { id: levelId },
      data: { quantityReserved: 4 },
    });
    await prisma.client.stockReservation.create({
      data: {
        orderId: order.id,
        warehouseId: warehouse.id,
        variantId,
        quantity: 4,
        status: StockReservationStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    // 6. Negative adjustment reducing onHand below quantityReserved (10 - 7 = 3 < 4) -> 409 INSUFFICIENT_STOCK
    //    AND failed key must NOT stay wedged in IN_PROGRESS!
    const recoveryKey = `idem-ledger-recover-${Date.now()}`;
    const overAdjustRes = await request(app.getHttpServer())
      .post('/api/v1/admin/stock-movements')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', invAdmin.cookieHeader)
      .set('X-CSRF-Token', invAdmin.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, recoveryKey)
      .send({
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
        variantId,
        type: 'ADJUSTMENT',
        quantityDelta: -7,
        reason: 'Attempted over-reduction',
      });
    expect(overAdjustRes.status).toBe(409);
    expect(overAdjustRes.body.error.code).toBe('INSUFFICIENT_STOCK');

    // Retry with same key and valid delta (-5 -> onHand=5 >= reserved=4) -> must succeed!
    const recoveredRes = await request(app.getHttpServer())
      .post('/api/v1/admin/stock-movements')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', invAdmin.cookieHeader)
      .set('X-CSRF-Token', invAdmin.csrfToken)
      .set(HTTP_HEADERS.IDEMPOTENCY_KEY, recoveryKey)
      .send({
        warehouseCode: DEFAULT_WAREHOUSE_CODE,
        variantId,
        type: 'ADJUSTMENT',
        quantityDelta: -5,
        reason: 'Valid shrinkage adjustment',
      });
    expect(recoveredRes.status).toBe(201);
    expect(recoveredRes.body.data.level.quantityOnHand).toBe(5);
    expect(recoveredRes.body.data.level.quantityReserved).toBe(4);
    expect(recoveredRes.body.data.level.availableQty).toBe(1);
    expect(recoveredRes.body.data.level.stockStatus).toBe('LOW_STOCK');

    // 7. Concurrent Promise.all stock movements -> serialized by SELECT FOR UPDATE without lost updates
    const concurrentResults = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        request(app.getHttpServer())
          .post('/api/v1/admin/stock-movements')
          .set('Origin', config.ADMIN_URL)
          .set('Cookie', invAdmin.cookieHeader)
          .set('X-CSRF-Token', invAdmin.csrfToken)
          .set(HTTP_HEADERS.IDEMPOTENCY_KEY, `idem-concurrent-${Date.now()}-${i}`)
          .send({
            warehouseCode: DEFAULT_WAREHOUSE_CODE,
            variantId,
            type: 'RECEIPT',
            quantityDelta: 2,
            reason: `Concurrent batch ${i}`,
          }),
      ),
    );
    for (const r of concurrentResults) {
      expect(r.status).toBe(201);
    }

    const levelAfterConcurrent = await prisma.client.inventoryLevel.findUniqueOrThrow({
      where: { id: levelId },
    });
    expect(levelAfterConcurrent.quantityOnHand).toBe(15); // 5 + 5*2

    // 8. Query endpoints: levels (q, lowStockOnly), movements (DESC order), reservations
    const levelsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/inventory/levels')
      .query({ q: sku, warehouseCode: DEFAULT_WAREHOUSE_CODE })
      .set('Cookie', invAdmin.cookieHeader);
    expect(levelsRes.status).toBe(200);
    expect(levelsRes.body.meta.total).toBe(1);
    expect(levelsRes.body.data[0].quantityOnHand).toBe(15);
    expect(levelsRes.body.data[0].availableQty).toBe(11);
    expect(levelsRes.body.data[0].stockStatus).toBe('IN_STOCK');

    const lowStockLevelsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/inventory/levels')
      .query({ lowStockOnly: 'true', limit: 100 })
      .set('Cookie', invAdmin.cookieHeader);
    expect(lowStockLevelsRes.status).toBe(200);
    expect(lowStockLevelsRes.body.meta.total).toBe(lowStockLevelsRes.body.data.length);
    for (const item of lowStockLevelsRes.body.data as Array<{
      availableQty: number;
      lowStockThreshold: number;
    }>) {
      expect(item.availableQty).toBeLessThanOrEqual(item.lowStockThreshold);
    }

    const movementsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/inventory/movements')
      .query({ variantId })
      .set('Cookie', invAdmin.cookieHeader);
    expect(movementsRes.status).toBe(200);
    expect(movementsRes.body.meta.total).toBe(7); // 1 receipt + 1 adj + 5 concurrent receipts
    const timestamps = (movementsRes.body.data as Array<{ createdAt: string }>).map((m) =>
      new Date(m.createdAt).getTime(),
    );
    for (let i = 1; i < timestamps.length; i += 1) {
      expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]!);
    }

    const reservationsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/inventory/reservations')
      .query({ variantId, status: 'ACTIVE' })
      .set('Cookie', invAdmin.cookieHeader);
    expect(reservationsRes.status).toBe(200);
    expect(reservationsRes.body.meta.total).toBe(1);
    expect(reservationsRes.body.data[0].orderNumber).toBe(order.orderNumber);
    expect(reservationsRes.body.data[0].quantity).toBe(4);
  });

  it('supports guest cart lifecycle, CSRF protection, SHA-256 cookie hashing, configuration normalization, stock guards, and cross-cart isolation', async () => {
    const { variantId } = await createTestProductWithVariant({
      skuPrefix: 'ARV-CART',
      priceIdr: 890_000,
      compareAtPriceIdr: 990_000,
      initialOnHand: 5,
    });
    const { variantId: oosVariantId } = await createTestProductWithVariant({
      skuPrefix: 'ARV-OOS',
      initialOnHand: 0,
    });

    // 1. Pure GET /cart without session/cookie returns empty cart and creates zero DB rows
    const beforeCartCount = await prisma.client.cart.count();
    const emptyGet = await request(app.getHttpServer()).get('/api/v1/cart');
    expect(emptyGet.status).toBe(200);
    expect(emptyGet.body.data).toMatchObject({
      id: null,
      ownerType: 'NONE',
      currency: 'IDR',
      itemCount: 0,
      totalQuantity: 0,
      subtotalIdr: 0,
      items: [],
    });
    expect(emptyGet.headers['set-cookie']).toBeUndefined();
    expect(await prisma.client.cart.count()).toBe(beforeCartCount);

    // 2. POST /cart/items without CSRF header -> 403 CSRF_INVALID
    const noCsrf = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .send({ variantId, quantity: 1 });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF_INVALID');

    // 3. POST /cart/items with pre-auth CSRF -> 200, sets HttpOnly SameSite=Lax guest cookie, stores SHA-256 hash
    const csrf1 = await issuePreAuthCsrf();
    const addRes1 = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .set('Cookie', csrf1.cookiePair)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf1.csrfToken)
      .send({
        variantId,
        quantity: 2,
        configuration: { monogram: 'ARV', finish: 'matte' },
      });

    expect(addRes1.status).toBe(200);
    const guestCartId = addRes1.body.data.id as string;
    createdCartIds.push(guestCartId);
    expect(addRes1.body.data.ownerType).toBe('GUEST');
    expect(addRes1.body.data.totalQuantity).toBe(2);
    expect(addRes1.body.data.subtotalIdr).toBe(1_780_000);

    const guestCookie = extractCookiePair(addRes1.headers['set-cookie'], GUEST_CART_COOKIE_NAME);
    expect(guestCookie).toBeTruthy();
    expect(guestCookie!.rawHeader).toContain('HttpOnly');
    expect(guestCookie!.rawHeader.toLowerCase()).toContain('samesite=lax');

    const dbCart = await prisma.client.cart.findUniqueOrThrow({
      where: { id: guestCartId },
    });
    const expectedHash = createHash('sha256').update(guestCookie!.value, 'utf8').digest('hex');
    expect(dbCart.guestTokenHash).toBe(expectedHash);
    expect(dbCart.guestTokenHash).not.toBe(guestCookie!.value);

    // 4. Adding same variant with reordered configuration keys sums onto same line item
    const addRes2 = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .set('Cookie', `${csrf1.cookiePair}; ${guestCookie!.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf1.csrfToken)
      .send({
        variantId,
        quantity: 1,
        configuration: { finish: 'matte', monogram: 'ARV' },
      });
    expect(addRes2.status).toBe(200);
    expect(addRes2.body.data.itemCount).toBe(1);
    expect(addRes2.body.data.totalQuantity).toBe(3);
    expect(addRes2.body.data.subtotalIdr).toBe(2_670_000);
    const lineItemId = addRes2.body.data.items[0].id as string;

    // 5. Exceeding available stock (3 + 3 = 6 > 5) -> 409 INSUFFICIENT_STOCK
    const overStockRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .set('Cookie', `${csrf1.cookiePair}; ${guestCookie!.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf1.csrfToken)
      .send({
        variantId,
        quantity: 3,
        configuration: { finish: 'matte', monogram: 'ARV' },
      });
    expect(overStockRes.status).toBe(409);
    expect(overStockRes.body.error.code).toBe('INSUFFICIENT_STOCK');

    // Out-of-stock variant -> 409 OUT_OF_STOCK
    const oosRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .set('Cookie', `${csrf1.cookiePair}; ${guestCookie!.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf1.csrfToken)
      .send({ variantId: oosVariantId, quantity: 1 });
    expect(oosRes.status).toBe(409);
    expect(oosRes.body.error.code).toBe('OUT_OF_STOCK');

    // 6. Cross-cart isolation: second guest cannot PATCH or DELETE first guest's line item -> 404
    const csrf2 = await issuePreAuthCsrf();
    const attackerAdd = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .set('Cookie', csrf2.cookiePair)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf2.csrfToken)
      .send({ variantId, quantity: 1 });
    expect(attackerAdd.status).toBe(200);
    createdCartIds.push(attackerAdd.body.data.id as string);
    const attackerCookie = extractCookiePair(attackerAdd.headers['set-cookie'], GUEST_CART_COOKIE_NAME)!;

    const crossPatch = await request(app.getHttpServer())
      .patch(`/api/v1/cart/items/${lineItemId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', `${csrf2.cookiePair}; ${attackerCookie.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf2.csrfToken)
      .send({ quantity: 2 });
    expect(crossPatch.status).toBe(404);
    expect(crossPatch.body.error.code).toBe('CART_ITEM_NOT_FOUND');

    const crossDelete = await request(app.getHttpServer())
      .delete(`/api/v1/cart/items/${lineItemId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', `${csrf2.cookiePair}; ${attackerCookie.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf2.csrfToken);
    expect(crossDelete.status).toBe(404);
    expect(crossDelete.body.error.code).toBe('CART_ITEM_NOT_FOUND');

    // 7. Owner PATCH and DELETE succeed
    const ownerPatch = await request(app.getHttpServer())
      .patch(`/api/v1/cart/items/${lineItemId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', `${csrf1.cookiePair}; ${guestCookie!.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf1.csrfToken)
      .send({ quantity: 4 });
    expect(ownerPatch.status).toBe(200);
    expect(ownerPatch.body.data.totalQuantity).toBe(4);
    expect(ownerPatch.body.data.subtotalIdr).toBe(3_560_000);

    const ownerDelete = await request(app.getHttpServer())
      .delete(`/api/v1/cart/items/${lineItemId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', `${csrf1.cookiePair}; ${guestCookie!.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf1.csrfToken);
    expect(ownerDelete.status).toBe(204);

    const afterDelete = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Cookie', guestCookie!.cookiePair);
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.data.itemCount).toBe(0);
  });

  it('merges guest cart into authenticated customer cart with stock capping, unavailable notices, audit log, cookie clearing, and double-merge safety', async () => {
    const unauthMerge = await request(app.getHttpServer())
      .post('/api/v1/cart/merge')
      .set('Origin', config.APP_URL);
    expect([401, 403]).toContain(unauthMerge.status);

    // Variant A: customer has 2, guest has 3, available stock = 4 -> capped at 4 with notice!
    const { variantId: varAId, sku: skuA } = await createTestProductWithVariant({
      skuPrefix: 'ARV-MRGA',
      priceIdr: 500_000,
      initialOnHand: 4,
    });
    // Variant B: guest has 2, becomes unavailable before merge -> skipped with notice!
    const { productId: prodBId, variantId: varBId, sku: skuB } = await createTestProductWithVariant({
      skuPrefix: 'ARV-MRGB',
      priceIdr: 750_000,
      initialOnHand: 5,
    });
    // Variant C: guest-only item with qty 2, plenty of stock -> merged cleanly!
    const { variantId: varCId } = await createTestProductWithVariant({
      skuPrefix: 'ARV-MRGC',
      priceIdr: 600_000,
      initialOnHand: 10,
    });

    const customer = await createAuthenticatedSession({
      roleCode: 'CUSTOMER',
      scope: SessionScope.CUSTOMER,
      mfaVerified: false,
    });

    // Populate customer cart with 2x varA
    const custAdd = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .set('Cookie', customer.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken)
      .send({
        variantId: varAId,
        quantity: 2,
        configuration: { preset: 'onyx' },
      });
    expect(custAdd.status).toBe(200);
    const customerCartId = custAdd.body.data.id as string;
    createdCartIds.push(customerCartId);

    // Populate guest cart with 3x varA (same config), 2x varB, 2x varC
    const csrf = await issuePreAuthCsrf();
    const g1 = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .set('Cookie', csrf.cookiePair)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf.csrfToken)
      .send({
        variantId: varAId,
        quantity: 3,
        configuration: { preset: 'onyx' },
      });
    expect(g1.status).toBe(200);
    const guestCartId = g1.body.data.id as string;
    createdCartIds.push(guestCartId);
    const guestCookie = extractCookiePair(g1.headers['set-cookie'], GUEST_CART_COOKIE_NAME)!;

    const g2 = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .set('Cookie', `${csrf.cookiePair}; ${guestCookie.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf.csrfToken)
      .send({ variantId: varBId, quantity: 2 });
    expect(g2.status).toBe(200);

    const g3 = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', config.APP_URL)
      .set('Cookie', `${csrf.cookiePair}; ${guestCookie.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrf.csrfToken)
      .send({ variantId: varCId, quantity: 2 });
    expect(g3.status).toBe(200);

    // Deactivate product B before merge
    await prisma.client.product.update({
      where: { id: prodBId },
      data: { isVisible: false },
    });

    // Execute merge as authenticated customer carrying guest cookie
    const mergeRes = await request(app.getHttpServer())
      .post('/api/v1/cart/merge')
      .set('Origin', config.APP_URL)
      .set('Cookie', `${customer.cookieHeader}; ${guestCookie.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken);

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.data.merged).toBe(true);
    expect(mergeRes.body.data.mergedItemCount).toBe(2); // varA + varC
    expect(mergeRes.body.data.adjustedItemCount).toBe(2); // varA capped + varB skipped
    expect(mergeRes.body.data.notices.some((n: string) => n.includes(skuA))).toBe(true);
    expect(mergeRes.body.data.notices.some((n: string) => n.includes(skuB))).toBe(true);

    const mergedCart = mergeRes.body.data.cart;
    expect(mergedCart.id).toBe(customerCartId);
    expect(mergedCart.ownerType).toBe('USER');
    expect(mergedCart.itemCount).toBe(2);
    expect(mergedCart.totalQuantity).toBe(6); // 4 (capped varA) + 2 (varC)
    expect(mergedCart.subtotalIdr).toBe(4 * 500_000 + 2 * 600_000);

    // Guest cookie cleared
    const clearedCookie = extractCookiePair(
      mergeRes.headers['set-cookie'],
      GUEST_CART_COOKIE_NAME,
    );
    expect(clearedCookie).toBeTruthy();
    expect(clearedCookie!.value).toBe('');

    // Guest cart marked MERGED in DB
    const dbGuestCart = await prisma.client.cart.findUniqueOrThrow({
      where: { id: guestCartId },
    });
    expect(dbGuestCart.status).toBe(CartStatus.MERGED);
    expect(dbGuestCart.mergedIntoCartId).toBe(customerCartId);

    // Audit log written
    const mergeAudit = await prisma.client.auditLog.findFirst({
      where: {
        actorId: customer.userId,
        action: 'cart.merged',
        resourceId: customerCartId,
      },
    });
    expect(mergeAudit).toBeTruthy();

    // Double-merge replay with stale guest cookie -> merged: false, zero duplication
    const secondMerge = await request(app.getHttpServer())
      .post('/api/v1/cart/merge')
      .set('Origin', config.APP_URL)
      .set('Cookie', `${customer.cookieHeader}; ${guestCookie.cookiePair}`)
      .set(HTTP_HEADERS.CSRF_TOKEN, customer.csrfToken);

    expect(secondMerge.status).toBe(200);
    expect(secondMerge.body.data.merged).toBe(false);
    expect(secondMerge.body.data.mergedItemCount).toBe(0);
    expect(secondMerge.body.data.cart.totalQuantity).toBe(6);
  });
});
