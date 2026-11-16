import { z } from 'zod';
import { uuidSchema } from './common.js';

export const cartStatusSchema = z.enum(['ACTIVE', 'MERGED', 'CONVERTED', 'EXPIRED']);
export type CartStatusInput = z.infer<typeof cartStatusSchema>;

export const cartConfigurationValueSchema = z.union([
  z.string().trim().max(200),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const cartItemConfigurationSchema = z
  .record(z.string().trim().min(1).max(64), cartConfigurationValueSchema)
  .refine(
    (record) => Object.keys(record).length <= 16,
    'Configuration may not contain more than 16 entries',
  )
  .default({});

export type CartItemConfiguration = z.infer<typeof cartItemConfigurationSchema>;

export const addCartItemRequestSchema = z.strictObject({
  variantId: uuidSchema,
  quantity: z
    .number()
    .int('Quantity must be a whole integer')
    .min(1, 'Quantity must be at least 1')
    .max(99, 'Maximum quantity per addition is 99'),
  configuration: cartItemConfigurationSchema.optional(),
});

export type AddCartItemRequest = z.infer<typeof addCartItemRequestSchema>;

export const updateCartItemRequestSchema = z.strictObject({
  quantity: z
    .number()
    .int('Quantity must be a whole integer')
    .min(1, 'Quantity must be at least 1')
    .max(99, 'Maximum quantity per line is 99'),
});

export type UpdateCartItemRequest = z.infer<typeof updateCartItemRequestSchema>;
