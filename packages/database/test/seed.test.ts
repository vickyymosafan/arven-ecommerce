import { describe, expect, it } from 'vitest';
import {
  ARVEN_SEED_CATEGORIES,
  ARVEN_SEED_COLLECTIONS,
  ARVEN_SEED_COUPONS,
  ARVEN_SEED_PRODUCTS,
  CouponStatus,
  DiscountType,
  MediaType,
} from '../src/index.js';

const FORBIDDEN_PINK_HEXES = ['#ff00ff', '#ff69b4', '#ffc0cb', '#ff1493', '#db7093', '#ec4899', '#f472b6'];

describe('Phase 03 Enriched Catalog Seed invariants', () => {
  it('configures sizeGuideJson and descriptions on all 5 categories', () => {
    expect(ARVEN_SEED_CATEGORIES).toHaveLength(5);
    for (const cat of ARVEN_SEED_CATEGORIES) {
      expect(cat.description.length).toBeGreaterThan(10);
      expect(cat.sizeGuideJson.unit).toBe('cm');
      expect(cat.sizeGuideJson.columns.length).toBeGreaterThanOrEqual(3);
      expect(cat.sizeGuideJson.rows.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('configures startsAt and deterministic SVG data URI bannerUrl on all 4 collections with zero pink', () => {
    expect(ARVEN_SEED_COLLECTIONS).toHaveLength(4);
    for (const col of ARVEN_SEED_COLLECTIONS) {
      expect(new Date(col.startsAt).getTime()).toBeGreaterThan(0);
      expect(col.bannerUrl.startsWith('data:image/svg+xml;utf8,')).toBe(true);
      const decoded = decodeURIComponent(col.bannerUrl).toLowerCase();
      for (const pink of FORBIDDEN_PINK_HEXES) {
        expect(decoded).not.toContain(pink);
      }
    }
  });

  it('ensures all 7 seeded products satisfy Publish Gate (§2.3) with multi-variant, low-stock, and 3 SVG media items each', () => {
    expect(ARVEN_SEED_PRODUCTS).toHaveLength(7);

    let totalVariants = 0;
    let lowStockVariantCount = 0;
    let compareAtPriceCount = 0;
    let sizeGuideOverrideCount = 0;

    for (const product of ARVEN_SEED_PRODUCTS) {
      // Criterion 1: Core metadata
      expect(product.name.trim().length).toBeGreaterThan(0);
      expect(product.slug.trim().length).toBeGreaterThan(0);
      expect(product.description.trim().length).toBeGreaterThan(0);
      expect(product.material.trim().length).toBeGreaterThan(0);
      expect(product.fit.trim().length).toBeGreaterThan(0);
      expect(product.careInstruction.trim().length).toBeGreaterThan(0);

      // Criterion 3: SEO metadata & size guide
      expect(product.seoTitle.trim().length).toBeGreaterThan(10);
      expect(product.seoDescription.trim().length).toBeGreaterThan(20);
      if (product.sizeGuideOverride) {
        sizeGuideOverrideCount += 1;
      }

      // Criterion 2: Multi-variant with valid SKU, size, color, price, weight
      const minAdditional = product.slug === 'atelier-archive-field-jacket' ? 1 : 2;
      expect(product.additionalVariants.length).toBeGreaterThanOrEqual(minAdditional);
      const variants = [
        {
          sku: product.sku,
          size: product.size,
          color: product.color,
          colorHex: product.colorHex,
          priceIdr: product.priceIdr,
          compareAtPriceIdr: product.compareAtPriceIdr,
          weightGrams: product.weightGrams,
          initialStock: product.initialStock,
          lowStockThreshold: product.lowStockThreshold ?? 5,
        },
        ...product.additionalVariants,
      ];

      totalVariants += variants.length;
      for (const v of variants) {
        expect(v.sku).toMatch(/^[A-Z0-9-]+$/);
        expect(v.priceIdr >= 0n).toBe(true);
        expect(v.weightGrams).toBeGreaterThan(0);
        expect(v.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(FORBIDDEN_PINK_HEXES).not.toContain(v.colorHex.toLowerCase());
        if (v.compareAtPriceIdr && v.compareAtPriceIdr > v.priceIdr) {
          compareAtPriceCount += 1;
        }
        const threshold = v.lowStockThreshold ?? 5;
        if (v.initialStock > 0 && v.initialStock <= threshold) {
          lowStockVariantCount += 1;
        }
      }

      // Criterion 4: Primary & gallery media valid (3 items per product)
      expect(product.media).toHaveLength(3);
      const primaryMedia = product.media.filter((m) => m.isPrimary);
      expect(primaryMedia).toHaveLength(1);
      expect(primaryMedia[0]?.position).toBe(0);
      expect(primaryMedia[0]?.type).toBe(MediaType.IMAGE);

      for (const m of product.media) {
        expect(m.url.startsWith('data:image/svg+xml;utf8,')).toBe(true);
        expect(m.altText.trim().length).toBeGreaterThan(5);
        expect(m.width).toBe(900);
        expect(m.height).toBe(1200);
        const decoded = decodeURIComponent(m.url).toLowerCase();
        for (const pink of FORBIDDEN_PINK_HEXES) {
          expect(decoded).not.toContain(pink);
        }
      }
    }

    expect(totalVariants).toBeGreaterThanOrEqual(24);
    expect(lowStockVariantCount).toBeGreaterThanOrEqual(2);
    expect(compareAtPriceCount).toBeGreaterThanOrEqual(2);
    expect(sizeGuideOverrideCount).toBeGreaterThanOrEqual(1);
  });

  it('configures promotional coupon WELCOME10 with valid percentage bounds and window constraints', () => {
    const welcome10 = ARVEN_SEED_COUPONS.find((c) => c.code === 'WELCOME10');
    expect(welcome10).toBeDefined();
    expect(welcome10?.discountType).toBe(DiscountType.PERCENTAGE);
    expect(welcome10?.discountValue).toBe(10n);
    expect(welcome10?.maxDiscountIdr).toBe(500_000n);
    expect(welcome10?.minOrderSubtotalIdr).toBe(200_000n);
    expect(welcome10?.usageLimitTotal).toBeNull();
    expect(welcome10?.usageLimitPerUser).toBe(5);
    expect(welcome10?.status).toBe(CouponStatus.ACTIVE);
    expect(welcome10?.startsAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(welcome10?.endsAt.toISOString()).toBe('2028-12-31T23:59:59.000Z');

    for (const coupon of ARVEN_SEED_COUPONS) {
      expect(coupon.code).toBe(coupon.code.trim().toUpperCase());
      expect(coupon.discountValue > 0n).toBe(true);
      if (coupon.discountType === DiscountType.PERCENTAGE) {
        expect(coupon.discountValue <= 100n).toBe(true);
      }
      expect(coupon.minOrderSubtotalIdr >= 0n).toBe(true);
      expect(coupon.endsAt.getTime()).toBeGreaterThan(coupon.startsAt.getTime());
    }
  });
});
