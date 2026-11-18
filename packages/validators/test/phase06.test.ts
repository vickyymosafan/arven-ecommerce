import { describe, expect, it } from 'vitest';
import {
  adminCmsListQuerySchema,
  adminCouponsQuerySchema,
  adminCreateShipmentSchema,
  adminOrdersQuerySchema,
  adminRefundsQuerySchema,
  adminReturnsQuerySchema,
  adminTransitionOrderSchema,
  analyticsSalesQuerySchema,
  approveRefundSchema,
  approveReturnSchema,
  createCmsJournalSchema,
  createCmsLookbookSchema,
  createCmsPageSchema,
  createCouponSchema,
  createCustomerReturnSchema,
  receiveReturnSchema,
  requestRefundSchema,
  reviewReturnSchema,
  transitionCmsStatusSchema,
  updateCmsJournalSchema,
  updateCmsLookbookSchema,
  updateCmsPageSchema,
  updateCouponSchema,
} from '../src/index.js';

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';

describe('@arven/validators Phase 06 admin-ops, returns, refunds, coupons, cms & analytics schemas', () => {
  it('validates admin order queries, transitions, and shipment creation with .strict()', () => {
    const query = adminOrdersQuerySchema.safeParse({
      page: '1',
      limit: '50',
      status: 'PAID',
      q: 'ARV-2026',
    });
    expect(query.success).toBe(true);

    expect(
      adminOrdersQuerySchema.safeParse({ page: 0, limit: 20 }).success,
    ).toBe(false);
    expect(
      adminOrdersQuerySchema.safeParse({ page: 1, limit: 101 }).success,
    ).toBe(false);
    expect(
      adminOrdersQuerySchema.safeParse({ page: 1, limit: 20, extra: true }).success,
    ).toBe(false);

    expect(
      adminTransitionOrderSchema.safeParse({
        toStatus: 'PROCESSING',
        reason: 'Packed at Jakarta flagship warehouse',
      }).success,
    ).toBe(true);
    expect(
      adminTransitionOrderSchema.safeParse({
        toStatus: 'PROCESSING',
        actorId: UUID_1,
      }).success,
    ).toBe(false);

    const shipment = adminCreateShipmentSchema.safeParse({
      provider: 'jne-adapter',
      serviceCode: 'REG',
    });
    expect(shipment.success).toBe(true);
    if (shipment.success) {
      expect(shipment.data.warehouseCode).toBe('JKT-MAIN-01');
    }
    expect(
      adminCreateShipmentSchema.safeParse({
        provider: 'unknown-carrier',
        serviceCode: 'REG',
      }).success,
    ).toBe(false);
    expect(
      adminCreateShipmentSchema.safeParse({
        provider: 'sicepat-adapter',
        serviceCode: 'BEST',
        trackingNumber: 'FORGED-123',
      }).success,
    ).toBe(false);
  });

  it('validates customer and admin return schemas and rejects unknown fields or invalid conditions', () => {
    const customerRet = createCustomerReturnSchema.safeParse({
      reason: 'Size runs slightly large on shoulders',
      customerNotes: 'Unworn with original garment tag attached',
      items: [{ orderItemId: UUID_1, quantity: 1 }],
    });
    expect(customerRet.success).toBe(true);

    // Reject duplicate orderItemId
    expect(
      createCustomerReturnSchema.safeParse({
        reason: 'Duplicate item test',
        items: [
          { orderItemId: UUID_1, quantity: 1 },
          { orderItemId: UUID_1, quantity: 1 },
        ],
      }).success,
    ).toBe(false);

    // Reject .strict() mass assignment
    expect(
      createCustomerReturnSchema.safeParse({
        reason: 'Size mismatch',
        status: 'APPROVED',
        items: [{ orderItemId: UUID_1, quantity: 1 }],
      }).success,
    ).toBe(false);

    expect(
      adminReturnsQuerySchema.safeParse({ page: 1, limit: 20, status: 'UNDER_REVIEW' }).success,
    ).toBe(true);
    expect(
      adminReturnsQuerySchema.safeParse({ page: 1, limit: 20, q: 'unexpected' }).success,
    ).toBe(false);

    expect(reviewReturnSchema.safeParse({ notes: 'Checking photos' }).success).toBe(true);
    expect(reviewReturnSchema.safeParse({ status: 'APPROVED' }).success).toBe(false);

    expect(
      approveReturnSchema.safeParse({ decision: 'APPROVE', adminNotes: 'Eligible' }).success,
    ).toBe(true);
    expect(
      approveReturnSchema.safeParse({ decision: 'FORCE', adminNotes: 'Nope' }).success,
    ).toBe(false);

    expect(
      receiveReturnSchema.safeParse({
        warehouseCode: 'JKT-MAIN-01',
        items: [
          { returnItemId: UUID_1, condition: 'UNOPENED', restock: true },
          { returnItemId: UUID_2, condition: 'DAMAGED', restock: false },
        ],
      }).success,
    ).toBe(true);

    // Invalid ReturnItemCondition
    expect(
      receiveReturnSchema.safeParse({
        items: [{ returnItemId: UUID_1, condition: 'SCRATCHED', restock: false }],
      }).success,
    ).toBe(false);

    // Extra field on receiveReturnItemSchema
    expect(
      receiveReturnSchema.safeParse({
        items: [{ returnItemId: UUID_1, condition: 'GOOD', restock: true, restocked: true }],
      }).success,
    ).toBe(false);
  });

  it('rejects negative/zero refunds and mass-assigned actor fields on refund schemas', () => {
    expect(
      adminRefundsQuerySchema.safeParse({ page: 1, limit: 20, status: 'REQUESTED' }).success,
    ).toBe(true);
    expect(
      adminRefundsQuerySchema.safeParse({ page: 1, limit: 150 }).success,
    ).toBe(false);

    expect(
      requestRefundSchema.safeParse({
        amountIdr: 299000,
        reason: 'Approved return inspection completed',
        returnId: UUID_1,
      }).success,
    ).toBe(true);

    expect(
      requestRefundSchema.safeParse({ amountIdr: 0, reason: 'Zero amount' }).success,
    ).toBe(false);
    expect(
      requestRefundSchema.safeParse({ amountIdr: -50000, reason: 'Negative amount' }).success,
    ).toBe(false);
    expect(
      requestRefundSchema.safeParse({ amountIdr: 100.5, reason: 'Float amount' }).success,
    ).toBe(false);
    expect(
      requestRefundSchema.safeParse({
        amountIdr: 100000,
        reason: 'Forged requester',
        requestedBy: UUID_1,
      }).success,
    ).toBe(false);

    expect(
      approveRefundSchema.safeParse({ decision: 'APPROVE', notes: 'Verified by owner' }).success,
    ).toBe(true);
    expect(
      approveRefundSchema.safeParse({ decision: 'APPROVE', approvedBy: UUID_1 }).success,
    ).toBe(false);
  });

  it('enforces coupon percentage <= 100, positive value, strict fields, and endsAt > startsAt', () => {
    const validPct = createCouponSchema.safeParse({
      code: '  atelier15 ',
      name: 'Atelier 15% Off',
      discountType: 'PERCENTAGE',
      discountValue: 15,
      maxDiscountIdr: 500000,
      minOrderSubtotalIdr: 1000000,
      usageLimitTotal: 100,
      usageLimitPerUser: 1,
      status: 'ACTIVE',
      startsAt: '2026-11-01T00:00:00.000Z',
      endsAt: '2026-12-01T00:00:00.000Z',
    });
    expect(validPct.success).toBe(true);
    if (validPct.success) {
      expect(validPct.data.code).toBe('ATELIER15');
    }

    // Percentage > 100 rejected
    const over100 = createCouponSchema.safeParse({
      code: 'OVER101',
      name: 'Invalid Percentage',
      discountType: 'PERCENTAGE',
      discountValue: 101,
      startsAt: '2026-11-01T00:00:00.000Z',
      endsAt: '2026-12-01T00:00:00.000Z',
    });
    expect(over100.success).toBe(false);

    // Negative / zero discountValue rejected
    expect(
      createCouponSchema.safeParse({
        code: 'NEG10',
        name: 'Negative',
        discountType: 'FIXED_AMOUNT',
        discountValue: -10000,
        startsAt: '2026-11-01T00:00:00.000Z',
        endsAt: '2026-12-01T00:00:00.000Z',
      }).success,
    ).toBe(false);

    // endsAt <= startsAt rejected
    const badDates = createCouponSchema.safeParse({
      code: 'BADDATES',
      name: 'Bad Range',
      discountType: 'FIXED_AMOUNT',
      discountValue: 50000,
      startsAt: '2026-12-01T00:00:00.000Z',
      endsAt: '2026-11-01T00:00:00.000Z',
    });
    expect(badDates.success).toBe(false);

    // Unknown key rejected (.strict())
    expect(
      createCouponSchema.safeParse({
        code: 'STRICT10',
        name: 'Strict Check',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startsAt: '2026-11-01T00:00:00.000Z',
        endsAt: '2026-12-01T00:00:00.000Z',
        usedCount: 999,
      }).success,
    ).toBe(false);

    // updateCouponSchema checks
    expect(updateCouponSchema.safeParse({}).success).toBe(false);
    expect(updateCouponSchema.safeParse({ status: 'PAUSED' }).success).toBe(true);
    expect(updateCouponSchema.safeParse({ status: 'UNKNOWN_STATUS' }).success).toBe(false);
    expect(
      updateCouponSchema.safeParse({
        discountType: 'PERCENTAGE',
        discountValue: 150,
      }).success,
    ).toBe(false);
    expect(
      updateCouponSchema.safeParse({
        startsAt: '2026-12-10T00:00:00.000Z',
        endsAt: '2026-12-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      adminCouponsQuerySchema.safeParse({ page: 1, limit: 20, status: 'ACTIVE', q: 'WELCOME' })
        .success,
    ).toBe(true);
  });

  it('validates CMS pages, lookbooks, journal articles, status transitions, and rejects XSS payloads', () => {
    expect(
      adminCmsListQuerySchema.safeParse({ page: 1, limit: 20, status: 'PUBLISHED', q: 'aw26' })
        .success,
    ).toBe(true);

    expect(
      createCmsPageSchema.safeParse({
        slug: 'about',
        title: 'About ARVEN',
        blocks: [
          {
            type: 'HERO',
            heading: 'Beyond Trends. Beyond Time.',
            body: 'Architectural silhouettes crafted in Jakarta.',
          },
        ],
        seoTitle: 'About ARVEN Atelier',
      }).success,
    ).toBe(true);

    // Reject script injection & extra field
    expect(
      createCmsPageSchema.safeParse({
        slug: 'about',
        title: 'About ARVEN',
        blocks: [{ type: 'HERO', body: '<script>alert(1)</script>' }],
      }).success,
    ).toBe(false);
    expect(
      createCmsPageSchema.safeParse({
        slug: 'about',
        title: 'About ARVEN',
        blocks: [{ type: 'HERO', heading: 'Valid' }],
        status: 'PUBLISHED',
      }).success,
    ).toBe(false);

    expect(
      updateCmsPageSchema.safeParse({ title: 'Updated About' }).success,
    ).toBe(true);
    expect(updateCmsPageSchema.safeParse({}).success).toBe(false);
    expect(
      createCmsPageSchema.safeParse({
        slug: 'atelier',
        title: 'Jakarta Atelier',
        blocks: [{ type: 'HERO', ctaLabel: 'Explore', ctaHref: '/collections' }],
      }).success,
    ).toBe(true);
    expect(
      createCmsPageSchema.safeParse({
        slug: 'atelier',
        title: 'Jakarta Atelier',
        blocks: [{ type: 'HERO', ctaLabel: 'Explore', ctaHref: 'https://arven.id/about' }],
      }).success,
    ).toBe(true);
    for (const unsafeHref of [
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'javascript:alert(1)',
      '//evil.example/phish',
    ]) {
      expect(
        createCmsPageSchema.safeParse({
          slug: 'atelier',
          title: 'Jakarta Atelier',
          blocks: [{ type: 'HERO', ctaLabel: 'Bad', ctaHref: unsafeHref }],
        }).success,
      ).toBe(false);
    }

    expect(
      createCmsLookbookSchema.safeParse({
        slug: 'essentials-aw26',
        title: 'Essentials AW26',
        season: 'AW26',
        description: 'Monochrome tailoring study.',
        slides: [
          {
            title: 'Look 01 — Structured Wool Coat',
            caption: 'Double-faced wool in Obsidian.',
            imageUrl: '/images/lookbook-01.webp',
            altText: 'Model wearing structured wool coat',
            productSlug: 'structured-wool-coat',
            position: 0,
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      createCmsLookbookSchema.safeParse({
        slug: 'essentials-aw26',
        title: 'Essentials AW26',
        season: 'AW26',
        slides: [
          {
            title: 'Bad Slide',
            imageUrl: 'javascript:alert(1)',
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      updateCmsLookbookSchema.safeParse({ season: 'SS27' }).success,
    ).toBe(true);

    expect(
      createCmsJournalSchema.safeParse({
        slug: 'craft-of-draping',
        title: 'The Craft of Architectural Draping',
        excerpt: 'Notes from our Jakarta pattern studio.',
        body: {
          sections: [
            { heading: 'Proportion', paragraphs: ['Cut with deliberate ease.'] },
          ],
        },
        coverMediaUrl: '/images/journal-draping.webp',
      }).success,
    ).toBe(true);

    expect(
      createCmsJournalSchema.safeParse({
        slug: 'xss-journal',
        title: 'Bad Journal',
        excerpt: 'Unsafe attribute test',
        body: [{ html: '<img src=x onerror=alert(1)>' }],
      }).success,
    ).toBe(false);
    expect(updateCmsJournalSchema.safeParse({}).success).toBe(false);

    expect(
      transitionCmsStatusSchema.safeParse({ toStatus: 'PREVIEW' }).success,
    ).toBe(true);
    expect(
      transitionCmsStatusSchema.safeParse({ toStatus: 'PUBLISHED', extra: 1 }).success,
    ).toBe(false);
  });

  it('validates analytics query bounds and OpenAPI 3.0 Standard Schema generation', () => {
    const defaultAnalytics = analyticsSalesQuerySchema.safeParse({});
    expect(defaultAnalytics.success).toBe(true);
    if (defaultAnalytics.success) {
      expect(defaultAnalytics.data.days).toBe(30);
    }

    expect(analyticsSalesQuerySchema.safeParse({ days: '90' }).success).toBe(true);
    expect(analyticsSalesQuerySchema.safeParse({ days: 0 }).success).toBe(false);
    expect(analyticsSalesQuerySchema.safeParse({ days: 91 }).success).toBe(false);
    expect(analyticsSalesQuerySchema.safeParse({ days: 30, extra: 'no' }).success).toBe(false);

    const openApiSchema = createCouponSchema['~standard'].jsonSchema.input({
      target: 'openapi-3.0',
    });
    expect(openApiSchema).toHaveProperty('type', 'object');
  });
});
