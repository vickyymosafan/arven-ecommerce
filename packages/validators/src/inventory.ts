import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

const queryBooleanSchema = z
  .union([
    z.boolean(),
    z
      .enum(['true', 'false', '1', '0'])
      .transform((val) => val === 'true' || val === '1'),
  ])
  .optional();

export const warehouseStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type WarehouseStatusInput = z.infer<typeof warehouseStatusSchema>;

export const inventoryMovementTypeSchema = z.enum([
  'RECEIPT',
  'RESERVATION',
  'RELEASE',
  'SALE',
  'ADJUSTMENT',
  'RETURN_TO_STOCK',
]);
export type InventoryMovementTypeInput = z.infer<typeof inventoryMovementTypeSchema>;

export const adminManualMovementTypeSchema = z.enum(['RECEIPT', 'ADJUSTMENT']);
export type AdminManualMovementTypeInput = z.infer<typeof adminManualMovementTypeSchema>;

export const stockReservationStatusSchema = z.enum([
  'ACTIVE',
  'RELEASED',
  'COMMITTED',
  'EXPIRED',
]);
export type StockReservationStatusInput = z.infer<typeof stockReservationStatusSchema>;

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16, 'Idempotency-Key header must be between 16 and 128 characters')
  .max(128, 'Idempotency-Key header must be between 16 and 128 characters')
  .regex(
    /^[a-zA-Z0-9._:-]+$/,
    'Idempotency-Key header may only contain alphanumeric, period, underscore, colon, or hyphen characters',
  );

export const adminInventoryLevelsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  warehouseCode: z.string().trim().max(32).optional(),
  lowStockOnly: queryBooleanSchema,
});

export type AdminInventoryLevelsQuery = z.infer<typeof adminInventoryLevelsQuerySchema>;

export const adminInventoryMovementsQuerySchema = paginationQuerySchema.extend({
  variantId: uuidSchema.optional(),
  warehouseCode: z.string().trim().max(32).optional(),
  type: inventoryMovementTypeSchema.optional(),
  referenceType: z.string().trim().max(64).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export type AdminInventoryMovementsQuery = z.infer<typeof adminInventoryMovementsQuerySchema>;

export const adminStockReservationsQuerySchema = paginationQuerySchema.extend({
  status: stockReservationStatusSchema.optional(),
  variantId: uuidSchema.optional(),
  warehouseCode: z.string().trim().max(32).optional(),
});

export type AdminStockReservationsQuery = z.infer<typeof adminStockReservationsQuerySchema>;

export const createAdminStockMovementSchema = z
  .strictObject({
    warehouseCode: z
      .string()
      .trim()
      .min(2, 'Warehouse code must be at least 2 characters')
      .max(32, 'Warehouse code must be at most 32 characters')
      .default('JKT-MAIN-01'),
    variantId: uuidSchema,
    type: adminManualMovementTypeSchema,
    quantityDelta: z
      .number()
      .int('Quantity delta must be a whole integer')
      .min(-100_000, 'Quantity delta cannot be less than -100,000')
      .max(100_000, 'Quantity delta cannot exceed 100,000')
      .refine((value) => value !== 0, 'Quantity delta cannot be zero'),
    referenceType: z
      .string()
      .trim()
      .min(2, 'Reference type must be at least 2 characters')
      .max(64, 'Reference type must be at most 64 characters')
      .default('MANUAL_ADMIN'),
    referenceId: uuidSchema.nullish(),
    reason: z
      .string()
      .trim()
      .max(255, 'Reason must be at most 255 characters')
      .nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'RECEIPT' && data.quantityDelta <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantityDelta'],
        message: 'Stock receipt quantity delta must be positive',
      });
    }
    if (data.type === 'ADJUSTMENT' && (!data.reason || data.reason.trim().length < 3)) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Reason must be at least 3 characters for manual stock adjustments',
      });
    }
  });

export type CreateAdminStockMovementRequest = z.infer<typeof createAdminStockMovementSchema>;
