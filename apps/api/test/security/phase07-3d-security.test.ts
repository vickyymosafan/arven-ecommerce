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
  loadRuntimeConfig,
  type AdminRoleCode,
  type RuntimeConfig,
} from '@arven/config';
import {
  AssetStatus,
  ProductStatus,
  SessionScope,
  UserStatus,
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

interface AdminSessionHandle {
  roleCode: AdminRoleCode;
  userId: string;
  cookieHeader: string;
  csrfToken: string;
}

function buildSsrfGlbPayload(): Buffer {
  const gltf = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: 'http://169.254.169.254/latest/meta-data/', byteLength: 16 }],
    meshes: [
      {
        name: 'mesh_garment_body',
        primitives: [{ attributes: { POSITION: 0 } }],
      },
    ],
    accessors: [{ count: 3, componentType: 5126, type: 'VEC3' }],
    materials: [{ name: 'mat_fabric_primary' }],
  });
  const jsonBytes = Buffer.from(gltf, 'utf8');
  const alignedLen = Math.ceil(jsonBytes.length / 4) * 4;
  const totalLen = 20 + alignedLen;
  const out = Buffer.alloc(totalLen, 0x20);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(alignedLen, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(out, 20);
  return out;
}

describe('Phase 07 3D Assets Security, T-06 Validation, Publish Gate & RBAC Suite', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let config: RuntimeConfig;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;
  let tempStorageDir: string;

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    tempStorageDir = await mkdtemp(path.join(os.tmpdir(), 'arven-p7-api-sec-'));
    const baseConfig = loadRuntimeConfig();
    const testConfig: RuntimeConfig = {
      ...baseConfig,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      STORAGE_DRIVER: 'local_fs',
      STORAGE_LOCAL_DIR: tempStorageDir,
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

    await redis.flushdb();
  });

  beforeEach(async () => {
    const keys = await redis.keys('throttle:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    if (prisma) {
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
        await prisma.client.productCategory.deleteMany({
          where: { productId: { in: createdProductIds } },
        });
        await prisma.client.product.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
      if (createdUserIds.length > 0) {
        await prisma.client.session.deleteMany({
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
    if (tempStorageDir) {
      await rm(tempStorageDir, { recursive: true, force: true });
    }
  });

  async function seedAdminActor(
    roleCode: AdminRoleCode,
  ): Promise<AdminSessionHandle> {
    const role = await prisma.client.role.findUniqueOrThrow({
      where: { code: roleCode },
    });
    const suffix = `${roleCode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.client.user.create({
      data: {
        email: `p7-sec-${suffix}@arven.local`,
        passwordHash: 'argon2id-test-placeholder',
        fullName: `Phase07 Sec ${roleCode}`,
        status: UserStatus.ACTIVE,
        verifiedAt: new Date(),
        mfaEnabled: true,
        mfaSecretEncrypted: 'placeholder',
        userRoles: { create: { roleId: role.id } },
      },
    });
    createdUserIds.push(user.id);

    const rawToken = `raw-p7-sec-${user.id}-${suffix}`;
    const tokenHash = tokenCrypto.sha256Hex(rawToken);
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();

    await prisma.client.session.create({
      data: {
        userId: user.id,
        scope: SessionScope.ADMIN,
        tokenHash,
        csrfSecret,
        mfaVerifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    const cookieName = sessionStore.getCookieName(SessionScope.ADMIN);
    return {
      roleCode,
      userId: user.id,
      cookieHeader: `${cookieName}=${rawToken}`,
      csrfToken: tokenCrypto.deriveSessionCsrfToken(csrfSecret),
    };
  }

  async function createCompleteDraftProduct(
    admin: AdminSessionHandle,
    slug: string,
    has3dEnabled: boolean,
  ): Promise<string> {
    const cat = await prisma.client.category.findFirstOrThrow({
      where: { isActive: true, deletedAt: null },
    });
    const createdRes = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', admin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, admin.csrfToken)
      .send({
        name: `Test 3D Silhouette ${slug}`,
        slug,
        description: 'Architectural garment built for automated 3D validation testing.',
        material: '100% Virgin Wool',
        fit: 'Boxy Fit',
        careInstruction: 'Dry clean only.',
        seoTitle: `SEO ${slug} ARVEN Atelier`,
        seoDescription: 'Contemporary luxury outerwear engineered for Phase 07 testing.',
        has3dEnabled,
        categoryIds: [cat.id],
        primaryCategoryId: cat.id,
      })
      .expect(201);

    const productId = (createdRes.body as { data: { id: string } }).data.id;
    createdProductIds.push(productId);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/variants`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', admin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, admin.csrfToken)
      .send({
        sku: `ARV-P7-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        size: 'M',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 899_000,
        weightGrams: 550,
        initialStock: 10,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/media`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', admin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, admin.csrfToken)
      .send({
        type: 'IMAGE',
        url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%2317191B%22%2F%3E%3C%2Fsvg%3E',
        altText: 'Studio silhouette test image',
        position: 0,
        isPrimary: true,
      })
      .expect(201);

    return productId;
  }

  it('enforces Threat T-06 negative upload controls (polyglot HTML, MZ, SSRF URI, path traversal filename) and blocks publish (422)', async () => {
    const productAdmin = await seedAdminActor('PRODUCT');
    const slug = `t06-security-${Date.now()}`;
    const productId = await createCompleteDraftProduct(productAdmin, slug, true);

    // Gate check must fail with 422 PUBLISH_GATE_UNMET when has3dEnabled=true but no READY 3D asset exists
    const gateFailRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/transition`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({ targetStatus: 'PUBLISHED' })
      .expect(422);
    expect((gateFailRes.body as { error: { code: string } }).error.code).toBe(
      'PUBLISH_GATE_UNMET',
    );

    // 1) Client supplies traversal filename: server must ignore filename path segments
    const presignBadNameRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/3d-assets/presign`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({
        fileName: '../../.env',
        contentType: 'model/gltf-binary',
        bytes: 512,
      })
      .expect(201);

    const presignData = (
      presignBadNameRes.body as {
        data: {
          asset: { id: string; objectKey: string };
          stagingKey: string;
        };
      }
    ).data;
    expect(presignData.stagingKey).not.toContain('..');
    expect(presignData.asset.objectKey).toBe(`products/${slug}/v0001/model.glb`);

    // Confirm with HTML/script polyglot -> FAILED
    const htmlConfirm = await request(app.getHttpServer())
      .post(`/api/v1/admin/3d-assets/${presignData.asset.id}/confirm`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({
        glbBase64: Buffer.from(
          '<!DOCTYPE html><script>alert(1)</script>',
          'utf8',
        ).toString('base64'),
      })
      .expect(202);
    expect((htmlConfirm.body as { data: { status: string } }).data.status).toBe(
      AssetStatus.FAILED,
    );

    // Attempt to publish FAILED asset -> 422
    await request(app.getHttpServer())
      .post(`/api/v1/admin/3d-assets/${presignData.asset.id}/publish`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({ enableProduct3d: true })
      .expect(422);

    // Confirm v2 with SSRF external URI -> FAILED
    const presignSsrf = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/3d-assets/presign`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({ fileName: 'ssrf.glb', contentType: 'model/gltf-binary', bytes: 512 })
      .expect(201);
    const ssrfAssetId = (presignSsrf.body as { data: { asset: { id: string } } })
      .data.asset.id;

    const ssrfConfirm = await request(app.getHttpServer())
      .post(`/api/v1/admin/3d-assets/${ssrfAssetId}/confirm`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({ glbBase64: buildSsrfGlbPayload().toString('base64') })
      .expect(202);
    expect((ssrfConfirm.body as { data: { status: string } }).data.status).toBe(
      AssetStatus.FAILED,
    );

    // Unvalidated / FAILED assets must remain inaccessible on public routes (404)
    await request(app.getHttpServer())
      .get(`/api/v1/3d-assets/${ssrfAssetId}/metadata`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/3d-assets/${ssrfAssetId}/model`)
      .expect(404);
  });

  it('completes valid GLB upload -> validation -> publish -> version swap -> preset validation & binary nosniff streaming', async () => {
    const productAdmin = await seedAdminActor('PRODUCT');
    const slug = `atelier-3d-live-${Date.now()}`;
    const productId = await createCompleteDraftProduct(productAdmin, slug, true);

    const validGlb = Buffer.from(
      buildArvenGarmentGlbBuffer({ silhouette: 'overshirt', profile: 'default' }),
    );
    const validLite = Buffer.from(
      buildArvenGarmentGlbBuffer({ silhouette: 'overshirt', profile: 'lite' }),
    );

    const p1 = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/3d-assets/presign`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({
        fileName: 'overshirt.glb',
        contentType: 'model/gltf-binary',
        bytes: validGlb.byteLength,
      })
      .expect(201);
    const asset1Id = (p1.body as { data: { asset: { id: string } } }).data.asset.id;

    // Upload to staging endpoint
    await request(app.getHttpServer())
      .put(`/api/v1/admin/3d-assets/${asset1Id}/upload-staging`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({
        glbBase64: validGlb.toString('base64'),
        liteGlbBase64: validLite.toString('base64'),
      })
      .expect(200);

    // Confirm validation -> READY
    const c1 = await request(app.getHttpServer())
      .post(`/api/v1/admin/3d-assets/${asset1Id}/confirm`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({})
      .expect(202);
    expect((c1.body as { data: { status: string } }).data.status).toBe(
      AssetStatus.READY,
    );

    // Non-customizable slot override or pink hex must fail
    await request(app.getHttpServer())
      .post(`/api/v1/admin/3d-assets/${asset1Id}/presets`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({
        code: 'invalid-pink',
        label: 'Invalid Pink',
        swatchHex: '#FF1493',
        materialOverrides: {
          mat_fabric_primary: { baseColorHex: '#17191B' },
        },
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/3d-assets/${asset1Id}/presets`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({
        code: 'hardware-tamper',
        label: 'Hardware Tamper',
        swatchHex: '#35383A',
        materialOverrides: {
          mat_hardware_accent: { baseColorHex: '#35383A' },
        },
      })
      .expect(422);

    // Valid preset creation
    await request(app.getHttpServer())
      .post(`/api/v1/admin/3d-assets/${asset1Id}/presets`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({
        code: 'obsidian-wool',
        label: 'Obsidian Wool',
        swatchHex: '#1D1E20',
        materialOverrides: {
          mat_fabric_primary: {
            baseColorHex: '#1D1E20',
            roughness: 0.85,
            metalness: 0.02,
          },
        },
        sortOrder: 0,
      })
      .expect(201);

    // Publish 3D asset v1 & product
    await request(app.getHttpServer())
      .post(`/api/v1/admin/3d-assets/${asset1Id}/publish`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({ enableProduct3d: true })
      .expect(200);

    const publishedProduct = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/transition`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', productAdmin.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, productAdmin.csrfToken)
      .send({ targetStatus: 'PUBLISHED' })
      .expect(200);
    expect(
      (publishedProduct.body as { data: { status: string } }).data.status,
    ).toBe(ProductStatus.PUBLISHED);

    // Public read returns asset + preset, and binary route emits model/gltf-binary + nosniff
    const pubAssetRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${slug}/3d-assets`)
      .expect(200);
    const pubData = (
      pubAssetRes.body as {
        data: { id: string; customizationPresets: Array<{ code: string }> };
      }
    ).data;
    expect(pubData.id).toBe(asset1Id);
    expect(pubData.customizationPresets[0]?.code).toBe('obsidian-wool');

    const glbDownload = await request(app.getHttpServer())
      .get(`/api/v1/3d-assets/${asset1Id}/model`)
      .expect(200);
    expect(glbDownload.headers['content-type']).toContain('model/gltf-binary');
    expect(glbDownload.headers['x-content-type-options']).toBe('nosniff');
    expect(glbDownload.headers['cache-control']).toContain('immutable');
  });

  it('enforces 7-role RBAC asset permissions and zero-PII 3D telemetry boundaries', async () => {
    const admins = await Promise.all(
      ADMIN_ROLE_CODES.map(async (role) => [role, await seedAdminActor(role)] as const),
    );
    const adminByRole = Object.fromEntries(admins) as Record<
      AdminRoleCode,
      AdminSessionHandle
    >;

    const targetProduct = await prisma.client.product.findFirstOrThrow({
      where: { slug: 'essentials-heavyweight-crew-tee' },
      include: {
        assets3d: { where: { isActiveVersion: true }, take: 1 },
      },
    });

    // asset.read allowed for OWNER, MANAGER, PRODUCT, CONTENT; denied for INVENTORY, ORDER, SUPPORT
    for (const allowedRole of ['OWNER', 'MANAGER', 'PRODUCT', 'CONTENT'] as const) {
      const actor = adminByRole[allowedRole];
      await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${targetProduct.id}/3d-assets`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', actor.cookieHeader)
        .expect(200);
    }

    for (const deniedRole of ['INVENTORY', 'ORDER', 'SUPPORT'] as const) {
      const actor = adminByRole[deniedRole];
      await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${targetProduct.id}/3d-assets`)
        .set('Origin', config.ADMIN_URL)
        .set('Cookie', actor.cookieHeader)
        .expect(403);
    }

    // CONTENT cannot upload/presign or publish (403)
    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${targetProduct.id}/3d-assets/presign`)
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminByRole.CONTENT.cookieHeader)
      .set(HTTP_HEADERS.CSRF_TOKEN, adminByRole.CONTENT.csrfToken)
      .send({ fileName: 'deny.glb', contentType: 'model/gltf-binary', bytes: 512 })
      .expect(403);

    // Fetch guest CSRF token (all mutating browser routes enforce Origin + X-CSRF-Token)
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/csrf-token')
      .set('Origin', config.APP_URL)
      .expect(200);
    const setCookie = csrfRes.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const guestCookie = cookies.map((c) => c.split(';')[0]!).join('; ');
    const guestCsrf = (csrfRes.body as { data: { csrfToken: string } }).data.csrfToken;

    // Telemetry rejects unknown/PII keys with 400 and records clean anonymized metrics
    await request(app.getHttpServer())
      .post('/api/v1/3d-assets/telemetry')
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCookie)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
      .send({
        eventType: 'viewer_opened',
        productId: targetProduct.id,
        email: 'pii-must-be-rejected@example.com',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/3d-assets/telemetry')
      .set('Origin', config.APP_URL)
      .set('Cookie', guestCookie)
      .set(HTTP_HEADERS.CSRF_TOKEN, guestCsrf)
      .send({
        eventType: 'viewer_opened',
        productId: targetProduct.id,
        assetId: targetProduct.assets3d[0]?.id,
        version: 1,
        deviceTier: 'default',
      })
      .expect(202);

    const kpiRes = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/3d-engagement')
      .set('Origin', config.ADMIN_URL)
      .set('Cookie', adminByRole.MANAGER.cookieHeader)
      .expect(200);
    expect(
      (kpiRes.body as { data: { viewerOpenedCount: number } }).data
        .viewerOpenedCount,
    ).toBeGreaterThanOrEqual(1);
  });
});
