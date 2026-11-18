import { z } from 'zod';
import {
  emailSchema,
  fullNameSchema,
  paginationQuerySchema,
  phoneSchema,
  uuidSchema,
} from './common.js';

export const orderStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'RETURN_REQUESTED',
  'RETURN_APPROVED',
  'RETURNED',
]);

export type OrderStatusInput = z.infer<typeof orderStatusSchema>;

export const paymentStatusSchema = z.enum([
  'PENDING',
  'AUTHORIZED',
  'SETTLEMENT',
  'FAILED',
  'EXPIRED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

export type PaymentStatusInput = z.infer<typeof paymentStatusSchema>;

export const discountTypeSchema = z.enum([
  'PERCENTAGE',
  'FIXED_AMOUNT',
  'FREE_SHIPPING',
]);

export type DiscountTypeInput = z.infer<typeof discountTypeSchema>;

export const checkoutShippingSelectionSchema = z.strictObject({
  provider: z.string().trim().min(1, 'Shipping provider is required').max(64),
  service: z.string().trim().min(1, 'Shipping service is required').max(64),
});

export type CheckoutShippingSelection = z.infer<
  typeof checkoutShippingSelectionSchema
>;

export const checkoutGuestAddressSchema = z.strictObject({
  recipientName: fullNameSchema,
  phone: phoneSchema,
  line1: z.string().trim().min(5, 'Address line 1 is required').max(255),
  line2: z.string().trim().max(255).optional(),
  subdistrict: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2, 'City is required').max(120),
  province: z.string().trim().min(2, 'Province is required').max(120),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{4,10}$/, 'Invalid postal code'),
  countryCode: z.literal('ID').default('ID'),
});

export type CheckoutGuestAddress = z.infer<typeof checkoutGuestAddressSchema>;

export const checkoutItemCustomizationSchema = z.strictObject({
  colorPresetId: uuidSchema.optional(),
});

export type CheckoutItemCustomization = z.infer<
  typeof checkoutItemCustomizationSchema
>;

export const checkoutLineItemInputSchema = z.strictObject({
  variantId: uuidSchema,
  quantity: z
    .number()
    .int('Quantity must be a whole integer')
    .min(1, 'Quantity must be at least 1')
    .max(99, 'Maximum quantity per line item is 99'),
  customization: checkoutItemCustomizationSchema.optional(),
});

export type CheckoutLineItemInput = z.infer<
  typeof checkoutLineItemInputSchema
>;

export const checkoutQuoteRequestSchema = z.strictObject({
  addressId: uuidSchema.optional(),
  guestAddress: checkoutGuestAddressSchema.optional(),
  shipping: checkoutShippingSelectionSchema.optional(),
  couponCode: z.string().trim().min(2).max(64).optional(),
  items: z
    .array(checkoutLineItemInputSchema)
    .min(1, 'At least one item is required')
    .max(50, 'Maximum 50 line items per checkout'),
});

export type CheckoutQuoteRequest = z.infer<typeof checkoutQuoteRequestSchema>;

export const createOrderRequestSchema = z
  .strictObject({
    addressId: uuidSchema.optional(),
    guestEmail: emailSchema.optional(),
    guestAddress: checkoutGuestAddressSchema.optional(),
    shipping: checkoutShippingSelectionSchema,
    couponCode: z.string().trim().min(2).max(64).optional(),
    items: z
      .array(checkoutLineItemInputSchema)
      .min(1, 'At least one item is required')
      .max(50, 'Maximum 50 line items per order'),
  })
  .superRefine((data, ctx) => {
    if (!data.addressId) {
      if (!data.guestEmail) {
        ctx.addIssue({
          code: 'custom',
          path: ['guestEmail'],
          message: 'guestEmail is required when addressId is not provided',
        });
      }
      if (!data.guestAddress) {
        ctx.addIssue({
          code: 'custom',
          path: ['guestAddress'],
          message: 'guestAddress is required when addressId is not provided',
        });
      }
    }
  });

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: orderStatusSchema.optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const cancelOrderRequestSchema = z.strictObject({
  reason: z.string().trim().min(3).max(255).optional(),
});

export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;

export const createPaymentSessionRequestSchema = z.strictObject({
  preferredMethod: z.string().trim().min(1).max(64).optional(),
});

export type CreatePaymentSessionRequest = z.infer<
  typeof createPaymentSessionRequestSchema
>;

export const midtransWebhookPayloadSchema = z
  .object({
    order_id: z.string().min(1).max(160),
    status_code: z.string().min(1).max(16),
    gross_amount: z.string().min(1).max(32),
    transaction_status: z.string().min(1).max(64),
    transaction_id: z.string().min(1).max(160),
    signature_key: z.string().min(1).max(256),
    payment_type: z.string().min(1).max(64).optional(),
    fraud_status: z.string().min(1).max(64).optional(),
    settlement_time: z.string().min(1).max(64).optional(),
  })
  .passthrough();

export type MidtransWebhookPayload = z.infer<
  typeof midtransWebhookPayloadSchema
>;

export const orderNumberParamSchema = z.strictObject({
  orderNumber: z
    .string()
    .trim()
    .min(4, 'Order number is required')
    .max(32, 'Order number must be at most 32 characters')
    .regex(/^[A-Z0-9-]+$/, 'Invalid order number format'),
});

export type OrderNumberParam = z.infer<typeof orderNumberParamSchema>;

export const orderIdParamSchema = z.strictObject({
  orderId: uuidSchema,
});

export type OrderIdParam = z.infer<typeof orderIdParamSchema>;

export const paymentIdParamSchema = z.strictObject({
  id: uuidSchema,
});

export type PaymentIdParam = z.infer<typeof paymentIdParamSchema>;
