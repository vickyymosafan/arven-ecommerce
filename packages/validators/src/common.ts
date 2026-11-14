import { z } from 'zod';

export const uuidSchema = z.uuid();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => !value.includes('\u0000'), 'Password must not contain null characters');

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Full name must be at least 2 characters')
  .max(120, 'Full name must be at most 120 characters');

export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .regex(
        /^(?:\+62|62|0)8[1-9][0-9]{6,11}$|^\+[1-9][0-9]{7,14}$/,
        'Phone number must be a valid Indonesian mobile number or E.164 international format',
      ),
  );

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Verification code must be exactly 6 digits');

export const opaqueTokenSchema = z
  .string()
  .trim()
  .min(24, 'Token is malformed')
  .max(256, 'Token is malformed');

export const requestIdHeaderSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{8,64}$/);

export const idrIntegerSchema = z.number().int().nonnegative();

export const idParamSchema = z.strictObject({
  id: z.uuid(),
});

export const paginationQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const roleCodeSchema = z.enum([
  'OWNER',
  'MANAGER',
  'PRODUCT',
  'INVENTORY',
  'ORDER',
  'CONTENT',
  'SUPPORT',
  'CUSTOMER',
]);

export const userStatusSchema = z.enum([
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'DELETED',
]);

/**
 * Deterministically formats an integer Rupiah amount as `Rp 1.890.000` (no floating-point math).
 */
export function formatIDR(amountIdr: number | bigint): string {
  const numeric = typeof amountIdr === 'bigint' ? amountIdr : BigInt(Math.trunc(amountIdr));
  if (typeof amountIdr === 'number' && (!Number.isFinite(amountIdr) || !Number.isInteger(amountIdr))) {
    throw new RangeError(`formatIDR requires an integer Rupiah amount, received: ${amountIdr}`);
  }
  const negative = numeric < 0n;
  const absStr = (negative ? -numeric : numeric).toString();
  const grouped = absStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}Rp ${grouped}`;
}

/**
 * Formats a UTC date/ISO timestamp for operator & customer display in Asia/Jakarta (WIB).
 */
export function formatWIB(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('formatWIB received an invalid date');
  }
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${formatted} WIB`;
}
