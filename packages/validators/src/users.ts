import { z } from 'zod';
import {
  emailSchema,
  fullNameSchema,
  phoneSchema,
  roleCodeSchema,
  userStatusSchema,
  uuidSchema,
} from './common.js';

export const updateProfileRequestSchema = z
  .strictObject({
    fullName: fullNameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .refine(
    (payload) => payload.fullName !== undefined || payload.phone !== undefined,
    { message: 'At least one profile field (fullName or phone) must be provided' },
  );

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const userProfileResponseSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  roles: z.array(roleCodeSchema),
  mfaEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;

export const userSessionSummarySchema = z.object({
  id: uuidSchema,
  scope: z.enum(['CUSTOMER', 'ADMIN']),
  ipMasked: z.string(),
  userAgentSummary: z.string(),
  mfaVerifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  isCurrent: z.boolean(),
});

export type UserSessionSummary = z.infer<typeof userSessionSummarySchema>;

export const createAddressRequestSchema = z.strictObject({
  label: z.string().trim().min(1).max(60),
  recipientName: fullNameSchema,
  phone: phoneSchema,
  line1: z.string().trim().min(5).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().regex(/^[A-Za-z0-9 -]{4,10}$/, 'Invalid postal code'),
  country: z.string().trim().length(2).toUpperCase().default('ID'),
  isDefault: z.boolean().default(false),
});

export type CreateAddressRequest = z.infer<typeof createAddressRequestSchema>;

export const updateAddressRequestSchema = z
  .strictObject({
    label: z.string().trim().min(1).max(60).optional(),
    recipientName: fullNameSchema.optional(),
    phone: phoneSchema.optional(),
    line1: z.string().trim().min(5).max(200).optional(),
    line2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().min(2).max(100).optional(),
    province: z.string().trim().min(2).max(100).optional(),
    postalCode: z.string().trim().regex(/^[A-Za-z0-9 -]{4,10}$/, 'Invalid postal code').optional(),
    country: z.string().trim().length(2).toUpperCase().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(
    (payload) => Object.keys(payload).length > 0,
    { message: 'At least one address field must be provided' },
  );

export type UpdateAddressRequest = z.infer<typeof updateAddressRequestSchema>;

export const addressResponseSchema = z.object({
  id: uuidSchema,
  label: z.string(),
  recipientName: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  province: z.string(),
  postalCode: z.string(),
  country: z.string(),
  isDefault: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type AddressResponse = z.infer<typeof addressResponseSchema>;
