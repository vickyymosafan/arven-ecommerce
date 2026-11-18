import { z } from 'zod';
import { discountTypeSchema, orderStatusSchema } from './checkout.js';
import { paginationQuerySchema } from './common.js';

export const shipmentStatusSchema = z.enum([
  'UNFULFILLED',
  'READY_TO_SHIP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'RETURNED',
]);

export type ShipmentStatusInput = z.infer<typeof shipmentStatusSchema>;

export const couponStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'ARCHIVED',
]);

export type CouponStatusInput = z.infer<typeof couponStatusSchema>;

export const adminOrdersQuerySchema = paginationQuerySchema.extend({
  status: orderStatusSchema.optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

export const adminTransitionOrderSchema = z.strictObject({
  toStatus: orderStatusSchema,
  reason: z.string().trim().min(1).max(255).optional(),
});

export type AdminTransitionOrderRequest = z.infer<typeof adminTransitionOrderSchema>;

export const adminCreateShipmentSchema = z.strictObject({
  provider: z.enum(['jne-adapter', 'sicepat-adapter']),
  serviceCode: z.string().trim().min(1, 'Service code is required').max(64),
  warehouseCode: z
    .string()
    .trim()
    .min(2, 'Warehouse code must be at least 2 characters')
    .max(32, 'Warehouse code must be at most 32 characters')
    .default('JKT-MAIN-01'),
});

export type AdminCreateShipmentRequest = z.infer<typeof adminCreateShipmentSchema>;

export const adminCouponsQuerySchema = paginationQuerySchema.extend({
  status: couponStatusSchema.optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export type AdminCouponsQuery = z.infer<typeof adminCouponsQuerySchema>;

const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, 'Coupon code must be at least 3 characters')
  .max(64, 'Coupon code must be at most 64 characters')
  .regex(
    /^[A-Z0-9_-]+$/,
    'Coupon code may only contain uppercase letters, digits, hyphens, and underscores',
  );

export const createCouponSchema = z
  .strictObject({
    code: couponCodeSchema,
    name: z
      .string()
      .trim()
      .min(2, 'Coupon name must be at least 2 characters')
      .max(160, 'Coupon name must be at most 160 characters'),
    discountType: discountTypeSchema,
    discountValue: z
      .number()
      .int('Discount value must be a whole integer')
      .positive('Discount value must be positive'),
    maxDiscountIdr: z
      .number()
      .int('Max discount must be a whole integer')
      .positive('Max discount must be positive')
      .nullable()
      .optional(),
    minOrderSubtotalIdr: z
      .number()
      .int('Minimum order subtotal must be a whole integer')
      .nonnegative('Minimum order subtotal cannot be negative')
      .default(0),
    usageLimitTotal: z
      .number()
      .int('Total usage limit must be a whole integer')
      .positive('Total usage limit must be positive')
      .nullable()
      .optional(),
    usageLimitPerUser: z
      .number()
      .int('Per-user usage limit must be a whole integer')
      .positive('Per-user usage limit must be positive')
      .nullable()
      .optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED']).default('DRAFT'),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === 'PERCENTAGE' && data.discountValue > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'Percentage discount value cannot exceed 100',
      });
    }
    const startsAtMs = Date.parse(data.startsAt);
    const endsAtMs = Date.parse(data.endsAt);
    if (!Number.isNaN(startsAtMs) && !Number.isNaN(endsAtMs) && endsAtMs <= startsAtMs) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'endsAt must be after startsAt',
      });
    }
  });

export type CreateCouponRequest = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = z
  .strictObject({
    code: couponCodeSchema.optional(),
    name: z
      .string()
      .trim()
      .min(2, 'Coupon name must be at least 2 characters')
      .max(160, 'Coupon name must be at most 160 characters')
      .optional(),
    discountType: discountTypeSchema.optional(),
    discountValue: z
      .number()
      .int('Discount value must be a whole integer')
      .positive('Discount value must be positive')
      .optional(),
    maxDiscountIdr: z
      .number()
      .int('Max discount must be a whole integer')
      .positive('Max discount must be positive')
      .nullable()
      .optional(),
    minOrderSubtotalIdr: z
      .number()
      .int('Minimum order subtotal must be a whole integer')
      .nonnegative('Minimum order subtotal cannot be negative')
      .optional(),
    usageLimitTotal: z
      .number()
      .int('Total usage limit must be a whole integer')
      .positive('Total usage limit must be positive')
      .nullable()
      .optional(),
    usageLimitPerUser: z
      .number()
      .int('Per-user usage limit must be a whole integer')
      .positive('Per-user usage limit must be positive')
      .nullable()
      .optional(),
    status: couponStatusSchema.optional(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    endsAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'At least one coupon field must be provided',
      });
    }
    if (
      data.discountType === 'PERCENTAGE' &&
      data.discountValue !== undefined &&
      data.discountValue > 100
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'Percentage discount value cannot exceed 100',
      });
    }
    if (data.startsAt !== undefined && data.endsAt !== undefined) {
      const startsAtMs = Date.parse(data.startsAt);
      const endsAtMs = Date.parse(data.endsAt);
      if (!Number.isNaN(startsAtMs) && !Number.isNaN(endsAtMs) && endsAtMs <= startsAtMs) {
        ctx.addIssue({
          code: 'custom',
          path: ['endsAt'],
          message: 'endsAt must be after startsAt',
        });
      }
    }
  });

export type UpdateCouponRequest = z.infer<typeof updateCouponSchema>;

export const analyticsSalesQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type AnalyticsSalesQuery = z.infer<typeof analyticsSalesQuerySchema>;
