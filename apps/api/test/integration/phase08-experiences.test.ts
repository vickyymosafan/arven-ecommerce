import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  HTTP_HEADERS,
  OUTFIT_STUDIO_POLICY,
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
import {
  buildArvenGarmentGlbBuffer,
  buildStudioPosterSvg,
} from '@arven/three-engine/glb';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  SessionStoreService,
  TokenCryptoService,
  checkRouteAuthMetadata,
} from '../../src/common/security/index.js';
import { createApp } from '../../src/main.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/shared/redis/redis.module.js';

interface TestSessionHandle {
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

describe('Phase 08 Virtual Showroom & Outfit Studio — Live PostgreSQL 18 + Memurai Integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;
  let tempStorageDir: string;

  const runTag = `p8int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdZoneIds: string[] = [];
  const createdOutfitSceneIds: string[] = [];
  const createdCartIds: string[] = [];

  let warehouseId: string;
  let ownerSession: TestSessionHandle;
  let contentSession: TestSessionHandle;
  let customerASession: TestSessionHandle;
  let customerBSession: TestSessionHandle;

  // Fixture IDs
  let teeProductId: string;
  let teeVariantId: string;
  let teeAssetId: string;
  let teePresetId: string;

  let poplinProductId: string;
  let poplinVariantId: string;

  let trouserOutOfStockVariantId: string;

  let overshirtProductId: string;
  let overshirtActiveVariantId: string;
  let overshirtInactiveVariantId: string;

  let crossbodyProductId: string;
  let crossbodyVariantId: string;

  let fieldJacketProductId: string;
  let fieldJacketVariantId: string;
  let fieldJacketAssetId: string;

  let pubZoneId: string;
  let pubZoneCode: string;
  let draftZoneId: string;
  let draftZoneCode: string;
  let publicPresetId: string;

  async function getPreAuthCsrf(): Promise<{ cookieHeader: string; csrfToken: string }> {
    const res = await request(app.getHttpServer()).get('/api/v1/csrf-token');
    expect(res.status).toBe(200);
    const setCookies = res.headers['set-cookie'] as string[] | undefined;
    const csrfCookie = setCookies?.find((c) => c.includes('arven_csrf=')) ?? '';
    const cookiePair = csrfCookie.split(';')[0] ?? '';
    const csrfToken = (res.body as { data: { csrfToken: string } }).data.csrfToken;
    return { cookieHeader: cookiePair, csrfToken };
  }

  async function createAuthenticatedSession(opts: {
    roleCode: AdminRoleCode | 'CUSTOMER';
    scope: SessionScope;
    mfaVerified: boolean;
  }): Promise<TestSessionHandle> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: opts.roleCode },
    });

    const user = await prisma.client.user.create({
      data: {
        email: `${runTag}-${opts.roleCode.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}@arven.local`,
        passwordHash: 'argon2id-test-placeholder',
        fullName: `P8 Test ${opts.roleCode}`,
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        mfaEnabled: opts.scope === SessionScope.ADMIN,
        userRoles: {
          create: { roleId: role.id },
        },
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const rawToken = `raw-p8-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
    const csrfToken = tokenCrypto.deriveSessionCsrfToken(csrfSecret);
    return {
      userId: user.id,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken,
    };
  }

  async function seedGarmentFixture(params: {
    slug: string;
    name: string;
    status: ProductStatus;
    isVisible: boolean;
    priceIdr: number;
    stockQty: number;
    compatibility: Record<string, unknown> | null;
    silhouette: 'tee' | 'shirt' | 'trouser' | 'overshirt' | 'crossbody';
    extraInactiveVariant?: boolean;
  }): Promise<{
    productId: string;
    variantId: string;
    inactiveVariantId?: string;
    assetId: string;
    presetId: string;
  }> {
    const product = await prisma.client.product.create({
      data: {
        slug: `${runTag}-${params.slug}`,
        name: params.name,
        description: `${params.name} description`,
        material: 'Organic Cotton',
        fit: 'Relaxed',
        careInstruction: 'Dry clean or gentle cold wash',
        status: params.status,
        isVisible: params.isVisible,
        has3dEnabled: true,
        publishedAt: params.status === ProductStatus.PUBLISHED ? new Date() : null,
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
        weightGrams: 320,
        isActive: true,
      },
      select: { id: true },
    });

    await prisma.client.inventoryLevel.create({
      data: {
        warehouseId,
        variantId: variant.id,
        quantityOnHand: params.stockQty,
        quantityReserved: 0,
      },
    });

    let inactiveVariantId: string | undefined;
    if (params.extraInactiveVariant) {
      const inactiveVar = await prisma.client.productVariant.create({
        data: {
          productId: product.id,
          sku: `${runTag}-${params.slug}-XL-OFF`.toUpperCase().slice(0, 60),
          size: 'XL',
          color: 'Ivory',
          colorHex: '#F8F7F3',
          priceIdr: BigInt(params.priceIdr),
          weightGrams: 320,
          isActive: false,
        },
        select: { id: true },
      });
      inactiveVariantId = inactiveVar.id;
    }

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
          ...(params.compatibility ? { outfitCompatibility: params.compatibility } : {}),
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
      ...(inactiveVariantId ? { inactiveVariantId } : {}),
      assetId: asset.id,
      presetId: preset.id,
    };
  }

  beforeAll(async () => {
    tempStorageDir = await mkdtemp(path.join(os.tmpdir(), 'arven-p8-api-int-'));
    const baseConfig = loadRuntimeConfig();
    const testConfig: RuntimeConfig = {
      ...baseConfig,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      STORAGE_DRIVER: 'local_fs',
      STORAGE_LOCAL_DIR: tempStorageDir,
      PAYMENT_DRIVER: 'local_stub',
      REDIS_URL: 'redis://127.0.0.1:6379/14',
    };

    const bootstrapped = await createApp(testConfig);
    app = bootstrapped.app;
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

    ownerSession = await createAuthenticatedSession({
      roleCode: 'OWNER',
      scope: SessionScope.ADMIN,
      mfaVerified: true,
    });
    contentSession = await createAuthenticatedSession({
      roleCode: 'CONTENT',
      scope: SessionScope.ADMIN,
      mfaVerified: true,
    });
    customerASession = await createAuthenticatedSession({
      roleCode: 'CUSTOMER',
      scope: SessionScope.CUSTOMER,
      mfaVerified: false,
    });
    customerBSession = await createAuthenticatedSession({
      roleCode: 'CUSTOMER',
      scope: SessionScope.CUSTOMER,
      mfaVerified: false,
    });

    // Seed self-contained outfit fixtures
    const tee = await seedGarmentFixture({
      slug: 'crew-tee',
      name: 'P8 Heavyweight Crew Tee',
      status: ProductStatus.PUBLISHED,
      isVisible: true,
      priceIdr: 450_000,
      stockQty: 12,
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

    const poplin = await seedGarmentFixture({
      slug: 'poplin-shirt',
      name: 'P8 Oversized Poplin Shirt',
      status: ProductStatus.PUBLISHED,
      isVisible: true,
      priceIdr: 890_000,
      stockQty: 8,
      silhouette: 'shirt',
      compatibility: {
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '1.0.0',
        slot: 'top',
        anchor: 'spine_upper',
        incompatibleSlots: ['outerwear'],
      },
    });
    poplinProductId = poplin.productId;
    poplinVariantId = poplin.variantId;

    const trouser = await seedGarmentFixture({
      slug: 'wide-trouser',
      name: 'P8 Wide Tailored Trouser',
      status: ProductStatus.PUBLISHED,
      isVisible: true,
      priceIdr: 1_250_000,
      stockQty: 0, // Out of stock for mixed cart-items test
      silhouette: 'trouser',
      compatibility: {
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '1.0.0',
        slot: 'bottom',
        anchor: 'pelvis',
        incompatibleSlots: [],
      },
    });
    trouserOutOfStockVariantId = trouser.variantId;

    const overshirt = await seedGarmentFixture({
      slug: 'boxy-overshirt',
      name: 'P8 Boxy Wool Overshirt',
      status: ProductStatus.PUBLISHED,
      isVisible: true,
      priceIdr: 1_850_000,
      stockQty: 5,
      silhouette: 'overshirt',
      extraInactiveVariant: true,
      compatibility: {
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '1.0.0',
        slot: 'outerwear',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      },
    });
    overshirtProductId = overshirt.productId;
    overshirtActiveVariantId = overshirt.variantId;
    overshirtInactiveVariantId = overshirt.inactiveVariantId!;

    const crossbody = await seedGarmentFixture({
      slug: 'calfskin-crossbody',
      name: 'P8 Structured Crossbody',
      status: ProductStatus.PUBLISHED,
      isVisible: true,
      priceIdr: 2_400_000,
      stockQty: 4,
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
    crossbodyVariantId = crossbody.variantId;

    const fieldJacket = await seedGarmentFixture({
      slug: 'archive-field-jacket',
      name: 'P8 Archive Field Jacket',
      status: ProductStatus.PUBLISHED,
      isVisible: true,
      priceIdr: 3_100_000,
      stockQty: 3,
      silhouette: 'overshirt',
      compatibility: {
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '0.9.0', // Deliberately incompatible!
        slot: 'outerwear',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      },
    });
    fieldJacketProductId = fieldJacket.productId;
    fieldJacketVariantId = fieldJacket.variantId;
    fieldJacketAssetId = fieldJacket.assetId;

    // Create a public preset via DB for catalog test
    const presetRow = await prisma.client.outfitScene.create({
      data: {
        userId: null,
        title: `${runTag} Seragam Atelier`,
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

    // Create a published zone and a draft zone via Admin API so real GLB binaries exist in tempStorageDir
    pubZoneCode = `${runTag}-atrium`;
    const createPubRes = await request(app.getHttpServer())
      .post('/api/v1/admin/showroom/zones')
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({
        code: pubZoneCode,
        title: 'Test Atrium Zone',
        description: 'Published showroom zone fixture',
        sortOrder: 0,
        lightingPreset: 'arven_studio_neutral_v1',
        portals: [
          {
            targetZoneCode: 'tailoring-gallery',
            label: 'To Tailoring',
            position: [3.2, 0, -2.5],
          },
        ],
      });
    expect(createPubRes.status).toBe(201);
    pubZoneId = (createPubRes.body as { data: { id: string } }).data.id;
    createdZoneIds.push(pubZoneId);

    const transitionPubRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/showroom/zones/${pubZoneId}/transition`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({ targetStatus: 'PUBLISHED' });
    expect(transitionPubRes.status).toBe(200);

    // Add active hotspot on published tee
    const hsRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/showroom/zones/${pubZoneId}/hotspots`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({
        productId: teeProductId,
        variantId: teeVariantId,
        label: 'Heavyweight Tee',
        positionX: -2.2,
        positionY: 0.9,
        positionZ: -1.2,
        sortOrder: 0,
        isActive: true,
      });
    expect(hsRes.status).toBe(201);

    // Add inactive hotspot on poplin (must be hidden in public /showroom/scenes)
    const inactiveHsRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/showroom/zones/${pubZoneId}/hotspots`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({
        productId: poplinProductId,
        variantId: poplinVariantId,
        label: 'Hidden Hotspot',
        positionX: 2.2,
        positionY: 0.9,
        positionZ: -1.2,
        sortOrder: 1,
        isActive: false,
      });
    expect(inactiveHsRes.status).toBe(201);

    // Draft zone fixture
    draftZoneCode = `${runTag}-draft-vault`;
    const createDraftRes = await request(app.getHttpServer())
      .post('/api/v1/admin/showroom/zones')
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({
        code: draftZoneCode,
        title: 'Test Draft Vault',
        sortOrder: 99,
      });
    expect(createDraftRes.status).toBe(201);
    draftZoneId = (createDraftRes.body as { data: { id: string } }).data.id;
    createdZoneIds.push(draftZoneId);

    // Verify poster fallback helper works
    expect(buildStudioPosterSvg({ title: 'Test', subtitle: 'Sub' })).toContain('<svg');
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
              { zone: { code: { startsWith: 'p8int-' } } },
            ],
          },
        });
        await prisma.client.showroomZone.deleteMany({
          where: {
            OR: [
              { id: { in: createdZoneIds } },
              { code: { startsWith: 'p8int-' } },
            ],
          },
        });
      }
      if (createdUserIds.length > 0) {
        await prisma.client.outfitScene.deleteMany({
          where: {
            OR: [
              { userId: { in: createdUserIds } },
              { title: { startsWith: 'p8int-' } },
            ],
          },
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
          where: {
            OR: [
              { productId: { in: createdProductIds } },
              { product: { slug: { startsWith: 'p8int-' } } },
            ],
          },
        });
        await prisma.client.assetValidationRun.deleteMany({
          where: {
            asset: {
              OR: [
                { productId: { in: createdProductIds } },
                { product: { slug: { startsWith: 'p8int-' } } },
              ],
            },
          },
        });
        await prisma.client.product3DAsset.deleteMany({
          where: {
            OR: [
              { productId: { in: createdProductIds } },
              { product: { slug: { startsWith: 'p8int-' } } },
            ],
          },
        });
        await prisma.client.productMedia.deleteMany({
          where: {
            OR: [
              { productId: { in: createdProductIds } },
              { product: { slug: { startsWith: 'p8int-' } } },
            ],
          },
        });
        await prisma.client.inventoryLevel.deleteMany({
          where: {
            variant: {
              OR: [
                { productId: { in: createdProductIds } },
                { product: { slug: { startsWith: 'p8int-' } } },
              ],
            },
          },
        });
        await prisma.client.productVariant.deleteMany({
          where: {
            OR: [
              { productId: { in: createdProductIds } },
              { product: { slug: { startsWith: 'p8int-' } } },
            ],
          },
        });
        await prisma.client.product.deleteMany({
          where: {
            OR: [
              { id: { in: createdProductIds } },
              { slug: { startsWith: 'p8int-' } },
            ],
          },
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
  // 1. Virtual Showroom Public Scenes & Binaries
  // ===========================================================================

  it('returns PUBLISHED zones with live hotspot IDR prices and hides DRAFT zones', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/showroom/scenes');
    expect(res.status).toBe(200);

    const zones = (
      res.body as {
        data: {
          zones: Array<{
            id: string;
            code: string;
            hotspots: Array<{ productId: string; fromPriceIdr: number; label: string }>;
          }>;
        };
      }
    ).data.zones;

    const codes = zones.map((z) => z.code);
    expect(codes).toContain(pubZoneCode);
    expect(codes).not.toContain(draftZoneCode);
    expect(codes).not.toContain('archive-vault');

    const pubZone = zones.find((z) => z.code === pubZoneCode)!;
    expect(pubZone.hotspots).toHaveLength(1);
    expect(pubZone.hotspots[0]).toMatchObject({
      productId: teeProductId,
      fromPriceIdr: 450_000,
      label: 'Heavyweight Tee',
    });
  });

  it('streams GLB/SVG binaries with nosniff + immutable cache headers and returns 404 on draft/unknown zones', async () => {
    const glbRes = await request(app.getHttpServer())
      .get(`/api/v1/showroom/zones/${pubZoneCode}/scene`)
      .buffer(true)
      .parse(binaryParser);
    expect(glbRes.status).toBe(200);
    expect(glbRes.headers['content-type']).toContain('model/gltf-binary');
    expect(glbRes.headers['x-content-type-options']).toBe('nosniff');
    expect(glbRes.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    const glbBuf = glbRes.body as Buffer;
    expect(glbBuf.readUInt32LE(0)).toBe(0x46546c67);

    const liteRes = await request(app.getHttpServer())
      .get(`/api/v1/showroom/zones/${pubZoneCode}/scene-lite`)
      .buffer(true)
      .parse(binaryParser);
    expect(liteRes.status).toBe(200);
    expect(liteRes.headers['x-content-type-options']).toBe('nosniff');
    expect((liteRes.body as Buffer).readUInt32LE(0)).toBe(0x46546c67);

    const posterRes = await request(app.getHttpServer()).get(
      `/api/v1/showroom/zones/${pubZoneCode}/poster`,
    );
    expect(posterRes.status).toBe(200);
    expect(posterRes.headers['x-content-type-options']).toBe('nosniff');
    expect(posterRes.headers['content-type']).toContain('image/svg+xml');

    const draftRes = await request(app.getHttpServer()).get(
      `/api/v1/showroom/zones/${draftZoneCode}/scene`,
    );
    expect(draftRes.status).toBe(404);

    const rigRes = await request(app.getHttpServer())
      .get(`/api/v1/outfit-studio/rigs/${OUTFIT_STUDIO_POLICY.RIG_ID}/model`)
      .buffer(true)
      .parse(binaryParser);
    expect(rigRes.status).toBe(200);
    expect(rigRes.headers['x-content-type-options']).toBe('nosniff');
    expect((rigRes.body as Buffer).readUInt32LE(0)).toBe(0x46546c67);

    const unknownRigRes = await request(app.getHttpServer()).get(
      '/api/v1/outfit-studio/rigs/arven_mannequin_unknown/model',
    );
    expect(unknownRigRes.status).toBe(404);
  });

  // ===========================================================================
  // 2. Outfit Studio Catalog & Compatibility Validation
  // ===========================================================================

  it('excludes incompatible 0.9.0 garments from /outfit-studio/catalog and enforces 422 rules on /validate', async () => {
    const catRes = await request(app.getHttpServer()).get(
      '/api/v1/outfit-studio/catalog',
    );
    expect(catRes.status).toBe(200);

    const catalog = (
      catRes.body as {
        data: {
          rig: { rigId: string; skeletonVersion: string };
          garments: Array<{ productId: string; compatibility: { skeletonVersion: string } }>;
          publicPresets: Array<{ id: string }>;
        };
      }
    ).data;

    expect(catalog.rig.rigId).toBe(OUTFIT_STUDIO_POLICY.RIG_ID);
    expect(catalog.rig.skeletonVersion).toBe('1.0.0');

    const garmentProductIds = catalog.garments.map((g) => g.productId);
    expect(garmentProductIds).toContain(teeProductId);
    expect(garmentProductIds).toContain(poplinProductId);
    expect(garmentProductIds).toContain(overshirtProductId);
    expect(garmentProductIds).not.toContain(fieldJacketProductId);
    expect(catalog.publicPresets.some((p) => p.id === publicPresetId)).toBe(true);

    const { cookieHeader, csrfToken } = await getPreAuthCsrf();

    // Valid composition
    const okRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/validate')
      .set('Cookie', cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrfToken)
      .send({
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [
          { slot: 'top', variantId: teeVariantId, presetId: teePresetId },
          { slot: 'outerwear', variantId: overshirtActiveVariantId },
          { slot: 'accessory', variantId: crossbodyVariantId },
        ],
      });
    expect(okRes.status).toBe(200);
    expect((okRes.body as { data: { valid: boolean } }).data.valid).toBe(true);

    // 0.9.0 field jacket -> 422 SKELETON_VERSION_MISMATCH
    const verMismatchRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/validate')
      .set('Cookie', cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrfToken)
      .send({
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [{ slot: 'outerwear', variantId: fieldJacketVariantId }],
      });
    expect(verMismatchRes.status).toBe(422);
    expect(verMismatchRes.body.error.code).toBe('INCOMPATIBLE_OUTFIT_SLOT');
    expect(verMismatchRes.body.error.details[0].issue).toContain(
      'SKELETON_VERSION_MISMATCH',
    );

    // Layer conflict poplin + overshirt (order A -> B)
    const conflictAB = await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/validate')
      .set('Cookie', cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrfToken)
      .send({
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [
          { slot: 'top', variantId: poplinVariantId },
          { slot: 'outerwear', variantId: overshirtActiveVariantId },
        ],
      });
    expect(conflictAB.status).toBe(422);
    expect(conflictAB.body.error.code).toBe('INCOMPATIBLE_OUTFIT_SLOT');
    expect(conflictAB.body.error.details[0].issue).toContain('LAYER_CONFLICT');

    // Layer conflict overshirt + poplin (order B -> A)
    const conflictBA = await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/validate')
      .set('Cookie', cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrfToken)
      .send({
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [
          { slot: 'outerwear', variantId: overshirtActiveVariantId },
          { slot: 'top', variantId: poplinVariantId },
        ],
      });
    expect(conflictBA.status).toBe(422);
    expect(conflictBA.body.error.code).toBe('INCOMPATIBLE_OUTFIT_SLOT');
    expect(conflictBA.body.error.details[0].issue).toContain('LAYER_CONFLICT');

    // Slot mismatch: crossbody assigned to top
    const slotMismatchRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/validate')
      .set('Cookie', cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrfToken)
      .send({
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [{ slot: 'top', variantId: crossbodyVariantId }],
      });
    expect(slotMismatchRes.status).toBe(422);
    expect(slotMismatchRes.body.error.code).toBe('INCOMPATIBLE_OUTFIT_SLOT');
    expect(slotMismatchRes.body.error.details[0].issue).toContain('SLOT_MISMATCH');

    // Strict Zod rejects client price tampering
    const tamperRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/validate')
      .set('Cookie', cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrfToken)
      .send({
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [{ slot: 'top', variantId: teeVariantId, priceIdr: 1 }],
      });
    expect(tamperRes.status).toBe(400);
    expect(tamperRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ===========================================================================
  // 3. Customer /outfit-scenes CRUD, Live Price Hydration, IDOR & 50-Limit
  // ===========================================================================

  it('enforces auth, IDOR 404, zero persisted prices, live price re-resolution, and 50-outfit limit on /outfit-scenes', async () => {
    const guestRes = await request(app.getHttpServer()).get('/api/v1/outfit-scenes');
    expect(guestRes.status).toBe(401);

    // Create outfit for Customer A
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-scenes')
      .set('Cookie', customerASession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerASession.csrfToken)
      .send({
        title: 'Look Hari Kerja',
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [
          { slot: 'top', variantId: teeVariantId, presetId: teePresetId },
          { slot: 'outerwear', variantId: overshirtActiveVariantId },
        ],
      });
    expect(createRes.status).toBe(201);
    const created = (
      createRes.body as {
        data: {
          id: string;
          title: string;
          liveTotalIdr: number;
          slots: Array<{ unitPriceIdr: number; stale: boolean }>;
        };
      }
    ).data;
    createdOutfitSceneIds.push(created.id);
    expect(created.liveTotalIdr).toBe(450_000 + 1_850_000);

    // Verify raw DB row stores IDs only (zero price keys)
    const rawRow = await prisma.client.outfitScene.findUniqueOrThrow({
      where: { id: created.id },
    });
    const rawItemsJson = JSON.stringify(rawRow.items);
    expect(rawItemsJson).not.toMatch(/price|amount|total|discount/i);

    // Bump variant price in DB and confirm GET reflects updated live price
    await prisma.client.productVariant.update({
      where: { id: teeVariantId },
      data: { priceIdr: BigInt(600_000) },
    });

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/outfit-scenes/${created.id}`)
      .set('Cookie', customerASession.cookieHeader);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.liveTotalIdr).toBe(600_000 + 1_850_000);
    expect(getRes.body.data.slots[0].unitPriceIdr).toBe(600_000);

    // Restore tee price
    await prisma.client.productVariant.update({
      where: { id: teeVariantId },
      data: { priceIdr: BigInt(450_000) },
    });

    // Cross-user IDOR returns 404 (not 403)
    const idorGet = await request(app.getHttpServer())
      .get(`/api/v1/outfit-scenes/${created.id}`)
      .set('Cookie', customerBSession.cookieHeader);
    expect(idorGet.status).toBe(404);

    const idorPatch = await request(app.getHttpServer())
      .patch(`/api/v1/outfit-scenes/${created.id}`)
      .set('Cookie', customerBSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerBSession.csrfToken)
      .send({ title: 'Stolen' });
    expect(idorPatch.status).toBe(404);

    const idorDel = await request(app.getHttpServer())
      .delete(`/api/v1/outfit-scenes/${created.id}`)
      .set('Cookie', customerBSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerBSession.csrfToken);
    expect(idorDel.status).toBe(404);

    // Patch valid update
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/outfit-scenes/${created.id}`)
      .set('Cookie', customerASession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerASession.csrfToken)
      .send({ title: 'Look Hari Kerja v2' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.title).toBe('Look Hari Kerja v2');

    // Enforce 50-outfit limit per user
    const fillerRows = Array.from({ length: 49 }, (_, idx) => ({
      userId: customerASession.userId,
      title: `Filler ${idx + 2}`,
      mannequinRigVersion: OUTFIT_STUDIO_POLICY.RIG_ID,
      isPublicPreset: false,
      items: [
        {
          slot: 'top',
          productId: teeProductId,
          variantId: teeVariantId,
          assetId: teeAssetId,
          presetId: null,
        },
      ] as unknown as Prisma.InputJsonValue,
    }));
    await prisma.client.outfitScene.createMany({ data: fillerRows });

    const limitRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-scenes')
      .set('Cookie', customerASession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerASession.csrfToken)
      .send({
        title: 'Outfit 51',
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [{ slot: 'top', variantId: teeVariantId }],
      });
    expect(limitRes.status).toBe(422);
    expect(limitRes.body.error.code).toBe('OUTFIT_LIMIT_REACHED');

    // Delete works
    const delRes = await request(app.getHttpServer())
      .delete(`/api/v1/outfit-scenes/${created.id}`)
      .set('Cookie', customerASession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, customerASession.csrfToken);
    expect(delRes.status).toBe(204);
  });

  // ===========================================================================
  // 4. /outfit-studio/cart-items Mixed Outcomes
  // ===========================================================================

  it('handles mixed ADDED / OUT_OF_STOCK / INACTIVE outcomes cleanly via CartService', async () => {
    const { cookieHeader, csrfToken } = await getPreAuthCsrf();

    const cartRes = await request(app.getHttpServer())
      .post('/api/v1/outfit-studio/cart-items')
      .set('Cookie', cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, csrfToken)
      .send({
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [
          { slot: 'top', variantId: teeVariantId, presetId: teePresetId },
          { slot: 'bottom', variantId: trouserOutOfStockVariantId },
          { slot: 'outerwear', variantId: overshirtInactiveVariantId },
        ],
      });

    expect(cartRes.status).toBe(200);
    const payload = (
      cartRes.body as {
        data: {
          cart: {
            id: string | null;
            subtotalIdr: number;
            items: Array<{ variantId: string; unitPriceIdr: number; configuration: Record<string, unknown> }>;
          };
          results: Array<{ slot: string; variantId: string; status: string }>;
        };
      }
    ).data;

    if (payload.cart.id) {
      createdCartIds.push(payload.cart.id);
    }

    expect(payload.results).toEqual([
      expect.objectContaining({ slot: 'top', variantId: teeVariantId, status: 'ADDED' }),
      expect.objectContaining({
        slot: 'bottom',
        variantId: trouserOutOfStockVariantId,
        status: 'OUT_OF_STOCK',
      }),
      expect.objectContaining({
        slot: 'outerwear',
        variantId: overshirtInactiveVariantId,
        status: 'INACTIVE',
      }),
    ]);

    expect(payload.cart.items).toHaveLength(1);
    expect(payload.cart.items[0]).toMatchObject({
      variantId: teeVariantId,
      unitPriceIdr: 450_000,
      configuration: { outfitPresetId: teePresetId },
    });
    expect(payload.cart.subtotalIdr).toBe(450_000);
  });

  // ===========================================================================
  // 5. Admin Showroom & Outfit Studio Mutations + RBAC
  // ===========================================================================

  it('supports admin zone lifecycle, hotspot CRUD, compatibility updates, preset CRUD, and CONTENT read-only RBAC', async () => {
    // CONTENT role may read admin garments & zones, but gets 403 on mutations
    const contentReadRes = await request(app.getHttpServer())
      .get('/api/v1/admin/outfit-studio/garments')
      .set('Cookie', contentSession.cookieHeader);
    expect(contentReadRes.status).toBe(200);
    const diagList = contentReadRes.body.data as Array<{
      assetId: string;
      compatibleWithCurrentRig: boolean;
    }>;
    const fjDiag = diagList.find((d) => d.assetId === fieldJacketAssetId);
    expect(fjDiag?.compatibleWithCurrentRig).toBe(false);

    const contentMutRes = await request(app.getHttpServer())
      .post('/api/v1/admin/showroom/zones')
      .set('Cookie', contentSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, contentSession.csrfToken)
      .send({ code: `${runTag}-blocked`, title: 'Forbidden' });
    expect(contentMutRes.status).toBe(403);

    // OWNER updates & transitions zone: PUBLISHED -> ARCHIVED -> DRAFT -> PUBLISHED
    const patchZoneRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/showroom/zones/${pubZoneId}`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({ title: 'Updated Atrium Zone' });
    expect(patchZoneRes.status).toBe(200);
    expect(patchZoneRes.body.data.title).toBe('Updated Atrium Zone');

    const invalidTransRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/showroom/zones/${pubZoneId}/transition`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({ targetStatus: 'DRAFT' });
    expect(invalidTransRes.status).toBe(409);

    const archiveRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/showroom/zones/${pubZoneId}/transition`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({ targetStatus: 'ARCHIVED' });
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.data.status).toBe('ARCHIVED');

    // Update & delete hotspot on zone
    const newHsRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/showroom/zones/${draftZoneId}/hotspots`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({
        productId: crossbodyProductId,
        label: 'Crossbody Bag',
        positionX: 1.5,
        positionY: 1.0,
        positionZ: -1.5,
      });
    expect(newHsRes.status).toBe(201);
    const hotspotId = newHsRes.body.data.id as string;

    const updHsRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/showroom/hotspots/${hotspotId}`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({ label: 'Crossbody Bag v2', isActive: false });
    expect(updHsRes.status).toBe(200);
    expect(updHsRes.body.data.label).toBe('Crossbody Bag v2');

    const delHsRes = await request(app.getHttpServer())
      .delete(`/api/v1/admin/showroom/hotspots/${hotspotId}`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken);
    expect(delHsRes.status).toBe(204);

    // Upgrade field jacket compatibility to 1.0.0 then remove compatibility
    const putCompatRes = await request(app.getHttpServer())
      .put(`/api/v1/admin/3d-assets/${fieldJacketAssetId}/outfit-compatibility`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '1.0.0',
        slot: 'outerwear',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      });
    expect(putCompatRes.status).toBe(200);
    expect(putCompatRes.body.data.compatibleWithCurrentRig).toBe(true);

    const delCompatRes = await request(app.getHttpServer())
      .delete(`/api/v1/admin/3d-assets/${fieldJacketAssetId}/outfit-compatibility`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken);
    expect(delCompatRes.status).toBe(204);

    // Admin public preset CRUD
    const createPresetRes = await request(app.getHttpServer())
      .post('/api/v1/admin/outfit-studio/presets')
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({
        title: `${runTag} Curated Look`,
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        slots: [
          { slot: 'top', variantId: teeVariantId, presetId: teePresetId },
          { slot: 'accessory', variantId: crossbodyVariantId },
        ],
      });
    expect(createPresetRes.status).toBe(201);
    const createdPresetId = createPresetRes.body.data.id as string;
    createdOutfitSceneIds.push(createdPresetId);

    const patchPresetRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/outfit-studio/presets/${createdPresetId}`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken)
      .send({ title: `${runTag} Curated Look Updated` });
    expect(patchPresetRes.status).toBe(200);
    expect(patchPresetRes.body.data.title).toBe(`${runTag} Curated Look Updated`);

    const delPresetRes = await request(app.getHttpServer())
      .delete(`/api/v1/admin/outfit-studio/presets/${createdPresetId}`)
      .set('Cookie', ownerSession.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, ownerSession.csrfToken);
    expect(delPresetRes.status).toBe(204);

    // Verify audit logs were recorded for admin mutations
    const auditCount = await prisma.client.auditLog.count({
      where: {
        actorId: ownerSession.userId,
        action: { in: ['showroom.zone.created', 'showroom.zone.transitioned', 'outfit.preset.created'] },
      },
    });
    expect(auditCount).toBeGreaterThanOrEqual(3);
  });
});
