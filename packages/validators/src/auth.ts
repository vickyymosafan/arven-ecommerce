import { z } from 'zod';
import {
  emailSchema,
  fullNameSchema,
  opaqueTokenSchema,
  passwordSchema,
  phoneSchema,
  roleCodeSchema,
  totpCodeSchema,
  userStatusSchema,
  uuidSchema,
} from './common.js';

export const registerRequestSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  fullName: fullNameSchema,
  phone: phoneSchema.optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: z
    .string()
    .min(1)
    .max(128)
    .refine((value) => !value.includes('\u0000'), 'Invalid password characters'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const adminLoginRequestSchema = z.strictObject({
  email: emailSchema,
  password: z
    .string()
    .min(1)
    .max(128)
    .refine((value) => !value.includes('\u0000'), 'Invalid password characters'),
});

export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

export const mfaVerifyRequestSchema = z.strictObject({
  code: totpCodeSchema,
});

export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

export const forgotPasswordRequestSchema = z.strictObject({
  email: emailSchema,
});

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.strictObject({
  token: opaqueTokenSchema,
  newPassword: passwordSchema,
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const verifyEmailRequestSchema = z.strictObject({
  token: opaqueTokenSchema,
});

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const authUserSummarySchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  roles: z.array(roleCodeSchema),
  permissions: z.array(z.string()),
  mfaEnabled: z.boolean(),
  mfaVerified: z.boolean(),
  mfaVerifiedAt: z.iso.datetime().nullable(),
});

export type AuthUserSummary = z.infer<typeof authUserSummarySchema>;

export const registerResponseSchema = z.object({
  user: authUserSummarySchema,
  verificationEmailSent: z.boolean(),
});

export const authSessionResponseSchema = z.object({
  user: authUserSummarySchema,
  mfaRequired: z.boolean(),
  sessionExpiresAt: z.iso.datetime(),
});

export const mfaSetupResponseSchema = z.object({
  otpauthUri: z.string(),
  manualEntryKey: z.string(),
  issuer: z.string(),
  accountName: z.string(),
});

export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

export const mfaVerifyResponseSchema = z.object({
  verified: z.literal(true),
  mfaVerifiedAt: z.iso.datetime(),
  user: authUserSummarySchema,
});

export const forgotPasswordResponseSchema = z.object({
  accepted: z.literal(true),
});

export const resetPasswordResponseSchema = z.object({
  reset: z.literal(true),
});

export const verifyEmailResponseSchema = z.object({
  verified: z.literal(true),
});
