import { config as loadDotenv } from 'dotenv';
import { findWorkspaceEnvFile } from '@arven/config';
import { describe, expect, it } from 'vitest';
import {
  ARVEN_SEED_COUPONS,
  ARVEN_SEED_JOURNAL_ARTICLES,
  ARVEN_SEED_LOOKBOOKS,
  ARVEN_SEED_PAGES,
  ARVEN_SEED_PRODUCTS,
  CmsStatus,
  CouponStatus,
  DiscountType,
  createPrismaClient,
  seedDatabase,
} from '../src/index.js';

const FORBIDDEN_PINK_HEXES = [
  '#ff00ff',
  '#ff69b4',
  '#ffc0cb',
  '#ff1493',
  '#db7093',
  '#ec4899',
  '#f472b6',
];
const UNSAFE_HTML_PATTERN = /<\s*script\b|javascript\s*:|\bon[a-z]{2,}\s*=/i;

function assertSafeEditorialString(value: string): void {
  expect(value).not.toContain('\u2014');
  expect(UNSAFE_HTML_PATTERN.test(value)).toBe(false);
}

describe('Phase 06 CMS & Coupon Seed Invariants', () => {
  it('defines at least 2 PUBLISHED Lookbooks with XSS-clean slides referencing real seeded product slugs', () => {
    const publishedLookbooks = ARVEN_SEED_LOOKBOOKS.filter(
      (lb) => lb.status === CmsStatus.PUBLISHED,
    );
    expect(publishedLookbooks.length).toBeGreaterThanOrEqual(2);
    expect(ARVEN_SEED_LOOKBOOKS.map((lb) => lb.slug)).toEqual(
      expect.arrayContaining(['monolith-aw26', 'archival-linen-ss26']),
    );

    const seededProductSlugs = new Set(ARVEN_SEED_PRODUCTS.map((p) => p.slug));

    for (const lb of ARVEN_SEED_LOOKBOOKS) {
      assertSafeEditorialString(lb.title);
      assertSafeEditorialString(lb.description);
      expect(lb.slides.length).toBeGreaterThanOrEqual(2);
      if (lb.status === CmsStatus.PUBLISHED) {
        expect(lb.publishedAt).toBeInstanceOf(Date);
      }

      for (const slide of lb.slides) {
        assertSafeEditorialString(slide.title);
        assertSafeEditorialString(slide.caption);
        assertSafeEditorialString(slide.altText);
        expect(slide.altText.trim().length).toBeGreaterThan(5);
        expect(seededProductSlugs.has(slide.productSlug)).toBe(true);
        expect(slide.imageUrl.startsWith('data:image/svg+xml;utf8,')).toBe(true);
        const decodedSvg = decodeURIComponent(slide.imageUrl).toLowerCase();
        expect(UNSAFE_HTML_PATTERN.test(decodedSvg)).toBe(false);
        for (const pink of FORBIDDEN_PINK_HEXES) {
          expect(decodedSvg).not.toContain(pink);
        }
      }
    }
  });

  it('defines at least 3 PUBLISHED JournalArticles and 1 non-public PREVIEW/DRAFT article with zero em-dashes', () => {
    const published = ARVEN_SEED_JOURNAL_ARTICLES.filter(
      (article) => article.status === CmsStatus.PUBLISHED,
    );
    const nonPublished = ARVEN_SEED_JOURNAL_ARTICLES.filter(
      (article) =>
        article.status === CmsStatus.PREVIEW || article.status === CmsStatus.DRAFT,
    );

    expect(published.length).toBeGreaterThanOrEqual(3);
    expect(nonPublished.length).toBeGreaterThanOrEqual(1);

    for (const article of ARVEN_SEED_JOURNAL_ARTICLES) {
      assertSafeEditorialString(article.title);
      assertSafeEditorialString(article.excerpt);
      expect(article.body.length).toBeGreaterThanOrEqual(1);
      for (const block of article.body) {
        assertSafeEditorialString(block.text);
        if (block.heading) {
          assertSafeEditorialString(block.heading);
        }
      }
      if (article.status === CmsStatus.PUBLISHED) {
        expect(article.publishedAt).toBeInstanceOf(Date);
      } else {
        expect(article.publishedAt).toBeNull();
      }
      expect(article.coverMediaUrl.startsWith('data:image/svg+xml;utf8,')).toBe(true);
      const decodedSvg = decodeURIComponent(article.coverMediaUrl).toLowerCase();
      for (const pink of FORBIDDEN_PINK_HEXES) {
        expect(decodedSvg).not.toContain(pink);
      }
    }
  });

  it('defines PUBLISHED about and craftsmanship CMS pages with structured blocks', () => {
    expect(ARVEN_SEED_PAGES.map((p) => p.slug)).toEqual(
      expect.arrayContaining(['about', 'craftsmanship']),
    );
    for (const page of ARVEN_SEED_PAGES) {
      expect(page.status).toBe(CmsStatus.PUBLISHED);
      expect(page.publishedAt).toBeInstanceOf(Date);
      assertSafeEditorialString(page.title);
      assertSafeEditorialString(page.seoTitle);
      assertSafeEditorialString(page.seoDescription);
      expect(page.blocks.length).toBeGreaterThanOrEqual(2);
      for (const block of page.blocks) {
        if (block.heading) assertSafeEditorialString(block.heading);
        if (block.subheading) assertSafeEditorialString(block.subheading);
        if (block.body) assertSafeEditorialString(block.body);
        if (block.ctaLabel) assertSafeEditorialString(block.ctaLabel);
      }
    }
  });

  it('retains WELCOME10 and FIRSTLOOK alongside ARVEN15 and FREESHIP coupons', () => {
    const byCode = new Map(ARVEN_SEED_COUPONS.map((c) => [c.code, c]));
    expect(byCode.get('WELCOME10')?.status).toBe(CouponStatus.ACTIVE);
    expect(byCode.get('FIRSTLOOK')?.discountType).toBe(DiscountType.FIXED_AMOUNT);
    expect(byCode.get('ARVEN15')?.discountType).toBe(DiscountType.PERCENTAGE);
    expect(byCode.get('ARVEN15')?.discountValue).toBe(15n);
    expect(byCode.get('FREESHIP')?.discountType).toBe(DiscountType.FREE_SHIPPING);
    expect(byCode.get('FREESHIP')?.discountValue).toBeGreaterThan(0n);
  });

  it('executes seedDatabase idempotently against PostgreSQL without duplicating CMS or coupon rows', async () => {
    const envFile = findWorkspaceEnvFile(import.meta.dirname);
    if (envFile) {
      loadDotenv({ path: envFile, quiet: true });
    }
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for Phase 06 seed integration test');
    }

    const prisma = createPrismaClient({ connectionString: databaseUrl });
    try {
      const first = await seedDatabase(prisma);
      const second = await seedDatabase(prisma);

      expect(first.lookbooksUpserted).toBe(ARVEN_SEED_LOOKBOOKS.length);
      expect(first.journalArticlesUpserted).toBe(ARVEN_SEED_JOURNAL_ARTICLES.length);
      expect(first.pagesUpserted).toBe(ARVEN_SEED_PAGES.length);
      expect(second.lookbooksUpserted).toBe(first.lookbooksUpserted);
      expect(second.journalArticlesUpserted).toBe(first.journalArticlesUpserted);
      expect(second.pagesUpserted).toBe(first.pagesUpserted);

      const lookbookSlugs = ARVEN_SEED_LOOKBOOKS.map((lb) => lb.slug);
      const lookbooks = await prisma.lookbook.findMany({
        where: { slug: { in: lookbookSlugs } },
      });
      expect(lookbooks).toHaveLength(ARVEN_SEED_LOOKBOOKS.length);

      const articleSlugs = ARVEN_SEED_JOURNAL_ARTICLES.map((a) => a.slug);
      const articles = await prisma.journalArticle.findMany({
        where: { slug: { in: articleSlugs } },
      });
      expect(articles).toHaveLength(ARVEN_SEED_JOURNAL_ARTICLES.length);

      const pageSlugs = ARVEN_SEED_PAGES.map((p) => p.slug);
      const pages = await prisma.page.findMany({
        where: { slug: { in: pageSlugs } },
      });
      expect(pages).toHaveLength(ARVEN_SEED_PAGES.length);

      const coupons = await prisma.coupon.findMany({
        where: { code: { in: ARVEN_SEED_COUPONS.map((c) => c.code) } },
      });
      expect(coupons).toHaveLength(ARVEN_SEED_COUPONS.length);
    } finally {
      await prisma.$disconnect();
    }
  }, 20_000);
});
