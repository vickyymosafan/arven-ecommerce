import { z } from 'zod';
import { colorHexSchema, mediaUrlSchema, slugParamSchema } from './catalog.js';
import { uuidSchema } from './common.js';

export const assetStatusSchema = z.enum([
  'UPLOADED',
  'PROCESSING',
  'READY',
  'FAILED',
  'ARCHIVED',
]);

export type AssetStatusInput = z.infer<typeof assetStatusSchema>;

export const assetFormatSchema = z.enum(['GLB', 'GLTF']);

export type AssetFormatInput = z.infer<typeof assetFormatSchema>;

export const assetValidationStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'PASSED',
  'FAILED',
]);

export type AssetValidationStatusInput = z.infer<
  typeof assetValidationStatusSchema
>;

export const lightingPresetSchema = z.enum([
  'arven_studio_neutral_v1',
  'arven_warm_editorial_v1',
]);

export type LightingPresetInput = z.infer<typeof lightingPresetSchema>;

export const garmentSilhouetteSchema = z.enum([
  'tee',
  'shirt',
  'trouser',
  'overshirt',
  'sneaker',
  'crossbody',
]);

export type GarmentSilhouetteInput = z.infer<typeof garmentSilhouetteSchema>;

export const materialSlotSpecSchema = z
  .strictObject({
    slotId: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_]+$/),
    meshNames: z.array(z.string().trim().min(1).max(120)).min(1).max(32),
    materialName: z.string().trim().min(1).max(120),
    customizable: z.boolean(),
    defaultBaseColorHex: colorHexSchema,
    roughnessRange: z
      .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
      .refine(([min, max]) => min <= max, {
        message: 'roughnessRange min must be <= max',
      }),
    metalnessRange: z
      .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
      .refine(([min, max]) => min <= max, {
        message: 'metalnessRange min must be <= max',
      }),
  })
  .strict();

export type MaterialSlotSpecInput = z.infer<typeof materialSlotSpecSchema>;

export const assetProvenanceSchema = z.strictObject({
  sourceType: z.enum([
    'in_house_cad',
    'commissioned_vendor',
    'licensed_stock',
  ]),
  modelAuthor: z.string().trim().min(1).max(160),
  modelLicense: z.string().trim().min(1).max(160),
  textureLicense: z.string().trim().min(1).max(160),
  hdriLicense: z.string().trim().min(1).max(160),
  commercialUseVerified: z.literal(true),
});

export type AssetProvenanceInput = z.infer<typeof assetProvenanceSchema>;

export const presign3DAssetRequestSchema = z.strictObject({
  variantId: uuidSchema.nullable().optional(),
  fileName: z.string().trim().min(1).max(255).default('model.glb'),
  contentType: z.literal('model/gltf-binary').default('model/gltf-binary'),
  bytes: z.number().int().min(20).max(15_728_640),
  posterUrl: mediaUrlSchema.optional(),
  silhouette: garmentSilhouetteSchema.optional(),
  lightingPreset: lightingPresetSchema.default('arven_studio_neutral_v1'),
  materialSlots: z.array(materialSlotSpecSchema).min(1).max(16).optional(),
  provenance: assetProvenanceSchema.optional(),
});

export type Presign3DAssetRequest = z.infer<typeof presign3DAssetRequestSchema>;

export const uploadStaging3DAssetRequestSchema = z.strictObject({
  glbBase64: z.string().min(16).max(22_000_000),
  liteGlbBase64: z.string().min(16).max(8_000_000).optional(),
});

export type UploadStaging3DAssetRequest = z.infer<
  typeof uploadStaging3DAssetRequestSchema
>;

export const confirm3DAssetRequestSchema = z.strictObject({
  glbBase64: z.string().min(16).max(22_000_000).optional(),
  liteGlbBase64: z.string().min(16).max(8_000_000).optional(),
});

export type Confirm3DAssetRequest = z.infer<typeof confirm3DAssetRequestSchema>;

export const publish3DAssetRequestSchema = z.strictObject({
  enableProduct3d: z.boolean().default(true),
});

export type Publish3DAssetRequest = z.infer<typeof publish3DAssetRequestSchema>;

export const materialOverrideEntrySchema = z.strictObject({
  baseColorHex: colorHexSchema,
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
});

export type MaterialOverrideEntryInput = z.infer<
  typeof materialOverrideEntrySchema
>;

export const createCustomizationPresetRequestSchema = z.strictObject({
  code: slugParamSchema,
  label: z.string().trim().min(2).max(120),
  swatchHex: colorHexSchema,
  materialOverrides: z
    .record(z.string().trim().min(1).max(64), materialOverrideEntrySchema)
    .refine(
      (obj) => Object.keys(obj).length > 0 && Object.keys(obj).length <= 16,
      'At least one material slot override is required (max 16)',
    ),
  variantId: uuidSchema.nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export type CreateCustomizationPresetRequest = z.infer<
  typeof createCustomizationPresetRequestSchema
>;

export const updateCustomizationPresetRequestSchema = z
  .strictObject({
    code: slugParamSchema.optional(),
    label: z.string().trim().min(2).max(120).optional(),
    swatchHex: colorHexSchema.optional(),
    materialOverrides: z
      .record(z.string().trim().min(1).max(64), materialOverrideEntrySchema)
      .refine(
        (obj) => Object.keys(obj).length > 0 && Object.keys(obj).length <= 16,
        'At least one material slot override is required (max 16)',
      )
      .optional(),
    variantId: uuidSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one customization preset field must be provided',
  });

export type UpdateCustomizationPresetRequest = z.infer<
  typeof updateCustomizationPresetRequestSchema
>;

export const record3DTelemetryRequestSchema = z.strictObject({
  eventType: z.enum([
    'viewer_opened',
    'preset_selected',
    'camera_preset',
    'fallback_triggered',
    'load_error',
    'context_lost',
  ]),
  productId: uuidSchema,
  assetId: uuidSchema.optional(),
  version: z.number().int().positive().optional(),
  deviceTier: z.enum(['default', 'lite']).optional(),
  presetCode: z.string().trim().max(64).optional(),
  cameraPreset: z.string().trim().max(64).optional(),
  errorCode: z.string().trim().max(120).optional(),
  durationMs: z.number().int().nonnegative().max(3_600_000).optional(),
});

export type Record3DTelemetryRequest = z.infer<
  typeof record3DTelemetryRequestSchema
>;

export const productIdOrSlugParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(150)
  .regex(
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[a-z0-9]+(?:-[a-z0-9]+)*)$/i,
    'Parameter must be a valid UUID or catalog slug',
  );
