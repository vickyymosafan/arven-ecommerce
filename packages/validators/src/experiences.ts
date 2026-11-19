import { z } from 'zod';
import { lightingPresetSchema } from './assets3d.js';
import { uuidSchema } from './common.js';

export const showroomZoneStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export type ShowroomZoneStatusInput = z.infer<typeof showroomZoneStatusSchema>;

export const outfitSlotSchema = z.enum([
  'top',
  'bottom',
  'outerwear',
  'footwear',
  'accessory',
]);
export type OutfitSlotInput = z.infer<typeof outfitSlotSchema>;

export const outfitAnchorSchema = z.enum([
  'spine_upper',
  'pelvis',
  'feet',
  'shoulder_left',
  'shoulder_right',
  'wrist_left',
]);
export type OutfitAnchorInput = z.infer<typeof outfitAnchorSchema>;

export const outfitCompatibilityReasonSchema = z.enum([
  'RIG_MISMATCH',
  'SKELETON_VERSION_MISMATCH',
  'SLOT_MISMATCH',
  'ANCHOR_INVALID',
  'LAYER_CONFLICT',
  'DUPLICATE_SLOT',
  'GARMENT_UNAVAILABLE',
  'VARIANT_PRODUCT_MISMATCH',
  'PRESET_ASSET_MISMATCH',
]);
export type OutfitCompatibilityReason = z.infer<
  typeof outfitCompatibilityReasonSchema
>;

export const outfitCompatibilityConfigSchema = z.strictObject({
  rigId: z.string().trim().min(1).max(64),
  skeletonVersion: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, 'skeletonVersion must be semantic version x.y.z'),
  slot: outfitSlotSchema,
  anchor: outfitAnchorSchema,
  incompatibleSlots: z.array(outfitSlotSchema).max(5).default([]),
});
export type OutfitCompatibilityConfigInput = z.infer<
  typeof outfitCompatibilityConfigSchema
>;

export const showroomZoneCodeParamSchema = z
  .string()
  .trim()
  .min(1, 'Zone code is required')
  .max(64, 'Zone code must be at most 64 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Zone code must contain only lowercase alphanumeric characters and single hyphens',
  );

export const outfitRigIdParamSchema = z
  .string()
  .trim()
  .min(1, 'Rig ID is required')
  .max(64, 'Rig ID must be at most 64 characters')
  .regex(
    /^arven_mannequin_[a-z0-9_]+$/,
    'Rig ID must match arven_mannequin_<name> format',
  );

export const outfitSlotSelectionSchema = z.strictObject({
  slot: outfitSlotSchema,
  productId: uuidSchema.optional(),
  variantId: uuidSchema,
  assetId: uuidSchema.optional(),
  presetId: uuidSchema.nullable().optional(),
});
export type OutfitSlotSelectionInput = z.infer<typeof outfitSlotSelectionSchema>;

export const validateOutfitRequestSchema = z.strictObject({
  rigId: outfitRigIdParamSchema,
  slots: z.array(outfitSlotSelectionSchema).min(1).max(5),
});
export type ValidateOutfitRequest = z.infer<typeof validateOutfitRequestSchema>;

export const addOutfitCartSlotSchema = z.strictObject({
  slot: outfitSlotSchema,
  variantId: uuidSchema,
  presetId: uuidSchema.nullable().optional(),
});
export type AddOutfitCartSlotInput = z.infer<typeof addOutfitCartSlotSchema>;

export const addOutfitToCartRequestSchema = z.strictObject({
  rigId: outfitRigIdParamSchema,
  slots: z.array(addOutfitCartSlotSchema).min(1).max(5),
});
export type AddOutfitToCartRequest = z.infer<
  typeof addOutfitToCartRequestSchema
>;

export const createOutfitSceneRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  rigId: outfitRigIdParamSchema,
  slots: z.array(outfitSlotSelectionSchema).min(1).max(5),
});
export type CreateOutfitSceneRequest = z.infer<
  typeof createOutfitSceneRequestSchema
>;

export const updateOutfitSceneRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160).optional(),
    rigId: outfitRigIdParamSchema.optional(),
    slots: z.array(outfitSlotSelectionSchema).min(1).max(5).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one outfit scene field must be provided',
  });
export type UpdateOutfitSceneRequest = z.infer<
  typeof updateOutfitSceneRequestSchema
>;

export const showroomVector3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export type ShowroomVector3Input = z.infer<typeof showroomVector3Schema>;

export const showroomCameraBaselineSchema = z
  .strictObject({
    fovDeg: z.number().finite().min(20).max(75).default(45),
    position: showroomVector3Schema,
    target: showroomVector3Schema,
    minDistance: z.number().finite().positive().max(25).default(1.2),
    maxDistance: z.number().finite().positive().max(40).default(12),
  })
  .refine((cfg) => cfg.minDistance <= cfg.maxDistance, {
    message: 'minDistance must be <= maxDistance',
    path: ['minDistance'],
  });
export type ShowroomCameraBaselineInput = z.infer<
  typeof showroomCameraBaselineSchema
>;

export const showroomPortalSchema = z.strictObject({
  targetZoneCode: showroomZoneCodeParamSchema,
  label: z.string().trim().min(1).max(120),
  position: showroomVector3Schema,
});
export type ShowroomPortalInput = z.infer<typeof showroomPortalSchema>;

export const createShowroomZoneRequestSchema = z.strictObject({
  code: showroomZoneCodeParamSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  lightingPreset: lightingPresetSchema.default('arven_studio_neutral_v1'),
  cameraBaseline: showroomCameraBaselineSchema.optional(),
  portals: z.array(showroomPortalSchema).max(8).default([]),
});
export type CreateShowroomZoneRequest = z.infer<
  typeof createShowroomZoneRequestSchema
>;

export const updateShowroomZoneRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    lightingPreset: lightingPresetSchema.optional(),
    cameraBaseline: showroomCameraBaselineSchema.optional(),
    portals: z.array(showroomPortalSchema).max(8).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one showroom zone field must be provided',
  });
export type UpdateShowroomZoneRequest = z.infer<
  typeof updateShowroomZoneRequestSchema
>;

export const transitionShowroomZoneRequestSchema = z.strictObject({
  targetStatus: showroomZoneStatusSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});
export type TransitionShowroomZoneRequest = z.infer<
  typeof transitionShowroomZoneRequestSchema
>;

export const createShowroomHotspotRequestSchema = z.strictObject({
  productId: uuidSchema,
  variantId: uuidSchema.nullable().optional(),
  label: z.string().trim().min(1).max(120),
  positionX: z.number().finite().min(-50).max(50),
  positionY: z.number().finite().min(0).max(10),
  positionZ: z.number().finite().min(-50).max(50),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});
export type CreateShowroomHotspotRequest = z.infer<
  typeof createShowroomHotspotRequestSchema
>;

export const updateShowroomHotspotRequestSchema = z
  .strictObject({
    variantId: uuidSchema.nullable().optional(),
    label: z.string().trim().min(1).max(120).optional(),
    positionX: z.number().finite().min(-50).max(50).optional(),
    positionY: z.number().finite().min(0).max(10).optional(),
    positionZ: z.number().finite().min(-50).max(50).optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one showroom hotspot field must be provided',
  });
export type UpdateShowroomHotspotRequest = z.infer<
  typeof updateShowroomHotspotRequestSchema
>;

export const setAssetOutfitCompatibilityRequestSchema =
  outfitCompatibilityConfigSchema;
export type SetAssetOutfitCompatibilityRequest = z.infer<
  typeof setAssetOutfitCompatibilityRequestSchema
>;

export const createPublicOutfitPresetRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  rigId: outfitRigIdParamSchema,
  slots: z.array(outfitSlotSelectionSchema).min(1).max(5),
});
export type CreatePublicOutfitPresetRequest = z.infer<
  typeof createPublicOutfitPresetRequestSchema
>;

export const updatePublicOutfitPresetRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160).optional(),
    rigId: outfitRigIdParamSchema.optional(),
    slots: z.array(outfitSlotSelectionSchema).min(1).max(5).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one public outfit preset field must be provided',
  });
export type UpdatePublicOutfitPresetRequest = z.infer<
  typeof updatePublicOutfitPresetRequestSchema
>;
