import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ROLE_CODES,
  HTTP_HEADERS,
  OUTFIT_STUDIO_POLICY,
  PERMISSION_CODES,
  loadRuntimeConfig,
  type AdminRoleCode,
  type RuntimeConfig,
} from '@arven/config';
import {
  AssetStatus,
  ProductStatus,
  SessionScope,
  UserStatus,
  type Prisma,
} from '@arven/database';
import { buildArvenGarmentGlbBuffer } from '@arven/three-engine/glb';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  SessionStoreService,
  TokenCryptoService,
  checkRouteAuthMetadata,
} from '../../src/common/security/index.js';
import { createApp } from '../../src/main.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/shared/redis/redis.module.js';

interface SessionHandle {
  userId: string;
  cookieHeader: string;
  csrfToken: string;
}

function binaryParser(
  res: request.Response,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'binary'));
  });
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (err: Error) => callback(err, Buffer.alloc(0)));
}

describe('Phase 08 Virtual Showroom & Outfit Studio Security Gate (T-03, IDOR, CSRF, 7-Role RBAC, Path Traversal, Permission Catalog)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let config: RuntimeConfig;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;
  let tempStorageDir: string;

  const runTag = `p8sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdZoneIds: string[] = [];
  const createdOutfitSceneIds: string[] = [];
  const createdCartIds: string[] = [];

  let warehouseId: string;
  let adminByRole: Record<AdminRoleCode, SessionHandle>;
  let unverifiedMfaOwner: SessionHandle;
  let customerA: SessionHandle;
  let customerB: SessionHandle;

  let teeProductId: string;
  let teeVariantId: string;
  let teeAssetId: string;
  let teePresetId: string;

  let crossbodyProductId: string;

  let overshirtVariantId: string;
  let overshirtAssetId: string;

  let pubZoneCode: string;
  let pubZoneId: string;
  let draftZoneCode: string;
  let publicPresetId: string;

  async function getPreAuthCsrf(): Promise<{ cookieHeader: string; csrfToken: string }> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/csrf-token')
      .set('Origin', config.APP_URL);
    expect(res.status).toBe(200);
    const setCookies = res.headers['set-cookie'] as string[] | string | undefined;
    const list = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
    const csrfCookie = list.find((c) => c.includes('arven_csrf=')) ?? '';
    const cookiePair = csrfCookie.split(';')[0] ?? '';
    const csrfToken = (res.body as { data: { csrfToken: string } }).data.csrfToken;
    return { cookieHeader: cookiePair, csrfToken };
  }

  async function seedActorSession(opts: {
    roleCode: AdminRoleCode | 'CUSTOMER';
    scope: SessionScope;
    mfaVerified: boolean;
  }): Promise<SessionHandle> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: opts.roleCode },
    });

    const suffix = `${opts.roleCode.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.client.user.create({
      data: {
        email: `${runTag}-${suffix}@arven.local`,
        passwordHash: 'argon2id-test-placeholder',
        fullName: `Phase08 Sec ${opts.roleCode}`,
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        mfaEnabled: opts.scope === SessionScope.ADMIN,
        mfaSecretEncrypted: opts.scope === SessionScope.ADMIN ? 'placeholder' : null,
        userRoles: { create: { roleId: role.id } },
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const rawToken = `raw-${runTag}-${user.id}-${suffix}`;
    const tokenHash = tokenCrypto.sha256Hex(rawToken);
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();

    await prisma.client.session.create({
      data: {
        userId: user.id,
        scope: opts.scope,
        tokenHash,
        csrfSecret,
        mfaVerifiedAt: opts.mfaVerified ? new Date() : null,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    const cookieName = sessionStore.getCookieName(opts.scope);
    return {
      userId: user.id,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
    };
  }

  async function seedGarment(params: {
    slug: string;
    name: string;
    priceIdr: number;
    silhouette: 'tee' | 'overshirt' | 'crossbody';
    compatibility: Record<string, unknown>;
  }): Promise<{
    productId: string;
    variantId: string;
    assetId: string;
    presetId: string;
  }> {
    const product = await prisma.client.product.create({
      data: {
        slug: `${runTag}-${params.slug}`,
        name: params.name,
        description: `${params.name} security fixture`,
        material: '100% Organic Cotton',
        fit: 'Tailored',
        careInstruction: 'Dry clean only.',
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        has3dEnabled: true,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    createdProductIds.push(product.id);

    const variant = await prisma.client.productVariant.create({
      data: {
        productId: product.id,
        sku: `${runTag}-${params.slug}-M`.toUpperCase().slice(0, 60),
        size: 'M',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: BigInt(params.priceIdr),
        weightGrams: 350,
        isActive: true,
      },
      select: { id: true },
    });

    await prisma.client.inventoryLevel.create({
      data: {
        warehouseId,
        variantId: variant.id,
        quantityOnHand: 25,
        quantityReserved: 0,
      },
    });

    await prisma.client.productMedia.create({
      data: {
        productId: product.id,
        variantId: variant.id,
        type: 'IMAGE',
        objectKey: `public/products/${runTag}-${params.slug}/primary.webp`,
        url: `/images/${params.slug}.webp`,
        altText: params.name,
        position: 0,
        isPrimary: true,
      },
    });

    const glb = buildArvenGarmentGlbBuffer({ silhouette: params.silhouette });
    const asset = await prisma.client.product3DAsset.create({
      data: {
        productId: product.id,
        variantId: variant.id,
        version: 1,
        objectKey: `products/${runTag}-${params.slug}/v0001/model.glb`,
        mobileObjectKey: `products/${runTag}-${params.slug}/v0001/model-lite.glb`,
        posterKey: `products/${runTag}-${params.slug}/v0001/poster.svg`,
        bytes: BigInt(glb.byteLength),
        status: AssetStatus.READY,
        isActiveVersion: true,
        publishedAt: new Date(),
        config: {
          schemaVersion: '1.0',
          materialSlots: [
            {
              slotId: 'mat_fabric_primary',
              meshNames: ['mesh_garment_body'],
              materialName: 'mat_fabric_primary',
              customizable: true,
              defaultBaseColorHex: '#17191B',
              roughnessRange: [0.65, 0.95],
              metalnessRange: [0, 0.1],
            },
          ],
          outfitCompatibility: params.compatibility,
        } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    const preset = await prisma.client.customizationPreset.create({
      data: {
        productId: product.id,
        assetId: asset.id,
        variantId: variant.id,
        code: `charcoal-${runTag}`,
        label: 'Charcoal',
        swatchHex: '#17191B',
        materialOverrides: {
          mat_fabric_primary: { baseColorHex: '#17191B', roughness: 0.85, metalness: 0.02 },
        } as unknown as Prisma.InputJsonValue,
        isActive: true,
        sortOrder: 0,
      },
      select: { id: true },
    });

    return {
      productId: product.id,
      variantId: variant.id,
      assetId: asset.id,
      presetId: preset.id,
    };
  }

  beforeAll(async () => {
    tempStorageDir = await mkdtemp(path.join(os.tmpdir(), 'arven-p8-api-sec-'));
    const baseConfig = loadRuntimeConfig();
    const testConfig: RuntimeConfig = {
      ...baseConfig,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      STORAGE_DRIVER: 'local_fs',
      STORAGE_LOCAL_DIR: tempStorageDir,
      PAYMENT_DRIVER: 'local_stub',
      REDIS_URL: 'redis://127.0.0.1:6379/11',
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

    const wh = await prisma.client.warehouse.findFirstOrThrow({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    warehouseId = wh.id;

    const adminEntries = await Promise.all(
      ADMIN_ROLE_CODES.map(
        async (role) =>
          [
            role,
            await seedActorSession({
              roleCode: role,
              scope: SessionScope.ADMIN,
              mfaVerified: true,
            }),
          ] as const,
      ),
    );
    adminByRole = Object.fromEntries(adminEntries) as Record<AdminRoleCode, SessionHandle>;

    unverifiedMfaOwner = await seedActorSession({
      roleCode: 'OWNER',
      scope: SessionScope.ADMIN,
      mfaVerified: false,
    });
    customerA = await seedActorSession({
      roleCode: 'CUSTOMER',
      scope: SessionScope.CUSTOMER,
      mfaVerified: false,
    });
    customerB = await seedActorSession({
      roleCode: 'CUSTOMER',
      scope: SessionScope.CUSTOMER,
      mfaVerified: false,
    });

    const tee = await seedGarment({
      slug: 'crew-tee',
      name: 'P8 Sec Crew Tee',
      priceIdr: 450_000,
      silhouette: 'tee',
      compatibility: {
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '1.0.0',
        slot: 'top',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      },
    });
    teeProductId = tee.productId;
    teeVariantId = tee.variantId;
    teeAssetId = tee.assetId;
    teePresetId = tee.presetId;

    const overshirt = await seedGarment({
      slug: 'boxy-overshirt',
      name: 'P8 Sec Boxy Overshirt',
      priceIdr: 1_850_000,
      silhouette: 'overshirt',
      compatibility: {
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '1.0.0',
        slot: 'outerwear',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      },
    });
    overshirtVariantId = overshirt.variantId;
    overshirtAssetId = overshirt.assetId;

    const crossbody = await seedGarment({
      slug: 'crossbody',
      name: 'P8 Sec Crossbody',
      priceIdr: 2_250_000,
      silhouette: 'crossbody',
      compatibility: {
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '1.0.0',
        slot: 'accessory',
        anchor: 'shoulder_left',
        incompatibleSlots: [],
      },
    });
    crossbodyProductId = crossbody.productId;

    // Seed a public preset for IDOR boundary verification
    const presetRow = await prisma.client.outfitScene.create({
      data: {
        userId: null,
        title: `${runTag} Public Preset`,
        mannequinRigVersion: OUTFIT_STUDIO_POLICY.RIG_ID,
        isPublicPreset: true,
        items: [
          {
            slot: 'top',
            productId: teeProductId,
            variantId: teeVariantId,
            assetId: teeAssetId,
            presetId: teePresetId,
          },
        ] as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    publicPresetId = presetRow.id;
    createdOutfitSceneIds.push(publicPresetId);

    // Seed one published zone and one draft zone via Admin API so real storage binaries exist
    pubZoneCode = `${runTag}-pub`;
    const pubZoneRes = await request(app.getHttpServer())
      .post('/api/v1/admin/showroom/zones')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminByRole.OWNER.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, adminByRole.OWNER.csrfToken)
      .send({
        code: pubZoneCode,
        title: 'Security Published Zone',
        sortOrder: 0,
      })
      .expect(201);
    pubZoneId = (pubZoneRes.body as { data: { id: string } }).data.id;
    createdZoneIds.push(pubZoneId);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/showroom/zones/${pubZoneId}/transition`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminByRole.OWNER.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, adminByRole.OWNER.csrfToken)
      .send({ targetStatus: 'PUBLISHED' })
      .expect(200);

    draftZoneCode = `${runTag}-draft`;
    const draftZoneRes = await request(app.getHttpServer())
      .post('/api/v1/admin/showroom/zones')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminByRole.OWNER.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, adminByRole.OWNER.csrfToken)
      .send({
        code: draftZoneCode,
        title: 'Security Draft Zone',
        sortOrder: 1,
      })
      .expect(201);
    createdZoneIds.push((draftZoneRes.body as { data: { id: string } }).data.id);
  });

  beforeEach(async () => {
    const keys = await redis.keys('throttle:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    if (prisma) {
      if (createdCartIds.length > 0) {
        await prisma.client.cartItem.deleteMany({
          where: { cartId: { in: createdCartIds } },
        });
        await prisma.client.cart.deleteMany({
          where: { id: { in: createdCartIds } },
        });
      }
      if (createdOutfitSceneIds.length > 0) {
        await prisma.client.outfitScene.deleteMany({
          where: { id: { in: createdOutfitSceneIds } },
        });
      }
      if (createdZoneIds.length > 0) {
        await prisma.client.showroomHotspot.deleteMany({
          where: {
            OR: [
              { zoneId: { in: createdZoneIds } },
              { zone: { code: { startsWith: runTag } } },
            ],
          },
        });
        await prisma.client.showroomZone.deleteMany({
          where: {
            OR: [
              { id: { in: createdZoneIds } },
              { code: { startsWith: runTag } },
            ],
          },
        });
      }
      if (createdUserIds.length > 0) {
        await prisma.client.outfitScene.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.client.cartItem.deleteMany({
          where: { cart: { userId: { in: createdUserIds } } },
        });
        await prisma.client.cart.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.client.session.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.client.userRole.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.client.user.deleteMany({
          where: {
            id: { in: createdUserIds },
            auditLogs: { none: {} },
          },
        });
        await prisma.client.user.updateMany({
          where: { id: { in: createdUserIds } },
          data: { status: UserStatus.SUSPENDED },
        });
      }
      if (createdProductIds.length > 0) {
        await prisma.client.customizationPreset.deleteMany({
          where: { productId: { in: createdProductIds } },
        });
        await prisma.client.assetValidationRun.deleteMany({
          where: { asset: { productId: { in: createdProductIds } } },
        });
        await prisma.client.product3DAsset.deleteMany({
          where: { productId: { in: createdProductIds } },
        });
        await prisma.client.productMedia.deleteMany({
          where: { productId: { in: createdProductIds } },
        });
        await prisma.client.inventoryMovement.deleteMany({
          where: { variant: { productId: { in: createdProductIds } } },
        });
        await prisma.client.inventoryLevel.deleteMany({
          where: { variant: { productId: { in: createdProductIds } } },
        });
        await prisma.client.productVariant.deleteMany({
          where: { productId: { in: createdProductIds } },
        });
        await prisma.client.product.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
    }

    if (redis) {
      await redis.flushdb();
    }
    if (app) {
      await app.close();
    }
    if (tempStorageDir) {
      await rm(tempStorageDir, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // 1. Threat T-03 Anti-Tamper (API Strict Zod + PostgreSQL 18 CHECKs + Live Re-Resolution)
  // ===========================================================================

  it('T-03 API Layer: rejects price/tamper/ownership keys with 400 VALIDATION_ERROR across outfit endpoints', async () => {
    const ownedRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-scenes')
      .set('Origin', config.APP_URL)
      .set('Cookie', customerA.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
      .send({
        title: `${runTag} Baseline Scene`,
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [{ slot: 'top', variantId: teeVariantId, presetId: teePresetId }],
      })
      .expect(201);
    const sceneId = (ownedRes.body as { data: { id: string } }).data.id;
    createdOutfitSceneIds.push(sceneId);

    const { cookieHeader: guestCookie, csrfToken: guestCsrf } = await getPreAuthCsrf();

    const topLevelTamperKeys: Array<Record<string, unknown>> = [
      { priceIdr: 1 },
      { unitPriceIdr: 1 },
      { amount: 1 },
      { total: 1 },
      { discount: 999_999 },
      { isPublicPreset: true },
      { userId: customerB.userId },
    ];

    const slotLevelTamperKeys: Array<Record<string, unknown>> = [
      { priceIdr: 1 },
      { unitPriceIdr: 1 },
      { amount: 1 },
      { total: 1 },
      { discount: 500_000 },
    ];

    for (const badKey of topLevelTamperKeys) {
      const postSceneRes = await request(app.getHttpServer())
        .post('/api/v1/outfit-scenes')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .send({
          title: 'Tampered',
          rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
          slots: [{ slot: 'top', variantId: teeVariantId }],
          ...badKey,
        });
      expect(postSceneRes.status).toBe(400);
      expect(postSceneRes.body.error.code).toBe('VALIDATION_ERROR');

      const patchSceneRes = await request(app.getHttpServer())
        .patch(`/api/v1/outfit-scenes/${sceneId}`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .send({
          title: 'Tampered Patch',
          ...badKey,
        });
      expect(patchSceneRes.status).toBe(400);
      expect(patchSceneRes.body.error.code).toBe('VALIDATION_ERROR');

      const validateRes = await request(app.getHttpServer())
        .post('/api/v1/outfit-studio/validate')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCookie)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
        .send({
          rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
          slots: [{ slot: 'top', variantId: teeVariantId }],
          ...badKey,
        });
      expect(validateRes.status).toBe(400);
      expect(validateRes.body.error.code).toBe('VALIDATION_ERROR');

      const cartRes = await request(app.getHttpServer())
        .post('/api/v1/outfit-studio/cart-items')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCookie)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
        .send({
          rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
          slots: [{ slot: 'top', variantId: teeVariantId }],
          ...badKey,
        });
      expect(cartRes.status).toBe(400);
      expect(cartRes.body.error.code).toBe('VALIDATION_ERROR');

      const adminPresetRes = await request(app.getHttpServer())
        .post('/api/v1/admin/outfit-studio/presets')
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', adminByRole.OWNER.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, adminByRole.OWNER.csrfToken)
        .send({
          title: 'Tampered Preset',
          rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
          slots: [{ slot: 'top', variantId: teeVariantId }],
          ...badKey,
        });
      expect(adminPresetRes.status).toBe(400);
      expect(adminPresetRes.body.error.code).toBe('VALIDATION_ERROR');
    }

    for (const badSlotKey of slotLevelTamperKeys) {
      const slotPayload = { slot: 'top', variantId: teeVariantId, ...badSlotKey };

      const postSceneSlot = await request(app.getHttpServer())
        .post('/api/v1/outfit-scenes')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .send({
          title: 'Slot Tamper',
          rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
          slots: [slotPayload],
        });
      expect(postSceneSlot.status).toBe(400);
      expect(postSceneSlot.body.error.code).toBe('VALIDATION_ERROR');

      const patchSceneSlot = await request(app.getHttpServer())
        .patch(`/api/v1/outfit-scenes/${sceneId}`)
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
        .send({ slots: [slotPayload] });
      expect(patchSceneSlot.status).toBe(400);
      expect(patchSceneSlot.body.error.code).toBe('VALIDATION_ERROR');

      const validateSlot = await request(app.getHttpServer())
        .post('/api/v1/outfit-studio/validate')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCookie)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
        .send({ rigId: OUTFIT_STUDIO_POLICY.RIG_ID, slots: [slotPayload] });
      expect(validateSlot.status).toBe(400);
      expect(validateSlot.body.error.code).toBe('VALIDATION_ERROR');

      const cartSlot = await request(app.getHttpServer())
        .post('/api/v1/outfit-studio/cart-items')
        .set('Origin', config.APP_URL)
        .set('Cookie', guestCookie)
        .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
        .send({ rigId: OUTFIT_STUDIO_POLICY.RIG_ID, slots: [slotPayload] });
      expect(cartSlot.status).toBe(400);
      expect(cartSlot.body.error.code).toBe('VALIDATION_ERROR');

      const adminSlot = await request(app.getHttpServer())
        .post('/api/v1/admin/outfit-studio/presets')
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', adminByRole.OWNER.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, adminByRole.OWNER.csrfToken)
        .send({
          title: 'Admin Slot Tamper',
          rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
          slots: [slotPayload],
        });
      expect(adminSlot.status).toBe(400);
      expect(adminSlot.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('T-03 PostgreSQL 18 Layer: enforces chk_outfit_items_no_price, chk_outfit_items_shape, and chk_outfit_owner_or_public on raw SQL inserts', async () => {
    const pricedItemsJson = JSON.stringify([
      {
        slot: 'top',
        productId: teeProductId,
        variantId: teeVariantId,
        assetId: teeAssetId,
        presetId: teePresetId,
        unitPriceIdr: 1,
      },
    ]);

    let noPriceError: unknown;
    try {
      await prisma.client.$executeRaw`
        INSERT INTO outfit_scenes (user_id, title, mannequin_rig_version, items, is_public_preset)
        VALUES (${customerA.userId}::uuid, 'SQL Tamper Price', ${OUTFIT_STUDIO_POLICY.RIG_ID}, ${pricedItemsJson}::jsonb, false)
      `;
    } catch (err) {
      noPriceError = err;
    }
    expect(noPriceError).toBeDefined();
    expect(String(noPriceError)).toContain('chk_outfit_items_no_price');

    let emptyItemsError: unknown;
    try {
      await prisma.client.$executeRaw`
        INSERT INTO outfit_scenes (user_id, title, mannequin_rig_version, items, is_public_preset)
        VALUES (${customerA.userId}::uuid, 'SQL Empty Items', ${OUTFIT_STUDIO_POLICY.RIG_ID}, '[]'::jsonb, false)
      `;
    } catch (err) {
      emptyItemsError = err;
    }
    expect(emptyItemsError).toBeDefined();
    expect(String(emptyItemsError)).toContain('chk_outfit_items_shape');

    const validItemsJson = JSON.stringify([
      {
        slot: 'top',
        productId: teeProductId,
        variantId: teeVariantId,
        assetId: teeAssetId,
        presetId: null,
      },
    ]);

    let ownerOrPublicError: unknown;
    try {
      await prisma.client.$executeRaw`
        INSERT INTO outfit_scenes (user_id, title, mannequin_rig_version, items, is_public_preset)
        VALUES (NULL, 'SQL Orphan Scene', ${OUTFIT_STUDIO_POLICY.RIG_ID}, ${validItemsJson}::jsonb, false)
      `;
    } catch (err) {
      ownerOrPublicError = err;
    }
    expect(ownerOrPublicError).toBeDefined();
    expect(String(ownerOrPublicError)).toContain('chk_outfit_owner_or_public');
  });

  it('T-03 Re-Resolution: bumping variant price in DB immediately updates hydrated GET /outfit-scenes without touching outfit_scenes.items', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-scenes')
      .set('Origin', config.APP_URL)
      .set('Cookie', customerA.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
      .send({
        title: `${runTag} Re-Resolve Scene`,
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [
          { slot: 'top', variantId: teeVariantId, presetId: teePresetId },
          { slot: 'outerwear', variantId: overshirtVariantId },
        ],
      })
      .expect(201);

    const sceneId = (createRes.body as { data: { id: string } }).data.id;
    createdOutfitSceneIds.push(sceneId);

    const beforeRow = await prisma.client.outfitScene.findUniqueOrThrow({
      where: { id: sceneId },
    });
    const beforeItemsJson = JSON.stringify(beforeRow.items);
    expect(beforeItemsJson).not.toMatch(/price|amount|total|discount/i);

    try {
      await prisma.client.productVariant.update({
        where: { id: teeVariantId },
        data: { priceIdr: BigInt(725_000) },
      });

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/outfit-scenes')
        .set('Origin', config.APP_URL)
        .set('Cookie', customerA.cookieHeader)
        .expect(200);

      const scenes = listRes.body.data as Array<{
        id: string;
        liveTotalIdr: number;
        slots: Array<{ slot: string; unitPriceIdr: number }>;
      }>;
      const hydrated = scenes.find((s) => s.id === sceneId);
      expect(hydrated).toBeDefined();
      expect(hydrated!.liveTotalIdr).toBe(725_000 + 1_850_000);
      expect(hydrated!.slots.find((s) => s.slot === 'top')?.unitPriceIdr).toBe(725_000);

      const afterRow = await prisma.client.outfitScene.findUniqueOrThrow({
        where: { id: sceneId },
      });
      expect(afterRow.items).toEqual(beforeRow.items);
      expect(afterRow.updatedAt.getTime()).toBe(beforeRow.updatedAt.getTime());
    } finally {
      await prisma.client.productVariant.update({
        where: { id: teeVariantId },
        data: { priceIdr: BigInt(450_000) },
      });
    }
  });

  // ===========================================================================
  // 2. IDOR & Authentication Boundaries (AMB-P8-01)
  // ===========================================================================

  it('rejects unauthenticated guest access to /outfit-scenes* with 401 and prevents cross-user & public-preset IDOR with 404', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-scenes')
      .set('Origin', config.APP_URL)
      .set('Cookie', customerA.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
      .send({
        title: `${runTag} Private Look`,
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [{ slot: 'top', variantId: teeVariantId }],
      })
      .expect(201);
    const victimSceneId = (createRes.body as { data: { id: string } }).data.id;
    createdOutfitSceneIds.push(victimSceneId);

    const { cookieHeader: guestCookie, csrfToken: guestCsrf } = await getPreAuthCsrf();

    // Guest access to all /outfit-scenes* endpoints -> 401
    await request(app.getHttpServer()).get('/api/v1/outfit-scenes').expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/outfit-scenes/${victimSceneId}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/outfit-scenes')
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCookie)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
      .send({
        title: 'Guest Save',
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [{ slot: 'top', variantId: teeVariantId }],
      })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/api/v1/outfit-scenes/${victimSceneId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCookie)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
      .send({ title: 'Guest Tamper' })
      .expect(401);

    await request(app.getHttpServer())
      .delete(`/api/v1/outfit-scenes/${victimSceneId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCookie)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
      .expect(401);

    // Customer B IDOR on Customer A's scene -> 404 RESOURCE_NOT_FOUND (no existence leak)
    const idorGet = await request(app.getHttpServer())
      .get(`/api/v1/outfit-scenes/${victimSceneId}`)
      .set('Cookie', customerB.cookieHeader)
      .expect(404);
    expect(idorGet.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(JSON.stringify(idorGet.body)).not.toContain('Private Look');

    const idorPatch = await request(app.getHttpServer())
      .patch(`/api/v1/outfit-scenes/${victimSceneId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', customerB.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerB.csrfToken)
      .send({ title: 'Hijacked' })
      .expect(404);
    expect(idorPatch.body.error.code).toBe('RESOURCE_NOT_FOUND');

    const idorDelete = await request(app.getHttpServer())
      .delete(`/api/v1/outfit-scenes/${victimSceneId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', customerB.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerB.csrfToken)
      .expect(404);
    expect(idorDelete.body.error.code).toBe('RESOURCE_NOT_FOUND');

    // Customer B targeting public preset via customer /outfit-scenes/:id -> 404 RESOURCE_NOT_FOUND
    const presetGet = await request(app.getHttpServer())
      .get(`/api/v1/outfit-scenes/${publicPresetId}`)
      .set('Cookie', customerB.cookieHeader)
      .expect(404);
    expect(presetGet.body.error.code).toBe('RESOURCE_NOT_FOUND');

    const presetPatch = await request(app.getHttpServer())
      .patch(`/api/v1/outfit-scenes/${publicPresetId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', customerB.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerB.csrfToken)
      .send({ title: 'Modify Public Preset' })
      .expect(404);
    expect(presetPatch.body.error.code).toBe('RESOURCE_NOT_FOUND');

    const presetDelete = await request(app.getHttpServer())
      .delete(`/api/v1/outfit-scenes/${publicPresetId}`)
      .set('Origin', config.APP_URL)
      .set('Cookie', customerB.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerB.csrfToken)
      .expect(404);
    expect(presetDelete.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  // ===========================================================================
  // 3. CSRF & Origin Enforcement
  // ===========================================================================

  it('enforces Origin allowlist and X-CSRF-Token on /outfit-studio/validate, /outfit-studio/cart-items, and /outfit-scenes*', async () => {
    const { cookieHeader: guestCookie, csrfToken: guestCsrf } = await getPreAuthCsrf();

    const validSlotBody = {
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      slots: [{ slot: 'top', variantId: teeVariantId }],
    };

    // 1) Cross-origin requests rejected (403 CSRF_INVALID)
    const badOriginValidate = await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/validate')
      .set('Origin', 'https://evil.attacker.test')
      .set('Cookie', guestCookie)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
      .send(validSlotBody)
      .expect(403);
    expect(badOriginValidate.body.error.code).toBe('CSRF_INVALID');

    const badOriginCart = await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/cart-items')
      .set('Origin', 'https://evil.attacker.test')
      .set('Cookie', guestCookie)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
      .send(validSlotBody)
      .expect(403);
    expect(badOriginCart.body.error.code).toBe('CSRF_INVALID');

    const badOriginScene = await request(app.getHttpServer())
      .post('/api/v1/outfit-scenes')
      .set('Origin', 'https://evil.attacker.test')
      .set('Cookie', customerA.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerA.csrfToken)
      .send({ title: 'CSRF Test', ...validSlotBody })
      .expect(403);
    expect(badOriginScene.body.error.code).toBe('CSRF_INVALID');

    // 2) Missing X-CSRF-Token rejected (403 CSRF_INVALID)
    await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/validate')
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCookie)
      .send(validSlotBody)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/cart-items')
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCookie)
      .send(validSlotBody)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/outfit-scenes')
      .set('Origin', config.APP_URL)
      .set('Cookie', customerA.cookieHeader)
      .send({ title: 'Missing CSRF', ...validSlotBody })
      .expect(403);

    // 3) Forged/invalid X-CSRF-Token rejected (403)
    await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/validate')
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCookie)
      .set(HTTP_HEADERS.CSRF_TOKEN, 'forged-csrf-token-value')
      .send(validSlotBody)
      .expect(403);
  });

  // ===========================================================================
  // 4. 7-Role RBAC Matrix (AMB-P8-04 — asset.read & asset.publish) + Audit Logs
  // ===========================================================================

  it('enforces 7-role RBAC matrix (OWNER/MANAGER/PRODUCT mutate, CONTENT read-only, INVENTORY/ORDER/SUPPORT/CUSTOMER denied) and records audit logs', async () => {
    // Unauthenticated -> 401; unverified MFA admin -> 403 MFA_REQUIRED
    await request(app.getHttpServer())
      .get('/api/v1/admin/showroom/zones')
      .expect(401);

    const mfaRes = await request(app.getHttpServer())
      .get('/api/v1/admin/showroom/zones')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', unverifiedMfaOwner.cookieHeader)
      .expect(401);
    expect(mfaRes.body.error.code).toBe('MFA_REQUIRED');

    // Read endpoints: OWNER, MANAGER, PRODUCT, CONTENT -> 200
    for (const readRole of ['OWNER', 'MANAGER', 'PRODUCT', 'CONTENT'] as const) {
      const actor = adminByRole[readRole];
      await request(app.getHttpServer())
        .get('/api/v1/admin/showroom/zones')
        .set('Cookie', actor.cookieHeader)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/admin/showroom/zones/${pubZoneId}`)
        .set('Cookie', actor.cookieHeader)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/admin/outfit-studio/garments')
        .set('Cookie', actor.cookieHeader)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/admin/outfit-studio/presets')
        .set('Cookie', actor.cookieHeader)
        .expect(200);
    }

    // Read endpoints: INVENTORY, ORDER, SUPPORT -> 403; CUSTOMER cookie -> 401/403
    for (const deniedAdmin of [
      adminByRole.INVENTORY,
      adminByRole.ORDER,
      adminByRole.SUPPORT,
    ]) {
      for (const readPath of [
        '/api/v1/admin/showroom/zones',
        `/api/v1/admin/showroom/zones/${pubZoneId}`,
        '/api/v1/admin/outfit-studio/garments',
        '/api/v1/admin/outfit-studio/presets',
      ]) {
        await request(app.getHttpServer())
          .get(readPath)
          .set('Cookie', deniedAdmin.cookieHeader)
          .expect(403);
      }
    }
    for (const readPath of [
      '/api/v1/admin/showroom/zones',
      `/api/v1/admin/showroom/zones/${pubZoneId}`,
      '/api/v1/admin/outfit-studio/garments',
      '/api/v1/admin/outfit-studio/presets',
    ]) {
      const custRead = await request(app.getHttpServer())
        .get(readPath)
        .set('Cookie', customerA.cookieHeader);
      expect([401, 403]).toContain(custRead.status);
    }

    // Mutation endpoints: CONTENT, INVENTORY, ORDER, SUPPORT -> 403; CUSTOMER -> 401/403
    for (const nonPublisher of [
      adminByRole.CONTENT,
      adminByRole.INVENTORY,
      adminByRole.ORDER,
      adminByRole.SUPPORT,
      customerA,
    ]) {
      const r1 = await request(app.getHttpServer())
        .post('/api/v1/admin/showroom/zones')
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', nonPublisher.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, nonPublisher.csrfToken)
        .send({ code: `${runTag}-denied`, title: 'Denied Zone' });
      expect([401, 403]).toContain(r1.status);
      if (nonPublisher !== customerA) expect(r1.status).toBe(403);

      const r2 = await request(app.getHttpServer())
        .patch(`/api/v1/admin/showroom/zones/${pubZoneId}`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', nonPublisher.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, nonPublisher.csrfToken)
        .send({ title: 'Denied Update' });
      expect([401, 403]).toContain(r2.status);
      if (nonPublisher !== customerA) expect(r2.status).toBe(403);

      const r3 = await request(app.getHttpServer())
        .post(`/api/v1/admin/showroom/zones/${pubZoneId}/transition`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', nonPublisher.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, nonPublisher.csrfToken)
        .send({ targetStatus: 'ARCHIVED' });
      expect([401, 403]).toContain(r3.status);
      if (nonPublisher !== customerA) expect(r3.status).toBe(403);

      const r4 = await request(app.getHttpServer())
        .post(`/api/v1/admin/showroom/zones/${pubZoneId}/hotspots`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', nonPublisher.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, nonPublisher.csrfToken)
        .send({
          productId: crossbodyProductId,
          label: 'Denied',
          positionX: 0,
          positionY: 1,
          positionZ: 0,
        });
      expect([401, 403]).toContain(r4.status);
      if (nonPublisher !== customerA) expect(r4.status).toBe(403);

      const r5 = await request(app.getHttpServer())
        .put(`/api/v1/admin/3d-assets/${overshirtAssetId}/outfit-compatibility`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', nonPublisher.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, nonPublisher.csrfToken)
        .send({
          rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
          skeletonVersion: '1.0.0',
          slot: 'outerwear',
          anchor: 'spine_upper',
          incompatibleSlots: [],
        });
      expect([401, 403]).toContain(r5.status);
      if (nonPublisher !== customerA) expect(r5.status).toBe(403);

      const r6 = await request(app.getHttpServer())
        .delete(`/api/v1/admin/3d-assets/${overshirtAssetId}/outfit-compatibility`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', nonPublisher.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, nonPublisher.csrfToken);
      expect([401, 403]).toContain(r6.status);
      if (nonPublisher !== customerA) expect(r6.status).toBe(403);

      const r7 = await request(app.getHttpServer())
        .post('/api/v1/admin/outfit-studio/presets')
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', nonPublisher.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, nonPublisher.csrfToken)
        .send({
          title: 'Denied Preset',
          rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
          slots: [{ slot: 'top', variantId: teeVariantId }],
        });
      expect([401, 403]).toContain(r7.status);
      if (nonPublisher !== customerA) expect(r7.status).toBe(403);

      const r8 = await request(app.getHttpServer())
        .patch(`/api/v1/admin/outfit-studio/presets/${publicPresetId}`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', nonPublisher.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, nonPublisher.csrfToken)
        .send({ title: 'Denied Preset Patch' });
      expect([401, 403]).toContain(r8.status);
      if (nonPublisher !== customerA) expect(r8.status).toBe(403);

      const r9 = await request(app.getHttpServer())
        .delete(`/api/v1/admin/outfit-studio/presets/${publicPresetId}`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', nonPublisher.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, nonPublisher.csrfToken);
      expect([401, 403]).toContain(r9.status);
      if (nonPublisher !== customerA) expect(r9.status).toBe(403);
    }

    // OWNER, MANAGER, PRODUCT all succeed on asset.publish mutations and record audit logs
    for (const publisherRole of ['OWNER', 'MANAGER', 'PRODUCT'] as const) {
      const actor = adminByRole[publisherRole];
      const roleTag = publisherRole.toLowerCase();

      const zRes = await request(app.getHttpServer())
        .post('/api/v1/admin/showroom/zones')
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', actor.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, actor.csrfToken)
        .send({
          code: `${runTag}-${roleTag}-zone`,
          title: `Zone by ${publisherRole}`,
        })
        .expect(201);
      const zId = (zRes.body as { data: { id: string } }).data.id;
      createdZoneIds.push(zId);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/showroom/zones/${zId}`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', actor.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, actor.csrfToken)
        .send({ title: `Updated Zone by ${publisherRole}` })
        .expect(200);

      const hsRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/showroom/zones/${zId}/hotspots`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', actor.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, actor.csrfToken)
        .send({
          productId: teeProductId,
          variantId: teeVariantId,
          label: `Hotspot ${publisherRole}`,
          positionX: 1,
          positionY: 1,
          positionZ: -1,
        })
        .expect(201);
      const hsId = (hsRes.body as { data: { id: string } }).data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/showroom/hotspots/${hsId}`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', actor.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, actor.csrfToken)
        .send({ label: `Hotspot ${publisherRole} v2` })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/showroom/hotspots/${hsId}`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', actor.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, actor.csrfToken)
        .expect(204);

      const pRes = await request(app.getHttpServer())
        .post('/api/v1/admin/outfit-studio/presets')
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', actor.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, actor.csrfToken)
        .send({
          title: `${runTag}-${roleTag} Preset`,
          rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
          slots: [{ slot: 'top', variantId: teeVariantId }],
        })
        .expect(201);
      const pId = (pRes.body as { data: { id: string } }).data.id;
      createdOutfitSceneIds.push(pId);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/outfit-studio/presets/${pId}`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', actor.cookieHeader)
        .set(HTTP_HEADERS.CSRF_TOKEN, actor.csrfToken)
        .expect(204);

      const auditActions = await prisma.client.auditLog.findMany({
        where: { actorId: actor.userId },
        select: { action: true },
      });
      const actionNames = new Set(auditActions.map((a) => a.action));
      expect(actionNames.has('showroom.zone.created')).toBe(true);
      expect(actionNames.has('showroom.zone.updated')).toBe(true);
      expect(actionNames.has('showroom.hotspot.created')).toBe(true);
      expect(actionNames.has('showroom.hotspot.updated')).toBe(true);
      expect(actionNames.has('showroom.hotspot.deleted')).toBe(true);
      expect(actionNames.has('outfit.preset.created')).toBe(true);
      expect(actionNames.has('outfit.preset.deleted')).toBe(true);
    }

    // Verify compatibility PUT/DELETE audit logging under PRODUCT
    await request(app.getHttpServer())
      .put(`/api/v1/admin/3d-assets/${overshirtAssetId}/outfit-compatibility`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminByRole.PRODUCT.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, adminByRole.PRODUCT.csrfToken)
      .send({
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '1.0.0',
        slot: 'outerwear',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      })
      .expect(200);

    const compatAudit = await prisma.client.auditLog.findFirst({
      where: {
        actorId: adminByRole.PRODUCT.userId,
        action: 'asset.outfit_compatibility.updated',
        resourceId: overshirtAssetId,
      },
    });
    expect(compatAudit).not.toBeNull();
  });

  // ===========================================================================
  // 5. Showroom Publication, Path Traversal & Binary Serving Headers
  // ===========================================================================

  it('hides DRAFT archive-vault zone, blocks path traversal on :code and :rigId, and enforces nosniff + immutable cache headers on binary endpoints', async () => {
    const scenesRes = await request(app.getHttpServer())
      .get('/api/v1/showroom/scenes')
      .expect(200);
    const codes = (scenesRes.body.data.zones as Array<{ code: string }>).map((z) => z.code);
    expect(codes).toContain(pubZoneCode);
    expect(codes).not.toContain('archive-vault');
    expect(codes).not.toContain(draftZoneCode);

    // DRAFT zones return 404 on scene, scene-lite, and poster
    for (const draftCode of ['archive-vault', draftZoneCode]) {
      for (const suffix of ['scene', 'scene-lite', 'poster']) {
        const res = await request(app.getHttpServer()).get(
          `/api/v1/showroom/zones/${draftCode}/${suffix}`,
        );
        expect(res.status).toBe(404);
      }
    }

    // Path traversal & invalid char payloads on :code -> 400 or 404 (never 200 or 500)
    const badZonePayloads = [
      '..%2F..%2F.env',
      '..%2F..%2Fpackage.json',
      '../etc/passwd',
      '..%5Cpackage.json',
      'Archive-Vault',
      'bad_zone$name',
      'zone..name',
    ];
    for (const payload of badZonePayloads) {
      for (const suffix of ['scene', 'scene-lite', 'poster']) {
        const res = await request(app.getHttpServer()).get(
          `/api/v1/showroom/zones/${payload}/${suffix}`,
        );
        expect([400, 404]).toContain(res.status);
      }
    }

    // Path traversal & unknown rig payloads on :rigId -> 400 or 404 (never 200 or 500)
    const badRigPayloads = [
      '..%2F..%2F.env',
      '../etc/passwd',
      '..%5Cpackage.json',
      'ARVEN_MANNEQUIN_UNISEX_V1',
      'arven_mannequin_..',
      'arven_mannequin_bad$id',
      'arven_mannequin_unknown',
    ];
    for (const payload of badRigPayloads) {
      for (const suffix of ['model', 'model-lite', 'poster']) {
        const res = await request(app.getHttpServer()).get(
          `/api/v1/outfit-studio/rigs/${payload}/${suffix}`,
        );
        expect([400, 404]).toContain(res.status);
      }
    }

    // Binary endpoints emit X-Content-Type-Options: nosniff + immutable cache-control
    for (const binaryPath of [
      `/api/v1/showroom/zones/${pubZoneCode}/scene`,
      `/api/v1/showroom/zones/${pubZoneCode}/scene-lite`,
      `/api/v1/showroom/zones/${pubZoneCode}/poster`,
      `/api/v1/outfit-studio/rigs/${OUTFIT_STUDIO_POLICY.RIG_ID}/model`,
      `/api/v1/outfit-studio/rigs/${OUTFIT_STUDIO_POLICY.RIG_ID}/model-lite`,
      `/api/v1/outfit-studio/rigs/${OUTFIT_STUDIO_POLICY.RIG_ID}/poster`,
    ]) {
      const res = await request(app.getHttpServer())
        .get(binaryPath)
        .buffer(true)
        .parse(binaryParser);
      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      if (binaryPath.endsWith('/poster')) {
        expect(res.headers['content-type']).toContain('image/svg+xml');
      } else {
        expect(res.headers['content-type']).toContain('model/gltf-binary');
        expect((res.body as Buffer).readUInt32LE(0)).toBe(0x46546c67);
      }
    }
  });

  // ===========================================================================
  // 6. Permission Catalog Stability
  // ===========================================================================

  it('keeps PERMISSION_CODES strictly unchanged at 36 canonical codes with zero showroom/outfit permission additions', () => {
    expect(PERMISSION_CODES).toHaveLength(36);
    expect(
      PERMISSION_CODES.some(
        (code) => code.includes('showroom') || code.includes('outfit'),
      ),
    ).toBe(false);
  });
});
