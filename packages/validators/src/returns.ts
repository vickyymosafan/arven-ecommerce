import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const returnStatusSchema = z.enum([
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'RECEIVED',
  'REFUNDED',
  'CLOSED',
]);

export type ReturnStatusInput = z.infer<typeof returnStatusSchema>;

export const returnItemConditionSchema = z.enum([
  'UNOPENED',
  'GOOD',
  'DAMAGED',
  'DEFECTIVE',
]);

export type ReturnItemConditionInput = z.infer<typeof returnItemConditionSchema>;

export const refundStatusSchema = z.enum([
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'REJECTED',
]);

export type RefundStatusInput = z.infer<typeof refundStatusSchema>;

export const customerReturnItemInputSchema = z.strictObject({
  orderItemId: uuidSchema,
  quantity: z
    .number()
    .int('Return quantity must be a whole integer')
    .min(1, 'Return quantity must be at least 1'),
});

export type CustomerReturnItemInput = z.infer<typeof customerReturnItemInputSchema>;

export const createCustomerReturnSchema = z
  .strictObject({
    reason: z
      .string()
      .trim()
      .min(3, 'Return reason must be at least 3 characters')
      .max(120, 'Return reason must be at most 120 characters'),
    customerNotes: z
      .string()
      .trim()
      .max(1000, 'Customer notes must be at most 1000 characters')
      .optional(),
    items: z
      .array(customerReturnItemInputSchema)
      .min(1, 'At least one return item is required')
      .max(50, 'Maximum 50 return items per request'),
  })
  .refine(
    (data) =>
      new Set(data.items.map((item) => item.orderItemId)).size === data.items.length,
    {
      message: 'Duplicate orderItemId entries are not allowed',
      path: ['items'],
    },
  );

export type CreateCustomerReturnRequest = z.infer<typeof createCustomerReturnSchema>;

export const adminReturnsQuerySchema = paginationQuerySchema.extend({
  status: returnStatusSchema.optional(),
});

export type AdminReturnsQuery = z.infer<typeof adminReturnsQuerySchema>;

export const reviewReturnSchema = z.strictObject({
  notes: z.string().trim().max(500).optional(),
});

export type ReviewReturnRequest = z.infer<typeof reviewReturnSchema>;

export const approveReturnSchema = z.strictObject({
  decision: z.enum(['APPROVE', 'REJECT']),
  adminNotes: z.string().trim().max(500).optional(),
});

export type ApproveReturnRequest = z.infer<typeof approveReturnSchema>;

export const receiveReturnItemSchema = z.strictObject({
  returnItemId: uuidSchema,
  condition: returnItemConditionSchema,
  restock: z.boolean(),
});

export type ReceiveReturnItemInput = z.infer<typeof receiveReturnItemSchema>;

export const receiveReturnSchema = z
  .strictObject({
    warehouseCode: z
      .string()
      .trim()
      .min(2, 'Warehouse code must be at least 2 characters')
      .max(32, 'Warehouse code must be at most 32 characters')
      .optional(),
    adminNotes: z.string().trim().max(500).optional(),
    items: z
      .array(receiveReturnItemSchema)
      .min(1, 'At least one inspected return item is required')
      .max(50, 'Maximum 50 return items per receipt'),
  })
  .refine(
    (data) =>
      new Set(data.items.map((item) => item.returnItemId)).size === data.items.length,
    {
      message: 'Duplicate returnItemId entries are not allowed',
      path: ['items'],
    },
  );

export type ReceiveReturnRequest = z.infer<typeof receiveReturnSchema>;

export const adminRefundsQuerySchema = paginationQuerySchema.extend({
  status: refundStatusSchema.optional(),
});

export type AdminRefundsQuery = z.infer<typeof adminRefundsQuerySchema>;

export const requestRefundSchema = z.strictObject({
  amountIdr: z
    .number()
    .int('Refund amount must be a whole integer')
    .positive('Refund amount must be a positive integer'),
  reason: z
    .string()
    .trim()
    .min(3, 'Refund reason must be at least 3 characters')
    .max(500, 'Refund reason must be at most 500 characters'),
  returnId: uuidSchema.optional(),
});

export type RequestRefundInput = z.infer<typeof requestRefundSchema>;

export const approveRefundSchema = z.strictObject({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().trim().max(500).optional(),
});

export type ApproveRefundInput = z.infer<typeof approveRefundSchema>;
