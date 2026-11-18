import { z } from 'zod';
import { mediaUrlSchema, slugParamSchema } from './catalog.js';
import { paginationQuerySchema, uuidSchema } from './common.js';

const UNSAFE_CMS_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /<\s*script\b/i, label: '<script> tags are forbidden in CMS content' },
  { pattern: /javascript\s*:/i, label: 'javascript: URIs are forbidden in CMS content' },
  {
    pattern: /\bon[a-z]{2,}\s*=/i,
    label: 'Inline HTML event handler attributes are forbidden in CMS content',
  },
];

function findUnsafeCmsString(value: unknown, depth = 0): string | null {
  if (depth > 20) {
    return 'CMS payload exceeds maximum nesting depth';
  }
  if (typeof value === 'string') {
    for (const rule of UNSAFE_CMS_PATTERNS) {
      if (rule.pattern.test(value)) {
        return rule.label;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const issue = findUnsafeCmsString(item, depth + 1);
      if (issue) {
        return issue;
      }
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entryValue] of Object.entries(value)) {
      const keyIssue = findUnsafeCmsString(key, depth + 1);
      if (keyIssue) {
        return keyIssue;
      }
      const valIssue = findUnsafeCmsString(entryValue, depth + 1);
      if (valIssue) {
        return valIssue;
      }
    }
  }
  return null;
}

function rejectUnsafeCmsPayload(value: unknown, ctx: z.RefinementCtx): void {
  const violation = findUnsafeCmsString(value);
  if (violation) {
    ctx.addIssue({
      code: 'custom',
      message: violation,
    });
  }
}

const safeCmsText = (minLen: number, maxLen: number, fieldLabel: string) =>
  z
    .string()
    .trim()
    .min(minLen, `${fieldLabel} must be at least ${minLen} characters`)
    .max(maxLen, `${fieldLabel} must be at most ${maxLen} characters`)
    .superRefine(rejectUnsafeCmsPayload);

export const cmsStatusSchema = z.enum([
  'DRAFT',
  'PREVIEW',
  'PUBLISHED',
  'ARCHIVED',
]);

export type CmsStatusInput = z.infer<typeof cmsStatusSchema>;

export const adminCmsListQuerySchema = paginationQuerySchema.extend({
  status: cmsStatusSchema.optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export type AdminCmsListQuery = z.infer<typeof adminCmsListQuerySchema>;

export const cmsPageBlockSchema = z.strictObject({
  id: z.string().trim().min(1).max(80).optional(),
  type: z.string().trim().min(1, 'Block type is required').max(64),
  heading: safeCmsText(1, 220, 'Block heading').optional(),
  subheading: safeCmsText(1, 320, 'Block subheading').optional(),
  body: safeCmsText(1, 10000, 'Block body').optional(),
  imageUrl: mediaUrlSchema.optional(),
  altText: safeCmsText(1, 255, 'Block altText').optional(),
  ctaLabel: safeCmsText(1, 80, 'CTA label').optional(),
  ctaHref: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(
      (val) => (val.startsWith('/') && !val.startsWith('//')) || val.startsWith('https://'),
      'CTA link must be a relative path (/...) or HTTPS URL',
    )
    .superRefine(rejectUnsafeCmsPayload)
    .optional(),
  items: z
    .array(
      z.strictObject({
        label: safeCmsText(1, 120, 'Item label'),
        value: safeCmsText(1, 1000, 'Item value'),
      }),
    )
    .max(30)
    .optional(),
});

export type CmsPageBlockInput = z.infer<typeof cmsPageBlockSchema>;

export const cmsPageBlocksSchema = z
  .union([
    z.array(cmsPageBlockSchema).min(1, 'At least one content block is required').max(50),
    z.record(z.string(), z.unknown()),
  ])
  .superRefine(rejectUnsafeCmsPayload);

export const createCmsPageSchema = z.strictObject({
  slug: slugParamSchema,
  title: safeCmsText(2, 200, 'Page title'),
  blocks: cmsPageBlocksSchema,
  seoTitle: safeCmsText(1, 160, 'SEO title').nullable().optional(),
  seoDescription: safeCmsText(1, 320, 'SEO description').nullable().optional(),
});

export type CreateCmsPageRequest = z.infer<typeof createCmsPageSchema>;

export const updateCmsPageSchema = z
  .strictObject({
    slug: slugParamSchema.optional(),
    title: safeCmsText(2, 200, 'Page title').optional(),
    blocks: cmsPageBlocksSchema.optional(),
    seoTitle: safeCmsText(1, 160, 'SEO title').nullable().optional(),
    seoDescription: safeCmsText(1, 320, 'SEO description').nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one CMS page field must be provided',
  });

export type UpdateCmsPageRequest = z.infer<typeof updateCmsPageSchema>;

export const cmsLookbookSlideSchema = z.strictObject({
  id: z.string().trim().min(1).max(80).optional(),
  title: safeCmsText(1, 200, 'Slide title'),
  caption: safeCmsText(1, 1000, 'Slide caption').optional(),
  imageUrl: mediaUrlSchema,
  altText: safeCmsText(1, 255, 'Slide altText').optional(),
  productSlug: slugParamSchema.optional(),
  productId: uuidSchema.optional(),
  position: z.number().int().nonnegative().max(500).optional(),
});

export type CmsLookbookSlideInput = z.infer<typeof cmsLookbookSlideSchema>;

export const createCmsLookbookSchema = z.strictObject({
  slug: slugParamSchema,
  title: safeCmsText(2, 220, 'Lookbook title'),
  season: safeCmsText(2, 64, 'Season'),
  description: safeCmsText(1, 2000, 'Lookbook description').nullable().optional(),
  slides: z
    .array(cmsLookbookSlideSchema)
    .min(1, 'At least one lookbook slide is required')
    .max(50)
    .superRefine(rejectUnsafeCmsPayload),
});

export type CreateCmsLookbookRequest = z.infer<typeof createCmsLookbookSchema>;

export const updateCmsLookbookSchema = z
  .strictObject({
    slug: slugParamSchema.optional(),
    title: safeCmsText(2, 220, 'Lookbook title').optional(),
    season: safeCmsText(2, 64, 'Season').optional(),
    description: safeCmsText(1, 2000, 'Lookbook description').nullable().optional(),
    slides: z
      .array(cmsLookbookSlideSchema)
      .min(1, 'At least one lookbook slide is required')
      .max(50)
      .superRefine(rejectUnsafeCmsPayload)
      .optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one lookbook field must be provided',
  });

export type UpdateCmsLookbookRequest = z.infer<typeof updateCmsLookbookSchema>;

export const cmsJournalBodySchema = z
  .union([
    z.record(z.string(), z.unknown()),
    z.array(z.record(z.string(), z.unknown())).min(1).max(100),
  ])
  .superRefine(rejectUnsafeCmsPayload);

export const createCmsJournalSchema = z.strictObject({
  slug: slugParamSchema,
  title: safeCmsText(2, 220, 'Journal title'),
  excerpt: safeCmsText(3, 1000, 'Journal excerpt'),
  body: cmsJournalBodySchema,
  coverMediaUrl: mediaUrlSchema.nullable().optional(),
});

export type CreateCmsJournalRequest = z.infer<typeof createCmsJournalSchema>;

export const updateCmsJournalSchema = z
  .strictObject({
    slug: slugParamSchema.optional(),
    title: safeCmsText(2, 220, 'Journal title').optional(),
    excerpt: safeCmsText(3, 1000, 'Journal excerpt').optional(),
    body: cmsJournalBodySchema.optional(),
    coverMediaUrl: mediaUrlSchema.nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one journal article field must be provided',
  });

export type UpdateCmsJournalRequest = z.infer<typeof updateCmsJournalSchema>;

export const transitionCmsStatusSchema = z.strictObject({
  toStatus: cmsStatusSchema,
});

export type TransitionCmsStatusRequest = z.infer<typeof transitionCmsStatusSchema>;
