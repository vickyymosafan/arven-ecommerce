import { z } from 'zod';

export const responseMetaSchema = z.object({
  requestId: z.string(),
});

export const paginatedMetaSchema = responseMetaSchema.extend({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const errorDetailSchema = z.object({
  field: z.string(),
  issue: z.string(),
});

export const apiErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(errorDetailSchema).optional(),
});

export const apiErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: apiErrorPayloadSchema,
  meta: responseMetaSchema,
});

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

export function createSuccessEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: responseMetaSchema,
  });
}

export function createPaginatedEnvelopeSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    meta: paginatedMetaSchema,
  });
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
  };
}

export interface ApiPaginatedEnvelope<T> {
  success: true;
  data: T[];
  meta: {
    requestId: string;
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
