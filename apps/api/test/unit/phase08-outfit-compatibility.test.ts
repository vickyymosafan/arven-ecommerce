import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTFIT_STUDIO_POLICY, SHOWROOM_POLICY } from '@arven/config';
import {
  IncompatibleOutfitSlotError,
  ShowroomZoneEntity,
  assertValidShowroomZoneTransition,
  evaluateAssetCompatibilityDiagnostic,
  evaluateOutfitCompatibility,
  parseOutfitCompatibilityConfig,
} from '../../src/modules/experiences/index.js';
import {
  buildMannequinRigKeys,
  buildShowroomZoneKeys,
} from '../../src/modules/experiences/domain/value-objects/storage-keys.js';

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const VALID_TOP_COMPAT = {
  rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
  skeletonVersion: OUTFIT_STUDIO_POLICY.SKELETON_VERSION,
  slot: 'top' as const,
  anchor: 'spine_upper' as const,
  incompatibleSlots: [] as ('top' | 'bottom' | 'outerwear' | 'footwear' | 'accessory')[],
};

const VALID_POPLIN_COMPAT = {
  rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
  skeletonVersion: OUTFIT_STUDIO_POLICY.SKELETON_VERSION,
  slot: 'top' as const,
  anchor: 'spine_upper' as const,
  incompatibleSlots: ['outerwear' as const],
};

const VALID_OVERSHIRT_COMPAT = {
  rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
  skeletonVersion: OUTFIT_STUDIO_POLICY.SKELETON_VERSION,
  slot: 'outerwear' as const,
  anchor: 'spine_upper' as const,
  incompatibleSlots: [] as ('top' | 'bottom' | 'outerwear' | 'footwear' | 'accessory')[],
};

const VALID_TROUSER_COMPAT = {
  rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
  skeletonVersion: OUTFIT_STUDIO_POLICY.SKELETON_VERSION,
  slot: 'bottom' as const,
  anchor: 'pelvis' as const,
  incompatibleSlots: [] as ('top' | 'bottom' | 'outerwear' | 'footwear' | 'accessory')[],
};

describe('Phase 08 Experiences Domain — Outfit Compatibility & Showroom State Machine', () => {
  it('keeps experiences/domain strictly pure TypeScript with zero NestJS/Prisma/Express imports', () => {
    const domainDir = resolve(
      import.meta.dirname,
      '../../src/modules/experiences/domain',
    );
    const files = collectTsFiles(domainDir);
    expect(files.length).toBeGreaterThanOrEqual(5);

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf8');
      expect(content).not.toMatch(/from\s+['"]@nestjs\//);
      expect(content).not.toMatch(/from\s+['"]@prisma\//);
      expect(content).not.toMatch(/from\s+['"]@arven\/database['"]/);
      expect(content).not.toMatch(/from\s+['"]express['"]/);
    }
  });

  it('passes valid multi-slot outfit combinations cleanly', () => {
    const result = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-tee',
          variantId: 'var-tee',
          assetId: 'asset-tee',
          compatibility: VALID_TOP_COMPAT,
        },
        {
          requestedSlot: 'outerwear',
          productId: 'prod-overshirt',
          variantId: 'var-overshirt',
          assetId: 'asset-overshirt',
          compatibility: VALID_OVERSHIRT_COMPAT,
        },
        {
          requestedSlot: 'bottom',
          productId: 'prod-trouser',
          variantId: 'var-trouser',
          assetId: 'asset-trouser',
          compatibility: VALID_TROUSER_COMPAT,
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('covers all 9 OutfitCompatibilityReason codes accurately', () => {
    // 1. RIG_MISMATCH (top-level rigId & garment-level rigId)
    const rigMismatch = evaluateOutfitCompatibility({
      rigId: 'arven_mannequin_wrong_v2',
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-1',
          compatibility: VALID_TOP_COMPAT,
        },
      ],
    });
    expect(rigMismatch.valid).toBe(false);
    expect(rigMismatch.violations.some((v) => v.reason === 'RIG_MISMATCH')).toBe(true);

    const garmentRigMismatch = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-rig-2',
          compatibility: {
            ...VALID_TOP_COMPAT,
            rigId: 'arven_mannequin_other_v1',
          },
        },
      ],
    });
    expect(garmentRigMismatch.violations[0]?.reason).toBe('RIG_MISMATCH');

    // 2. SKELETON_VERSION_MISMATCH
    const versionMismatch = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'outerwear',
          productId: 'prod-field-jacket',
          compatibility: {
            ...VALID_OVERSHIRT_COMPAT,
            skeletonVersion: '0.9.0',
          },
        },
      ],
    });
    expect(versionMismatch.valid).toBe(false);
    expect(versionMismatch.violations[0]).toMatchObject({
      slot: 'outerwear',
      productId: 'prod-field-jacket',
      reason: 'SKELETON_VERSION_MISMATCH',
    });

    // 3. SLOT_MISMATCH (e.g. crossbody placed in top slot)
    const slotMismatch = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-crossbody',
          compatibility: {
            rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
            skeletonVersion: '1.0.0',
            slot: 'accessory',
            anchor: 'shoulder_left',
            incompatibleSlots: [],
          },
        },
      ],
    });
    expect(slotMismatch.violations[0]).toMatchObject({
      slot: 'top',
      productId: 'prod-crossbody',
      reason: 'SLOT_MISMATCH',
    });

    // 4. ANCHOR_INVALID
    const anchorInvalid = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'bottom',
          productId: 'prod-trouser',
          compatibility: {
            rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
            skeletonVersion: '1.0.0',
            slot: 'bottom',
            anchor: 'spine_upper',
            incompatibleSlots: [],
          },
        },
      ],
    });
    expect(anchorInvalid.violations[0]).toMatchObject({
      slot: 'bottom',
      productId: 'prod-trouser',
      reason: 'ANCHOR_INVALID',
    });

    // 5. DUPLICATE_SLOT
    const duplicateSlot = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-tee',
          compatibility: VALID_TOP_COMPAT,
        },
        {
          requestedSlot: 'top',
          productId: 'prod-shirt',
          compatibility: VALID_TOP_COMPAT,
        },
      ],
    });
    expect(duplicateSlot.violations[0]).toMatchObject({
      slot: 'top',
      productId: 'prod-shirt',
      reason: 'DUPLICATE_SLOT',
    });

    // 6. GARMENT_UNAVAILABLE (unavailable product or missing compatibility config)
    const unavailableFlag = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-draft',
          available: false,
          compatibility: VALID_TOP_COMPAT,
        },
      ],
    });
    expect(unavailableFlag.violations[0]?.reason).toBe('GARMENT_UNAVAILABLE');

    const missingCompat = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-nocompat',
          compatibility: null,
        },
      ],
    });
    expect(missingCompat.violations[0]?.reason).toBe('GARMENT_UNAVAILABLE');

    // 7. VARIANT_PRODUCT_MISMATCH
    const variantMismatch = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-tee',
          variantMatchesProduct: false,
          compatibility: VALID_TOP_COMPAT,
        },
      ],
    });
    expect(variantMismatch.violations[0]?.reason).toBe('VARIANT_PRODUCT_MISMATCH');

    // 8. PRESET_ASSET_MISMATCH
    const presetMismatch = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-tee',
          presetId: 'preset-other-asset',
          presetMatchesAsset: false,
          compatibility: VALID_TOP_COMPAT,
        },
      ],
    });
    expect(presetMismatch.violations[0]?.reason).toBe('PRESET_ASSET_MISMATCH');
  });

  it('9. detects LAYER_CONFLICT symmetrically regardless of slot ordering', () => {
    const orderAB = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-poplin-shirt',
          compatibility: VALID_POPLIN_COMPAT,
        },
        {
          requestedSlot: 'outerwear',
          productId: 'prod-overshirt',
          compatibility: VALID_OVERSHIRT_COMPAT,
        },
      ],
    });

    const orderBA = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      items: [
        {
          requestedSlot: 'outerwear',
          productId: 'prod-overshirt',
          compatibility: VALID_OVERSHIRT_COMPAT,
        },
        {
          requestedSlot: 'top',
          productId: 'prod-poplin-shirt',
          compatibility: VALID_POPLIN_COMPAT,
        },
      ],
    });

    expect(orderAB.valid).toBe(false);
    expect(orderBA.valid).toBe(false);
    expect(orderAB.violations).toHaveLength(1);
    expect(orderBA.violations).toHaveLength(1);
    expect(orderAB.violations[0]).toMatchObject({
      slot: 'top',
      productId: 'prod-poplin-shirt',
      reason: 'LAYER_CONFLICT',
    });
    expect(orderBA.violations[0]).toMatchObject({
      slot: 'top',
      productId: 'prod-poplin-shirt',
      reason: 'LAYER_CONFLICT',
    });
  });

  it('formats IncompatibleOutfitSlotError ApiErrorDetail entries deterministically', () => {
    const err = new IncompatibleOutfitSlotError([
      {
        slot: 'rig',
        productId: null,
        reason: 'RIG_MISMATCH',
        message: 'Wrong rig',
      },
      {
        slot: 'outerwear',
        productId: 'prod-fj',
        reason: 'SKELETON_VERSION_MISMATCH',
        message: 'Legacy 0.9.0 skeleton',
      },
    ]);

    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('INCOMPATIBLE_OUTFIT_SLOT');
    expect(err.details).toEqual([
      {
        field: 'rigId',
        issue: 'RIG_MISMATCH|productId=none|Wrong rig',
      },
      {
        field: 'slots.outerwear',
        issue: 'SKELETON_VERSION_MISMATCH|productId=prod-fj|Legacy 0.9.0 skeleton',
      },
    ]);
  });

  it('parses and diagnoses asset compatibility metadata cleanly', () => {
    expect(parseOutfitCompatibilityConfig(null)).toBeNull();
    expect(parseOutfitCompatibilityConfig({ outfitCompatibility: null })).toBeNull();

    const parsed = parseOutfitCompatibilityConfig({
      outfitCompatibility: {
        rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
        skeletonVersion: '0.9.0',
        slot: 'outerwear',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      },
    });
    expect(parsed).not.toBeNull();
    const diag = evaluateAssetCompatibilityDiagnostic(parsed);
    expect(diag.compatible).toBe(false);
    expect(diag.diagnosticMessage).toContain('0.9.0');
  });

  it('enforces ShowroomZoneEntity transitions and publish byte gates', () => {
    const validSnap = {
      status: 'DRAFT' as const,
      sceneBytes: 1024,
      liteSceneBytes: 512,
      posterKey: 'showroom/atrium-entrance/v0001/poster.svg',
      publishedAt: null,
    };

    const published = assertValidShowroomZoneTransition(
      validSnap,
      'PUBLISHED',
      new Date('2026-11-19T00:00:00.000Z'),
    );
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt?.toISOString()).toBe('2026-11-19T00:00:00.000Z');

    const archived = assertValidShowroomZoneTransition(
      { ...validSnap, status: 'PUBLISHED', publishedAt: published.publishedAt },
      'ARCHIVED',
    );
    expect(archived.status).toBe('ARCHIVED');

    const backToDraft = assertValidShowroomZoneTransition(
      { ...validSnap, status: 'ARCHIVED', publishedAt: published.publishedAt },
      'DRAFT',
    );
    expect(backToDraft.status).toBe('DRAFT');

    expect(() =>
      new ShowroomZoneEntity(validSnap).transitionTo('ARCHIVED'),
    ).toThrow(/cannot transition/i);
    expect(() =>
      new ShowroomZoneEntity({ ...validSnap, status: 'PUBLISHED' }).transitionTo('DRAFT'),
    ).toThrow(/cannot transition/i);
    expect(() =>
      new ShowroomZoneEntity({
        ...validSnap,
        sceneBytes: SHOWROOM_POLICY.MAX_ZONE_BYTES + 1,
      }).transitionTo('PUBLISHED'),
    ).toThrow(/violates allowed showroom size cap/i);
  });

  it('builds deterministic storage keys and rejects invalid codes or unknown rigs', () => {
    expect(buildShowroomZoneKeys('atrium-entrance', 1)).toEqual({
      sceneObjectKey: 'showroom/atrium-entrance/v0001/scene.glb',
      liteSceneObjectKey: 'showroom/atrium-entrance/v0001/scene-lite.glb',
      posterKey: 'showroom/atrium-entrance/v0001/poster.svg',
    });
    expect(() => buildShowroomZoneKeys('../secret', 1)).toThrow();
    expect(() => buildShowroomZoneKeys('Bad_Code', 1)).toThrow();

    expect(buildMannequinRigKeys(OUTFIT_STUDIO_POLICY.RIG_ID)).toEqual({
      modelKey: 'rigs/arven_mannequin_unisex_v1/v0001/mannequin.glb',
      liteModelKey: 'rigs/arven_mannequin_unisex_v1/v0001/mannequin-lite.glb',
      posterKey: 'rigs/arven_mannequin_unisex_v1/v0001/poster.svg',
    });
    expect(() => buildMannequinRigKeys('arven_mannequin_unknown')).toThrow();
  });
});
