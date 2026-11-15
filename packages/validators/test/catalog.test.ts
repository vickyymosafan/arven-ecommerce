import { describe, expect, it } from 'vitest';
import {
  adminProductsQuerySchema,
  createCategoryRequestSchema,
  createCollectionRequestSchema,
  createProductMediaRequestSchema,
  createProductRequestSchema,
  createProductVariantRequestSchema,
  isAllowedArvenColorHex,
  publicProductsQuerySchema,
  slugParamSchema,
  transitionProductStatusRequestSchema,
  updateProductRequestSchema,
  updateProductVariantRequestSchema,
} from '../src/index.js';

describe('@arven/validators Phase 03 Catalog schemas', () => {
  it('validates publicProductsQuerySchema filters, coercion, boolean flags, and price bounds', () => {
    const parsed = publicProductsQuerySchema.safeParse({
      page: '2',
      limit: '12',
      category: 'tops',
      collection: 'essentials',
      size: 'M',
      color: 'Charcoal',
      minPrice: '200000',
      maxPrice: '600000',
      inStock: 'true',
      featured: 'false',
      q: '  heavyweight tee  ',
      sort: 'price_asc',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.limit).toBe(12);
      expect(parsed.data.inStock).toBe(true);
      expect(parsed.data.featured).toBe(false);
      expect(parsed.data.q).toBe('heavyweight tee');
      expect(parsed.data.sort).toBe('price_asc');
    }

    const invertedPrices = publicProductsQuerySchema.safeParse({
      minPrice: 800000,
      maxPrice: 300000,
    });
    expect(invertedPrices.success).toBe(false);
  });

  it('validates slugParamSchema and rejects malformed slugs', () => {
    expect(slugParamSchema.safeParse('essentials-heavyweight-crew-tee').success).toBe(true);
    expect(slugParamSchema.safeParse('Uppercase-Slug').success).toBe(false);
    expect(slugParamSchema.safeParse('double--hyphen').success).toBe(false);
    expect(slugParamSchema.safeParse('-leading-hyphen').success).toBe(false);
  });

  it('enforces ARVEN color palette rules and rejects forbidden pink hexes on variants', () => {
    expect(isAllowedArvenColorHex('#17191B')).toBe(true);
    expect(isAllowedArvenColorHex('#F8F7F3')).toBe(true);
    expect(isAllowedArvenColorHex('#C5A572')).toBe(true);
    expect(isAllowedArvenColorHex('#FF69B4')).toBe(false);
    expect(isAllowedArvenColorHex('#EC4899')).toBe(false);

    const validVariant = createProductVariantRequestSchema.safeParse({
      sku: 'ARV-TOP-009-M-CHR',
      size: 'M',
      color: 'Charcoal',
      colorHex: '#17191B',
      priceIdr: 299000,
      compareAtPriceIdr: 349000,
      weightGrams: 320,
      initialStock: 10,
    });
    expect(validVariant.success).toBe(true);

    const pinkVariant = createProductVariantRequestSchema.safeParse({
      sku: 'ARV-TOP-009-M-PNK',
      size: 'M',
      color: 'Pink',
      colorHex: '#FF69B4',
      priceIdr: 299000,
      weightGrams: 320,
    });
    expect(pinkVariant.success).toBe(false);

    const lowerCompareAt = createProductVariantRequestSchema.safeParse({
      sku: 'ARV-TOP-009-M-CHR',
      size: 'M',
      color: 'Charcoal',
      priceIdr: 350000,
      compareAtPriceIdr: 299000,
      weightGrams: 320,
    });
    expect(lowerCompareAt.success).toBe(false);

    expect(updateProductVariantRequestSchema.safeParse({}).success).toBe(false);
  });

  it('validates product, media, category, collection, and status transition schemas', () => {
    const product = createProductRequestSchema.safeParse({
      name: 'Atelier Structured Coat',
      slug: 'atelier-structured-coat',
      description: 'Double-breasted virgin wool overcoat.',
      material: '100% Virgin Wool',
      fit: 'Relaxed Tailored Fit',
      careInstruction: 'Specialist dry clean only.',
    });
    expect(product.success).toBe(true);

    expect(updateProductRequestSchema.safeParse({}).success).toBe(false);

    const transition = transitionProductStatusRequestSchema.safeParse({
      targetStatus: 'READY_TO_PUBLISH',
      reason: 'All merchandising checks verified',
    });
    expect(transition.success).toBe(true);

    const media = createProductMediaRequestSchema.safeParse({
      type: 'IMAGE',
      url: 'data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E',
      altText: 'Front silhouette view',
      width: 900,
      height: 1200,
      position: 0,
      isPrimary: true,
    });
    expect(media.success).toBe(true);

    const badMediaUrl = createProductMediaRequestSchema.safeParse({
      type: 'IMAGE',
      url: 'javascript:alert(1)',
      altText: 'XSS payload',
    });
    expect(badMediaUrl.success).toBe(false);

    expect(
      createCategoryRequestSchema.safeParse({
        name: 'Knitwear',
        slug: 'knitwear',
        sortOrder: 6,
      }).success,
    ).toBe(true);

    expect(
      createCollectionRequestSchema.safeParse({
        name: 'Winter Archive',
        slug: 'winter-archive',
        status: 'DRAFT',
      }).success,
    ).toBe(true);

    expect(
      adminProductsQuerySchema.safeParse({
        page: '1',
        limit: '20',
        status: 'PUBLISHED',
      }).success,
    ).toBe(true);
  });
});
