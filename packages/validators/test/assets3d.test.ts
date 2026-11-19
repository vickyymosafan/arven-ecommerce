import { describe, expect, it } from 'vitest';
import {
  confirm3DAssetRequestSchema,
  createCustomizationPresetRequestSchema,
  presign3DAssetRequestSchema,
  productIdOrSlugParamSchema,
  publish3DAssetRequestSchema,
  record3DTelemetryRequestSchema,
  updateCustomizationPresetRequestSchema,
  uploadStaging3DAssetRequestSchema,
} from '../src/index.js';

describe('Phase 07 3D Assets & Presets Validators', () => {
  it('validates presign3DAssetRequestSchema with strict field enforcement and byte bounds', () => {
    const valid = presign3DAssetRequestSchema.safeParse({
      fileName: 'crew-tee.glb',
      contentType: 'model/gltf-binary',
      bytes: 2048,
      lightingPreset: 'arven_studio_neutral_v1',
      provenance: {
        sourceType: 'in_house_cad',
        modelAuthor: 'ARVEN Atelier 3D Team',
        modelLicense: 'ARVEN Proprietary Commercial Asset License v1.0',
        textureLicense: 'CC0-1.0',
        hdriLicense: 'CC0-1.0',
        commercialUseVerified: true,
      },
    });
    expect(valid.success).toBe(true);

    const oversized = presign3DAssetRequestSchema.safeParse({
      bytes: 16_000_000,
    });
    expect(oversized.success).toBe(false);

    const unknownField = presign3DAssetRequestSchema.safeParse({
      bytes: 2048,
      status: 'READY',
    });
    expect(unknownField.success).toBe(false);
  });

  it('rejects forbidden pink palette hex colors and unknown keys in customization presets', () => {
    const valid = createCustomizationPresetRequestSchema.safeParse({
      code: 'charcoal-matte',
      label: 'Charcoal Matte',
      swatchHex: '#17191B',
      materialOverrides: {
        mat_fabric_primary: {
          baseColorHex: '#17191B',
          roughness: 0.85,
          metalness: 0.02,
        },
      },
      sortOrder: 0,
    });
    expect(valid.success).toBe(true);

    const pinkSwatch = createCustomizationPresetRequestSchema.safeParse({
      code: 'magenta-edition',
      label: 'Magenta Edition',
      swatchHex: '#FF1493',
      materialOverrides: {
        mat_fabric_primary: { baseColorHex: '#17191B' },
      },
    });
    expect(pinkSwatch.success).toBe(false);

    const pinkOverride = createCustomizationPresetRequestSchema.safeParse({
      code: 'slate',
      label: 'Slate',
      swatchHex: '#35383A',
      materialOverrides: {
        mat_fabric_primary: { baseColorHex: '#FF69B4' },
      },
    });
    expect(pinkOverride.success).toBe(false);

    const emptyUpdate = updateCustomizationPresetRequestSchema.safeParse({});
    expect(emptyUpdate.success).toBe(false);
  });

  it('rejects PII/unknown keys on anonymized 3D telemetry payloads', () => {
    const valid = record3DTelemetryRequestSchema.safeParse({
      eventType: 'viewer_opened',
      productId: '550e8400-e29b-41d4-a716-446655440000',
      deviceTier: 'default',
      durationMs: 120,
    });
    expect(valid.success).toBe(true);

    const withEmail = record3DTelemetryRequestSchema.safeParse({
      eventType: 'viewer_opened',
      productId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'customer@example.com',
    });
    expect(withEmail.success).toBe(false);
  });

  it('validates upload-staging, confirm, publish, and product id-or-slug params', () => {
    expect(
      uploadStaging3DAssetRequestSchema.safeParse({
        glbBase64: 'Z2xURgIAAABAAAA=',
      }).success,
    ).toBe(true);
    expect(confirm3DAssetRequestSchema.safeParse({}).success).toBe(true);
    expect(publish3DAssetRequestSchema.safeParse({ enableProduct3d: true }).success).toBe(true);
    expect(
      productIdOrSlugParamSchema.safeParse('essentials-heavyweight-crew-tee').success,
    ).toBe(true);
    expect(
      productIdOrSlugParamSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success,
    ).toBe(true);
    expect(productIdOrSlugParamSchema.safeParse('../etc/passwd').success).toBe(false);
  });
});
