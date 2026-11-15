import { z } from 'zod';
import { idrIntegerSchema, paginationQuerySchema, uuidSchema } from './common.js';

const FORBIDDEN_PINK_HEX_SET: ReadonlySet<string> = new Set([
  '#ff00ff',
  '#ff69b4',
  '#ffc0cb',
  '#ffb6c1',
  '#ff1493',
  '#db7093',
  '#c71585',
  '#ec4899',
  '#f472b6',
  '#f9a8d4',
  '#fbcfe8',
  '#fdf2f8',
  '#be185d',
  '#9d174d',
  '#831843',
]);

export function isAllowedArvenColorHex(hex: string): boolean {
  const normalized = hex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    return false;
  }
  if (FORBIDDEN_PINK_HEX_SET.has(normalized)) {
    return false;
  }
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  // Reject saturated magenta/pink hues where red & blue strongly dominate green
  if (r > 200 && b > 140 && g < 130 && r - g > 80 && b - g > 40) {
    return false;
  }
  return true;
}

const queryBooleanSchema = z
  .union([
    z.boolean(),
    z
      .enum(['true', 'false', '1', '0'])
      .transform((val) => val === 'true' || val === '1'),
  ])
  .optional();

export const slugParamSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(150, 'Slug must be at most 150 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must contain only lowercase alphanumeric characters and single hyphens',
  );

export const productSortSchema = z.enum([
  'newest',
  'price_asc',
  'price_desc',
  'featured',
]);

export type ProductSort = z.infer<typeof productSortSchema>;

export const productStatusSchema = z.enum([
  'DRAFT',
  'REVIEW',
  'READY_TO_PUBLISH',
  'PUBLISHED',
  'ARCHIVED',
]);

export type ProductStatusInput = z.infer<typeof productStatusSchema>;

export const collectionStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
]);

export type CollectionStatusInput = z.infer<typeof collectionStatusSchema>;

export const mediaTypeSchema = z.enum([
  'IMAGE',
  'SWATCH',
  'POSTER',
  'POSTER_3D',
  'VIDEO',
  'VIDEO_PREVIEW',
]);

export type MediaTypeInput = z.infer<typeof mediaTypeSchema>;

export const stockStatusSchema = z.enum([
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
]);

export type StockStatus = z.infer<typeof stockStatusSchema>;

export const publicProductsQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(12),
    category: z.string().trim().min(1).max(150).optional(),
    collection: z.string().trim().min(1).max(150).optional(),
    size: z.string().trim().min(1).max(32).optional(),
    color: z.string().trim().min(1).max(64).optional(),
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().nonnegative().optional(),
    inStock: queryBooleanSchema,
    featured: queryBooleanSchema,
    q: z.string().trim().min(1).max(120).optional(),
    sort: productSortSchema.default('newest'),
  })
  .refine(
    (q) =>
      q.minPrice === undefined ||
      q.maxPrice === undefined ||
      q.maxPrice >= q.minPrice,
    {
      message: 'maxPrice must be greater than or equal to minPrice',
      path: ['maxPrice'],
    },
  );

export type PublicProductsQuery = z.infer<typeof publicProductsQuerySchema>;

export const adminProductsQuerySchema = paginationQuerySchema.extend({
  status: productStatusSchema.optional(),
  category: z.string().trim().min(1).max(150).optional(),
  collection: z.string().trim().min(1).max(150).optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export type AdminProductsQuery = z.infer<typeof adminProductsQuerySchema>;

export const colorHexSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'colorHex must be a 6-digit hex color (#RRGGBB)')
  .refine(
    (hex) => isAllowedArvenColorHex(hex),
    'Pink palette hex colors are forbidden by the ARVEN design contract',
  );

export const skuSchema = z
  .string()
  .trim()
  .min(2, 'SKU must be at least 2 characters')
  .max(64, 'SKU must be at most 64 characters')
  .regex(
    /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
    'SKU must contain only uppercase letters, digits, and hyphens',
  );

export const mediaUrlSchema = z
  .string()
  .trim()
  .min(1, 'Media URL is required')
  .max(65535, 'Media URL is too long')
  .refine(
    (val) =>
      val.startsWith('/') ||
      val.startsWith('https://') ||
      val.startsWith('http://localhost') ||
      val.startsWith('http://127.0.0.1') ||
      val.startsWith('data:image/svg+xml;utf8,'),
    'Media URL must be a valid relative path, HTTPS URL, or SVG data URI',
  );

export const createProductRequestSchema = z.strictObject({
  name: z.string().trim().min(2).max(220),
  slug: slugParamSchema,
  description: z.string().trim().max(5000).default(''),
  material: z.string().trim().max(1000).default(''),
  fit: z.string().trim().max(120).default(''),
  careInstruction: z.string().trim().max(2000).default(''),
  seoTitle: z.string().trim().max(160).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
  isVisible: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  has3dEnabled: z.boolean().default(false),
  sizeGuideOverride: z.record(z.string(), z.unknown()).nullable().optional(),
  categoryIds: z.array(uuidSchema).max(20).default([]),
  primaryCategoryId: uuidSchema.nullable().optional(),
  collectionIds: z.array(uuidSchema).max(20).default([]),
});

export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(220).optional(),
    slug: slugParamSchema.optional(),
    description: z.string().trim().max(5000).optional(),
    material: z.string().trim().max(1000).optional(),
    fit: z.string().trim().max(120).optional(),
    careInstruction: z.string().trim().max(2000).optional(),
    seoTitle: z.string().trim().max(160).nullable().optional(),
    seoDescription: z.string().trim().max(320).nullable().optional(),
    isVisible: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    has3dEnabled: z.boolean().optional(),
    sizeGuideOverride: z.record(z.string(), z.unknown()).nullable().optional(),
    categoryIds: z.array(uuidSchema).max(20).optional(),
    primaryCategoryId: uuidSchema.nullable().optional(),
    collectionIds: z.array(uuidSchema).max(20).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one product field must be provided',
  });

export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

export const transitionProductStatusRequestSchema = z.strictObject({
  targetStatus: productStatusSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

export type TransitionProductStatusRequest = z.infer<
  typeof transitionProductStatusRequestSchema
>;

export const createProductVariantRequestSchema = z
  .strictObject({
    sku: skuSchema,
    barcode: z.string().trim().min(1).max(64).nullable().optional(),
    size: z.string().trim().min(1).max(32),
    color: z.string().trim().min(1).max(64),
    colorHex: colorHexSchema.nullable().optional(),
    priceIdr: idrIntegerSchema,
    compareAtPriceIdr: idrIntegerSchema.nullable().optional(),
    weightGrams: z.number().int().positive().max(100_000),
    dimensionsJson: z.record(z.string(), z.unknown()).nullable().optional(),
    isActive: z.boolean().default(true),
    initialStock: z.number().int().nonnegative().max(1_000_000).default(0),
    lowStockThreshold: z.number().int().nonnegative().max(10_000).optional(),
  })
  .refine(
    (v) =>
      v.compareAtPriceIdr === undefined ||
      v.compareAtPriceIdr === null ||
      v.compareAtPriceIdr >= v.priceIdr,
    {
      message: 'compareAtPriceIdr must be greater than or equal to priceIdr',
      path: ['compareAtPriceIdr'],
    },
  );

export type CreateProductVariantRequest = z.infer<
  typeof createProductVariantRequestSchema
>;

export const updateProductVariantRequestSchema = z
  .strictObject({
    sku: skuSchema.optional(),
    barcode: z.string().trim().min(1).max(64).nullable().optional(),
    size: z.string().trim().min(1).max(32).optional(),
    color: z.string().trim().min(1).max(64).optional(),
    colorHex: colorHexSchema.nullable().optional(),
    priceIdr: idrIntegerSchema.optional(),
    compareAtPriceIdr: idrIntegerSchema.nullable().optional(),
    weightGrams: z.number().int().positive().max(100_000).optional(),
    dimensionsJson: z.record(z.string(), z.unknown()).nullable().optional(),
    isActive: z.boolean().optional(),
    lowStockThreshold: z.number().int().nonnegative().max(10_000).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one variant field must be provided',
  });

export type UpdateProductVariantRequest = z.infer<
  typeof updateProductVariantRequestSchema
>;

export const createProductMediaRequestSchema = z.strictObject({
  variantId: uuidSchema.nullable().optional(),
  type: mediaTypeSchema.default('IMAGE'),
  url: mediaUrlSchema,
  altText: z.string().trim().min(1).max(255),
  width: z.number().int().positive().max(10_000).nullable().optional(),
  height: z.number().int().positive().max(10_000).nullable().optional(),
  position: z.number().int().nonnegative().max(1000).default(0),
  isPrimary: z.boolean().default(false),
});

export type CreateProductMediaRequest = z.infer<
  typeof createProductMediaRequestSchema
>;

export const updateProductMediaRequestSchema = z
  .strictObject({
    variantId: uuidSchema.nullable().optional(),
    type: mediaTypeSchema.optional(),
    url: mediaUrlSchema.optional(),
    altText: z.string().trim().min(1).max(255).optional(),
    width: z.number().int().positive().max(10_000).nullable().optional(),
    height: z.number().int().positive().max(10_000).nullable().optional(),
    position: z.number().int().nonnegative().max(1000).optional(),
    isPrimary: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one media field must be provided',
  });

export type UpdateProductMediaRequest = z.infer<
  typeof updateProductMediaRequestSchema
>;

export const createCategoryRequestSchema = z.strictObject({
  name: z.string().trim().min(2).max(140),
  slug: slugParamSchema,
  description: z.string().trim().max(2000).nullable().optional(),
  parentId: uuidSchema.nullable().optional(),
  sortOrder: z.number().int().nonnegative().max(10_000).default(0),
  isActive: z.boolean().default(true),
  sizeGuideJson: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(140).optional(),
    slug: slugParamSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    parentId: uuidSchema.nullable().optional(),
    sortOrder: z.number().int().nonnegative().max(10_000).optional(),
    isActive: z.boolean().optional(),
    sizeGuideJson: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one category field must be provided',
  });

export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

export const createCollectionRequestSchema = z.strictObject({
  name: z.string().trim().min(2).max(160),
  slug: slugParamSchema,
  description: z.string().trim().max(2000).nullable().optional(),
  bannerUrl: mediaUrlSchema.nullable().optional(),
  status: collectionStatusSchema.default('DRAFT'),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  productIds: z.array(uuidSchema).max(500).optional(),
});

export type CreateCollectionRequest = z.infer<
  typeof createCollectionRequestSchema
>;

export const updateCollectionRequestSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(160).optional(),
    slug: slugParamSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    bannerUrl: mediaUrlSchema.nullable().optional(),
    status: collectionStatusSchema.optional(),
    startsAt: z.iso.datetime().nullable().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    productIds: z.array(uuidSchema).max(500).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one collection field must be provided',
  });

export type UpdateCollectionRequest = z.infer<
  typeof updateCollectionRequestSchema
>;
