import 'reflect-metadata';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadRuntimeConfig,
  type RuntimeConfig,
} from '@arven/config';
import { SessionScope, UserStatus } from '@arven/database';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  SessionStoreService,
  TokenCryptoService,
  checkRouteAuthMetadata,
} from '../../src/common/security/index.js';
import { createApp } from '../../src/main.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/shared/redis/redis.module.js';

describe('Phase 03 Catalog Module — Live PostgreSQL 18 + Memurai Integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let config: RuntimeConfig;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    const baseConfig = loadRuntimeConfig();
    const testConfig: RuntimeConfig = {
      ...baseConfig,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      REDIS_URL: 'redis://127.0.0.1:6379/15',
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

    await redis.flushdb();
  });

  afterAll(async () => {
    if (prisma) {
      if (createdProductIds.length > 0) {
        await prisma.client.outboxEvent.deleteMany({
          where: {
            aggregateType: 'Product',
            aggregateId: { in: createdProductIds },
          },
        });
        const variants = await prisma.client.productVariant.findMany({
          where: { productId: { in: createdProductIds } },
          select: { id: true },
        });
        const variantIds = variants.map((v) => v.id);
        if (variantIds.length > 0) {
          await prisma.client.inventoryMovement.deleteMany({
            where: { variantId: { in: variantIds } },
          });
          await prisma.client.inventoryLevel.deleteMany({
            where: { variantId: { in: variantIds } },
          });
        }
        await prisma.client.product.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
      if (createdUserIds.length > 0) {
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
    roleCode: 'PRODUCT' | 'CUSTOMER';
    scope: SessionScope;
    mfaVerified: boolean;
  }): Promise<{
    userId: string;
    cookieHeader: string;
    csrfToken: string;
  }> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: opts.roleCode },
    });

    const user = await prisma.client.user.create({
      data: {
        email: `catalog-int-${opts.roleCode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@arven.local`,
        passwordHash: 'argon2id-test-placeholder',
        fullName: `Catalog Test ${opts.roleCode}`,
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        mfaEnabled: opts.scope === SessionScope.ADMIN,
        userRoles: {
          create: {
            roleId: role.id,
          },
        },
      },
    });
    createdUserIds.push(user.id);

    const rawToken = `raw-session-${user.id}-${Date.now()}`;
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
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
    };
  }

  it('serves public categories, collections, filtered/sorted products, and PDP with 404 on unknown slugs', async () => {
    const categoriesRes = await request(app.getHttpServer()).get('/api/v1/categories');
    expect(categoriesRes.status).toBe(200);
    expect(categoriesRes.body.success).toBe(true);
    expect(categoriesRes.body.data.length).toBeGreaterThanOrEqual(5);
    const topsCat = categoriesRes.body.data.find(
      (c: { slug: string }) => c.slug === 'tops',
    );
    expect(topsCat).toBeDefined();
    expect(topsCat.sizeGuideJson).toBeTruthy();
    expect(topsCat.productCount).toBeGreaterThanOrEqual(2);

    const collectionsRes = await request(app.getHttpServer()).get('/api/v1/collections');
    expect(collectionsRes.status).toBe(200);
    expect(collectionsRes.body.data.length).toBeGreaterThanOrEqual(4);
    expect(collectionsRes.body.data[0].bannerUrl).toMatch(/^data:image\/svg\+xml;utf8,/);

    const colDetailRes = await request(app.getHttpServer()).get(
      '/api/v1/collections/essentials',
    );
    expect(colDetailRes.status).toBe(200);
    expect(colDetailRes.body.data.slug).toBe('essentials');
    expect(colDetailRes.body.data.products.length).toBeGreaterThanOrEqual(1);

    const missingColRes = await request(app.getHttpServer()).get(
      '/api/v1/collections/nonexistent-collection',
    );
    expect(missingColRes.status).toBe(404);
    expect(missingColRes.body.error.code).toBe('RESOURCE_NOT_FOUND');

    const productsRes = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({
        category: 'tops',
        inStock: 'true',
        sort: 'price_asc',
      });
    expect(productsRes.status).toBe(200);
    expect(productsRes.body.data.length).toBeGreaterThanOrEqual(2);
    expect(productsRes.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(productsRes.body.data[0].priceIdr).toBeLessThanOrEqual(
      productsRes.body.data[1].priceIdr,
    );

    const searchRes = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ q: 'ARV-TOP-001' });
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.some((p: { slug: string }) => p.slug === 'essentials-heavyweight-crew-tee')).toBe(true);

    const pdpRes = await request(app.getHttpServer()).get(
      '/api/v1/products/essentials-heavyweight-crew-tee',
    );
    expect(pdpRes.status).toBe(200);
    expect(pdpRes.body.data.slug).toBe('essentials-heavyweight-crew-tee');
    expect(pdpRes.body.data.variants.length).toBeGreaterThanOrEqual(4);
    expect(pdpRes.body.data.media).toHaveLength(3);
    expect(pdpRes.body.data.sizeGuide).toBeTruthy();

    const lowStockVariant = pdpRes.body.data.variants.find(
      (v: { sku: string }) => v.sku === 'ARV-TOP-001-XL-CHR',
    );
    expect(lowStockVariant).toBeDefined();
    expect(lowStockVariant.stockStatus).toBe('LOW_STOCK');

    const notFoundPdp = await request(app.getHttpServer()).get(
      '/api/v1/products/nonexistent-garment-slug',
    );
    expect(notFoundPdp.status).toBe(404);
    expect(notFoundPdp.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects unauthenticated and CUSTOMER access to /api/v1/admin/products (401/403)', async () => {
    const unauthRes = await request(app.getHttpServer()).get('/api/v1/admin/products');
    expect(unauthRes.status).toBe(401);

    const customerSession = await createAuthenticatedSession({
      roleCode: 'CUSTOMER',
      scope: SessionScope.CUSTOMER,
      mfaVerified: false,
    });

    const customerRes = await request(app.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Cookie', customerSession.cookieHeader);
    expect([401, 403]).toContain(customerRes.status);
  });

  it('enforces full Admin Catalog lifecycle: DRAFT -> 422 PUBLISH_GATE_UNMET -> gate satisfaction -> PUBLISHED + outbox -> price change audit -> soft-delete', async () => {
    const adminSession = await createAuthenticatedSession({
      roleCode: 'PRODUCT',
      scope: SessionScope.ADMIN,
      mfaVerified: true,
    });

    const topsCategory = await prisma.client.category.findUniqueOrThrow({
      where: { slug: 'tops' },
    });
    const essentialsCollection = await prisma.client.collection.findUniqueOrThrow({
      where: { slug: 'essentials' },
    });

    const uniqueSuffix = `${Date.now()}`;
    const testSlug = `atelier-test-knit-polo-${uniqueSuffix}`;
    const testSku = `ARV-TEST-${uniqueSuffix.slice(-6)}`;

    // 1. Create DRAFT product (missing SEO, variants, and media)
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        name: 'Atelier Test Knit Polo',
        slug: testSlug,
        description: 'Fine gauge merino knit polo with tonal mother-of-pearl buttons.',
        material: '100% Extrafine Merino Wool',
        fit: 'Relaxed Fit',
        careInstruction: 'Hand wash cold. Dry flat.',
        categoryIds: [topsCategory.id],
        primaryCategoryId: topsCategory.id,
        collectionIds: [essentialsCollection.id],
      });

    expect(createRes.status).toBe(201);
    const productId = createRes.body.data.id as string;
    createdProductIds.push(productId);
    expect(createRes.body.data.status).toBe('DRAFT');
    expect(createRes.body.data.publishGate.canPublish).toBe(false);

    // 2. Public PDP must return 404 while product is DRAFT
    const draftPdpRes = await request(app.getHttpServer()).get(
      `/api/v1/products/${testSlug}`,
    );
    expect(draftPdpRes.status).toBe(404);

    // 3. Attempting to transition incomplete product to PUBLISHED must return 422 PUBLISH_GATE_UNMET
    const prematurePublishRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/transition`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        targetStatus: 'PUBLISHED',
      });

    expect(prematurePublishRes.status).toBe(422);
    expect(prematurePublishRes.body.error.code).toBe('PUBLISH_GATE_UNMET');
    expect(Array.isArray(prematurePublishRes.body.error.details)).toBe(true);
    expect(prematurePublishRes.body.error.details.length).toBeGreaterThanOrEqual(3);

    // 4. Satisfy Publish Gate: add SEO metadata, variant with stock, and primary media with altText
    const patchSeoRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${productId}`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        seoTitle: 'Atelier Test Knit Polo | ARVEN Knitwear',
        seoDescription: 'Extrafine merino wool knit polo crafted for architectural drape.',
      });
    expect(patchSeoRes.status).toBe(200);

    const createVariantRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/variants`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        sku: testSku,
        size: 'M',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 549000,
        compareAtPriceIdr: 649000,
        weightGrams: 340,
        initialStock: 12,
      });
    expect(createVariantRes.status).toBe(201);
    const variantId = createVariantRes.body.data.id as string;
    expect(createVariantRes.body.data.availableQty).toBe(12);
    expect(createVariantRes.body.data.stockStatus).toBe('IN_STOCK');

    const createMediaRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/media`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        type: 'IMAGE',
        url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22900%22%20height%3D%221200%22%3E%3Crect%20width%3D%22900%22%20height%3D%221200%22%20fill%3D%22%2317191B%22%2F%3E%3C%2Fsvg%3E',
        altText: 'Atelier Test Knit Polo front studio view',
        width: 900,
        height: 1200,
        position: 0,
        isPrimary: true,
      });
    expect(createMediaRes.status).toBe(201);

    // 5. Transition to READY_TO_PUBLISH and then PUBLISHED
    const readyRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/transition`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        targetStatus: 'READY_TO_PUBLISH',
        reason: 'QA checklist complete',
      });
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.data.status).toBe('READY_TO_PUBLISH');
    expect(readyRes.body.data.publishGate.canPublish).toBe(true);

    const publishRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/transition`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        targetStatus: 'PUBLISHED',
        reason: 'Release for seasonal drop',
      });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.status).toBe('PUBLISHED');
    expect(publishRes.body.data.publishedAt).toBeTruthy();

    // Verify outbox_events row product.published
    const outboxRow = await prisma.client.outboxEvent.findFirst({
      where: {
        aggregateType: 'Product',
        aggregateId: productId,
        eventType: 'product.published',
      },
    });
    expect(outboxRow).toBeTruthy();

    // Verify Public PDP now returns 200 OK
    const livePdpRes = await request(app.getHttpServer()).get(
      `/api/v1/products/${testSlug}`,
    );
    expect(livePdpRes.status).toBe(200);
    expect(livePdpRes.body.data.priceIdr).toBe(549000);

    // 6. Update variant priceIdr and verify audit_logs entry with old/new price
    const priceUpdateRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${productId}/variants/${variantId}`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        priceIdr: 589000,
      });
    expect(priceUpdateRes.status).toBe(200);
    expect(priceUpdateRes.body.data.priceIdr).toBe(589000);

    const priceAuditLog = await prisma.client.auditLog.findFirst({
      where: {
        resource: 'ProductVariant',
        resourceId: variantId,
        action: 'product.variant.price_changed',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(priceAuditLog).toBeTruthy();
    expect(priceAuditLog?.beforeState).toMatchObject({
      priceIdr: 549000,
    });
    expect(priceAuditLog?.afterState).toMatchObject({
      priceIdr: 589000,
    });

    // 7. Soft-delete product and verify Public PDP returns 404
    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/admin/products/${productId}`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken);
    expect(deleteRes.status).toBe(204);

    const deletedPdpRes = await request(app.getHttpServer()).get(
      `/api/v1/products/${testSlug}`,
    );
    expect(deletedPdpRes.status).toBe(404);
  });
});
