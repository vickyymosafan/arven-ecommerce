import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import {
  OUTFIT_ANCHORS,
  OUTFIT_STUDIO_POLICY,
  SHOWROOM_POLICY,
  findWorkspaceEnvFile,
} from '@arven/config';
import {
  MANNEQUIN_DEFAULT_MAX_TRIANGLES,
  MANNEQUIN_LITE_MAX_TRIANGLES,
  inspectAndValidateGlbBuffer,
} from '@arven/three-engine/glb';
import { evaluateOutfitCompatibility } from '@arven/three-engine/outfit-studio';
import { describe, expect, it } from 'vitest';
import {
  AssetStatus,
  ShowroomZoneStatus,
  createPrismaClient,
  seedDatabase,
} from '../src/index.js';

function resolveTestRepoRoot(envPath: string | null | undefined): string {
  if (envPath) {
    return path.dirname(envPath);
  }
  return path.resolve(import.meta.dirname, '../../..');
}

describe('Phase 08 Virtual Showroom & Outfit Studio Seed & DB Constraint Invariants', () => {
  it('seeds 4 zones, 8 hotspots, rig binaries, garment compatibility, 2 public presets, and enforces DB CHECKs in PostgreSQL 18', async () => {
    const envPath = findWorkspaceEnvFile(import.meta.dirname);
    if (envPath) {
      loadDotenv({ path: envPath, quiet: true });
    }
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!dbUrl) {
      throw new Error('DATABASE_URL required for Phase 08 seed verification');
    }

    const prisma = createPrismaClient({ connectionString: dbUrl });
    try {
      const first = await seedDatabase(prisma, { seedDevUsers: false });
      const second = await seedDatabase(prisma, { seedDevUsers: false });

      expect(first.showroomZonesUpserted).toBe(4);
      expect(first.showroomHotspotsUpserted).toBe(8);
      expect(first.outfitPublicPresetsUpserted).toBe(2);
      expect(first.rigAssetsWritten).toBe(3);
      expect(first.assets3dUpserted).toBe(7);

      expect(second.showroomZonesUpserted).toBe(4);
      expect(second.showroomHotspotsUpserted).toBe(8);
      expect(second.outfitPublicPresetsUpserted).toBe(2);

      // 1. Verify Showroom Zones (3 PUBLISHED, 1 DRAFT) & 8 Hotspots & disk GLBs
      const zones = await prisma.showroomZone.findMany({
        include: { hotspots: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      });
      expect(zones).toHaveLength(4);
      expect(zones.map((z) => z.code)).toEqual([
        'atrium-entrance',
        'tailoring-gallery',
        'movement-annex',
        'archive-vault',
      ]);

      const publishedZones = zones.filter((z) => z.status === ShowroomZoneStatus.PUBLISHED);
      const draftZones = zones.filter((z) => z.status === ShowroomZoneStatus.DRAFT);
      expect(publishedZones).toHaveLength(3);
      expect(draftZones).toHaveLength(1);
      expect(draftZones[0]?.code).toBe('archive-vault');
      expect(draftZones[0]?.publishedAt).toBeNull();
      for (const pub of publishedZones) {
        expect(pub.publishedAt).toBeInstanceOf(Date);
      }

      const totalHotspots = zones.reduce((sum, z) => sum + z.hotspots.length, 0);
      expect(totalHotspots).toBe(8);

      const repoRoot = resolveTestRepoRoot(envPath);
      const publicRoot = path.resolve(repoRoot, '.local/storage/public');

      for (const zone of zones) {
        expect(Number(zone.sceneBytes)).toBeGreaterThan(0);
        expect(Number(zone.sceneBytes)).toBeLessThanOrEqual(SHOWROOM_POLICY.MAX_ZONE_BYTES);
        expect(Number(zone.liteSceneBytes)).toBeGreaterThan(0);
        expect(Number(zone.liteSceneBytes)).toBeLessThanOrEqual(
          SHOWROOM_POLICY.MAX_LITE_ZONE_BYTES,
        );

        const scenePath = path.resolve(publicRoot, zone.sceneObjectKey);
        const litePath = path.resolve(publicRoot, zone.liteSceneObjectKey!);
        const posterPath = path.resolve(publicRoot, zone.posterKey);
        expect(existsSync(scenePath)).toBe(true);
        expect(existsSync(litePath)).toBe(true);
        expect(existsSync(posterPath)).toBe(true);

        const sceneCheck = inspectAndValidateGlbBuffer(await readFile(scenePath), {
          profile: 'default',
        });
        expect(sceneCheck.valid).toBe(true);
      }

      // 2. Verify Mannequin Rig binaries on disk & anchor node names
      const rigDir = path.resolve(publicRoot, 'rigs', OUTFIT_STUDIO_POLICY.RIG_ID, 'v0001');
      const rigDefaultPath = path.resolve(rigDir, 'mannequin.glb');
      const rigLitePath = path.resolve(rigDir, 'mannequin-lite.glb');
      const rigPosterPath = path.resolve(rigDir, 'poster.svg');
      expect(existsSync(rigDefaultPath)).toBe(true);
      expect(existsSync(rigLitePath)).toBe(true);
      expect(existsSync(rigPosterPath)).toBe(true);

      const rigDefaultBuf = await readFile(rigDefaultPath);
      const rigLiteBuf = await readFile(rigLitePath);
      const rigDefaultReport = inspectAndValidateGlbBuffer(rigDefaultBuf, { profile: 'default' });
      const rigLiteReport = inspectAndValidateGlbBuffer(rigLiteBuf, { profile: 'lite' });
      expect(rigDefaultReport.valid).toBe(true);
      expect(rigLiteReport.valid).toBe(true);
      expect(rigDefaultReport.triangleCount).toBeLessThanOrEqual(
        MANNEQUIN_DEFAULT_MAX_TRIANGLES,
      );
      expect(rigLiteReport.triangleCount).toBeLessThanOrEqual(MANNEQUIN_LITE_MAX_TRIANGLES);

      // Verify GLTF JSON inside mannequin.glb contains all 6 anchor node names
      const jsonLen = rigDefaultBuf.readUInt32LE(12);
      const gltfJsonText = rigDefaultBuf.subarray(20, 20 + jsonLen).toString('utf8');
      for (const anchor of OUTFIT_ANCHORS) {
        expect(gltfJsonText).toContain(`"${anchor}"`);
      }

      // 3. Verify deliberately incompatible field jacket (skeleton 0.9.0) & poplin layer conflict
      const fieldJacket = await prisma.product.findUnique({
        where: { slug: 'atelier-archive-field-jacket' },
        include: {
          variants: { where: { isActive: true, deletedAt: null } },
          assets3d: { where: { isActiveVersion: true, status: AssetStatus.READY } },
        },
      });
      expect(fieldJacket).not.toBeNull();
      expect(fieldJacket?.has3dEnabled).toBe(false);
      expect(fieldJacket?.variants).toHaveLength(2);
      expect(fieldJacket?.assets3d).toHaveLength(1);
      const jacketConfig = fieldJacket?.assets3d[0]?.config as Record<string, unknown>;
      const jacketCompat = jacketConfig['outfitCompatibility'] as Record<string, unknown>;
      expect(jacketCompat['skeletonVersion']).toBe('0.9.0');

      const poplinShirt = await prisma.product.findUnique({
        where: { slug: 'atelier-oversized-poplin-shirt' },
        include: {
          assets3d: { where: { isActiveVersion: true, status: AssetStatus.READY } },
        },
      });
      const poplinConfig = poplinShirt?.assets3d[0]?.config as Record<string, unknown>;
      const poplinCompat = poplinConfig['outfitCompatibility'] as Record<string, unknown>;
      expect(poplinCompat['incompatibleSlots']).toEqual(['outerwear']);

      // 4. Verify 2 public presets, zero price keys in outfit_scenes.items, and compatibility pass
      const publicPresets = await prisma.outfitScene.findMany({
        where: { isPublicPreset: true },
        orderBy: { title: 'asc' },
      });
      expect(publicPresets).toHaveLength(2);
      expect(publicPresets.map((p) => p.title)).toEqual(['Linen Harian', 'Seragam Atelier']);

      for (const preset of publicPresets) {
        expect(preset.userId).toBeNull();
        expect(preset.mannequinRigVersion).toBe(OUTFIT_STUDIO_POLICY.RIG_ID);
        const items = preset.items as Array<Record<string, unknown>>;
        expect(items.length).toBeGreaterThanOrEqual(4);
        for (const item of items) {
          expect(Object.keys(item).sort()).toEqual([
            'assetId',
            'presetId',
            'productId',
            'slot',
            'variantId',
          ]);
        }

        const assets = await prisma.product3DAsset.findMany({
          where: { id: { in: items.map((i) => String(i['assetId'])) } },
        });
        const assetMap = new Map(assets.map((a) => [a.id, a]));
        const evalResult = evaluateOutfitCompatibility({
          rigId: preset.mannequinRigVersion,
          items: items.map((item) => {
            const asset = assetMap.get(String(item['assetId']));
            const cfg = (asset?.config ?? {}) as Record<string, unknown>;
            const compat = (cfg['outfitCompatibility'] ?? null) as never;
            return {
              requestedSlot: item['slot'] as never,
              productId: String(item['productId']),
              variantId: String(item['variantId']),
              assetId: String(item['assetId']),
              presetId: item['presetId'] ? String(item['presetId']) : null,
              available: true,
              variantMatchesProduct: true,
              presetMatchesAsset: true,
              compatibility: compat,
            };
          }),
        });
        expect(evalResult.valid).toBe(true);
      }

      // 5. Verify Phase 08 PostgreSQL CHECK constraints exist in pg_constraint
      const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname
        FROM pg_constraint
        WHERE conname IN (
          'chk_showroom_zone_code_format',
          'chk_showroom_zone_sort_nonneg',
          'chk_showroom_zone_scene_bytes',
          'chk_showroom_zone_lite_bytes',
          'chk_showroom_zone_camera_object',
          'chk_showroom_zone_portals_array',
          'chk_showroom_zone_published_at',
          'chk_showroom_hotspot_position',
          'chk_showroom_hotspot_sort_nonneg',
          'chk_outfit_items_shape',
          'chk_outfit_owner_or_public',
          'chk_outfit_rig_format',
          'chk_outfit_items_no_price'
        )
      `;
      expect(constraints).toHaveLength(13);

      // 6. Prove chk_outfit_items_no_price rejects raw SQL insert containing unitPriceIdr
      const fakeId = randomUUID();
      await expect(
        prisma.$executeRaw`
          INSERT INTO "outfit_scenes" ("id", "user_id", "title", "mannequin_rig_version", "items", "is_public_preset")
          VALUES (
            ${fakeId}::uuid,
            NULL,
            'Tampered Raw SQL Outfit',
            'arven_mannequin_unisex_v1',
            '[{"slot":"top","productId":"550e8400-e29b-41d4-a716-446655440000","variantId":"550e8400-e29b-41d4-a716-446655440001","assetId":"550e8400-e29b-41d4-a716-446655440002","presetId":null,"unitPriceIdr":1}]'::jsonb,
            true
          )
        `,
      ).rejects.toThrow(/chk_outfit_items_no_price/);

      // Prove chk_showroom_zone_scene_bytes rejects oversized byte declaration at DB level
      const fakeZoneId = randomUUID();
      await expect(
        prisma.$executeRaw`
          INSERT INTO "showroom_zones" ("id", "code", "title", "scene_object_key", "poster_key", "scene_bytes")
          VALUES (
            ${fakeZoneId}::uuid,
            'oversized-zone',
            'Oversized Zone',
            'showroom/oversized-zone/v0001/scene.glb',
            'showroom/oversized-zone/v0001/poster.svg',
            9999999
          )
        `,
      ).rejects.toThrow(/chk_showroom_zone_scene_bytes/);
    } finally {
      await prisma.$disconnect();
    }
  });
});
