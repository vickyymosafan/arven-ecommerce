import { z } from 'zod';

export const healthLiveResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestampUtc: z.iso.datetime(),
});

export type HealthLiveResponse = z.infer<typeof healthLiveResponseSchema>;

export const healthReadyResponseSchema = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.object({
    postgres: z.enum(['up', 'down']),
    redis: z.enum(['up', 'down']),
  }),
  timestampUtc: z.iso.datetime(),
});

export type HealthReadyResponse = z.infer<typeof healthReadyResponseSchema>;

export const csrfTokenResponseSchema = z.object({
  csrfToken: z.string(),
});

export type CsrfTokenResponse = z.infer<typeof csrfTokenResponseSchema>;
