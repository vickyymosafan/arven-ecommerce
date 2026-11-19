import { describe, expect, it } from 'vitest';
import {
  addOutfitToCartRequestSchema,
  createOutfitSceneRequestSchema,
  createPublicOutfitPresetRequestSchema,
  createShowroomHotspotRequestSchema,
  createShowroomZoneRequestSchema,
  outfitAnchorSchema,
  outfitCompatibilityConfigSchema,
  outfitCompatibilityReasonSchema,
  outfitRigIdParamSchema,
  outfitSlotSchema,
  outfitSlotSelectionSchema,
  setAssetOutfitCompatibilityRequestSchema,
  showroomCameraBaselineSchema,
  showroomPortalSchema,
  showroomZoneCodeParamSchema,
  showroomZoneStatusSchema,
  transitionShowroomZoneRequestSchema,
  updateOutfitSceneRequestSchema,
  updatePublicOutfitPresetRequestSchema,
  updateShowroomHotspotRequestSchema,
  updateShowroomZoneRequestSchema,
  validateOutfitRequestSchema,
} from '../src/index.js';

const UUID_1 = '550e8400-e29b-41d4-a716-446655440000';
const UUID_2 = '550e8400-e29b-41d4-a716-446655440001';
const UUID_3 = '550e8400-e29b-41d4-a716-446655440002';

describe('Phase 08 Virtual Showroom & Outfit Studio Validators', () => {
  it('validates canonical enum schemas and path parameter guards (T-06)', () => {
    expect(showroomZoneStatusSchema.options).toEqual(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
    expect(outfitSlotSchema.options).toEqual([
      'top',
      'bottom',
      'outerwear',
      'footwear',
      'accessory',
    ]);
    expect(outfitAnchorSchema.options).toEqual([
      'spine_upper',
      'pelvis',
      'feet',
      'shoulder_left',
      'shoulder_right',
      'wrist_left',
    ]);
    expect(outfitCompatibilityReasonSchema.options).toHaveLength(9);

    expect(showroomZoneCodeParamSchema.safeParse('atrium-entrance').success).toBe(true);
    expect(showroomZoneCodeParamSchema.safeParse('../secret').success).toBe(false);
    expect(showroomZoneCodeParamSchema.safeParse('Atrium_1').success).toBe(false);
    expect(showroomZoneCodeParamSchema.safeParse('a'.repeat(65)).success).toBe(false);

    expect(outfitRigIdParamSchema.safeParse('arven_mannequin_unisex_v1').success).toBe(true);
    expect(outfitRigIdParamSchema.safeParse('../arven_mannequin_unisex_v1').success).toBe(false);
    expect(outfitRigIdParamSchema.safeParse('custom_rig_v1').success).toBe(false);
  });

  it('rejects unknown and tampered price/owner keys via z.strictObject across outfit schemas (T-03)', () => {
    const validSelection = {
      slot: 'top' as const,
      productId: UUID_1,
      variantId: UUID_2,
      assetId: UUID_3,
      presetId: null,
    };

    expect(outfitSlotSelectionSchema.safeParse(validSelection).success).toBe(true);

    const priceKeys = [
      'price',
      'priceIdr',
      'unitPrice',
      'unitPriceIdr',
      'amount',
      'total',
      'discount',
    ] as const;

    for (const key of priceKeys) {
      expect(
        outfitSlotSelectionSchema.safeParse({
          ...validSelection,
          [key]: 1000,
        }).success,
      ).toBe(false);

      expect(
        validateOutfitRequestSchema.safeParse({
          rigId: 'arven_mannequin_unisex_v1',
          slots: [validSelection],
          [key]: 1000,
        }).success,
      ).toBe(false);

      expect(
        addOutfitToCartRequestSchema.safeParse({
          rigId: 'arven_mannequin_unisex_v1',
          slots: [{ slot: 'top', variantId: UUID_2, [key]: 1000 }],
        }).success,
      ).toBe(false);

      expect(
        createOutfitSceneRequestSchema.safeParse({
          title: 'Seragam Harian',
          rigId: 'arven_mannequin_unisex_v1',
          slots: [validSelection],
          [key]: 1000,
        }).success,
      ).toBe(false);

      expect(
        updateOutfitSceneRequestSchema.safeParse({
          title: 'Updated',
          [key]: 1000,
        }).success,
      ).toBe(false);
    }

    expect(
      createOutfitSceneRequestSchema.safeParse({
        title: 'Owner Tamper Attempt',
        rigId: 'arven_mannequin_unisex_v1',
        slots: [validSelection],
        userId: UUID_1,
      }).success,
    ).toBe(false);

    expect(
      createOutfitSceneRequestSchema.safeParse({
        title: 'Public Preset Escalation',
        rigId: 'arven_mannequin_unisex_v1',
        slots: [validSelection],
        isPublicPreset: true,
      }).success,
    ).toBe(false);

    expect(updateOutfitSceneRequestSchema.safeParse({}).success).toBe(false);
    expect(
      createOutfitSceneRequestSchema.safeParse({
        title: 'Empty Slots',
        rigId: 'arven_mannequin_unisex_v1',
        slots: [],
      }).success,
    ).toBe(false);
  });

  it('validates compatibility config, showroom zones, portals, camera baselines, hotspots, and public presets', () => {
    const compat = {
      rigId: 'arven_mannequin_unisex_v1',
      skeletonVersion: '1.0.0',
      slot: 'top' as const,
      anchor: 'spine_upper' as const,
      incompatibleSlots: ['outerwear' as const],
    };
    expect(outfitCompatibilityConfigSchema.safeParse(compat).success).toBe(true);
    expect(setAssetOutfitCompatibilityRequestSchema.safeParse(compat).success).toBe(true);
    expect(
      outfitCompatibilityConfigSchema.safeParse({ ...compat, extraField: true }).success,
    ).toBe(false);

    const camera = {
      fovDeg: 45,
      position: [0, 1.6, 5.2] as [number, number, number],
      target: [0, 1.1, 0] as [number, number, number],
      minDistance: 1.5,
      maxDistance: 10,
    };
    expect(showroomCameraBaselineSchema.safeParse(camera).success).toBe(true);
    expect(
      showroomCameraBaselineSchema.safeParse({ ...camera, minDistance: 12, maxDistance: 5 })
        .success,
    ).toBe(false);

    const portal = {
      targetZoneCode: 'tailoring-gallery',
      label: 'Galeri Tailoring',
      position: [3.2, 0, -2.5] as [number, number, number],
    };
    expect(showroomPortalSchema.safeParse(portal).success).toBe(true);

    expect(
      createShowroomZoneRequestSchema.safeParse({
        code: 'atrium-entrance',
        title: 'Atrium',
        description: 'Gallery entrance',
        sortOrder: 0,
        cameraBaseline: camera,
        portals: [portal],
      }).success,
    ).toBe(true);
    expect(
      createShowroomZoneRequestSchema.safeParse({
        code: 'atrium-entrance',
        title: 'Atrium',
        priceIdr: 500000,
      }).success,
    ).toBe(false);

    expect(updateShowroomZoneRequestSchema.safeParse({}).success).toBe(false);
    expect(
      transitionShowroomZoneRequestSchema.safeParse({ targetStatus: 'PUBLISHED' }).success,
    ).toBe(true);

    expect(
      createShowroomHotspotRequestSchema.safeParse({
        productId: UUID_1,
        variantId: UUID_2,
        label: 'Crew Tee',
        positionX: 1.5,
        positionY: 1.1,
        positionZ: -2.0,
      }).success,
    ).toBe(true);
    expect(
      createShowroomHotspotRequestSchema.safeParse({
        productId: UUID_1,
        label: 'Out of bounds',
        positionX: 55,
        positionY: 1.1,
        positionZ: 0,
      }).success,
    ).toBe(false);
    expect(
      createShowroomHotspotRequestSchema.safeParse({
        productId: UUID_1,
        label: 'Under floor',
        positionX: 0,
        positionY: -0.5,
        positionZ: 0,
      }).success,
    ).toBe(false);
    expect(updateShowroomHotspotRequestSchema.safeParse({}).success).toBe(false);

    expect(
      createPublicOutfitPresetRequestSchema.safeParse({
        title: 'Seragam Atelier',
        rigId: 'arven_mannequin_unisex_v1',
        slots: [{ slot: 'top', variantId: UUID_2 }],
      }).success,
    ).toBe(true);
    expect(updatePublicOutfitPresetRequestSchema.safeParse({}).success).toBe(false);
  });
});
