import { describe, expect, it } from 'vitest';
import {
  cancelOrderRequestSchema,
  checkoutGuestAddressSchema,
  checkoutQuoteRequestSchema,
  createOrderRequestSchema,
  createPaymentSessionRequestSchema,
  listOrdersQuerySchema,
  midtransWebhookPayloadSchema,
  orderIdParamSchema,
  orderNumberParamSchema,
  paymentIdParamSchema,
} from '../src/index.js';

const validVariantId = '9a1e3c7b-51d2-4d30-b84c-2a7c89c2e912';
const validAddressId = '4c2d1f8a-8c34-4a91-9b1f-3a57d19d7a01';
const validPresetId = 'f219e4a0-7218-4b5a-a224-119b82a54f09';

const validGuestAddress = {
  recipientName: 'Nadia Kartika',
  phone: '0812-3456-7890',
  line1: 'Jl. Kemang Raya No. 45',
  line2: 'Apt 4B',
  subdistrict: 'Mampang Prapatan',
  city: 'Jakarta Selatan',
  province: 'DKI Jakarta',
  postalCode: '12730',
};

describe('@arven/validators Phase 05 checkout, orders, and payments schemas', () => {
  it('validates checkout quote requests and enforces strict mass-assignment rejection (T-03)', () => {
    const validQuote = checkoutQuoteRequestSchema.safeParse({
      addressId: validAddressId,
      shipping: { provider: 'jne-adapter', service: 'REG' },
      couponCode: 'WELCOME10',
      items: [
        {
          variantId: validVariantId,
          quantity: 2,
          customization: { colorPresetId: validPresetId },
        },
      ],
    });
    expect(validQuote.success).toBe(true);

    const injectedPrice = checkoutQuoteRequestSchema.safeParse({
      addressId: validAddressId,
      items: [{ variantId: validVariantId, quantity: 1 }],
      unitPrice: 1,
      total: 1,
    });
    expect(injectedPrice.success).toBe(false);

    const injectedItemPrice = checkoutQuoteRequestSchema.safeParse({
      addressId: validAddressId,
      items: [{ variantId: validVariantId, quantity: 1, unitPriceIdr: 1 }],
    });
    expect(injectedItemPrice.success).toBe(false);

    const injectedCustomizationKey = checkoutQuoteRequestSchema.safeParse({
      addressId: validAddressId,
      items: [
        {
          variantId: validVariantId,
          quantity: 1,
          customization: { colorPresetId: validPresetId, priceOverride: 0 },
        },
      ],
    });
    expect(injectedCustomizationKey.success).toBe(false);
  });

  it('rejects invalid UUIDs, negative or excessive quantities, and >50 line items', () => {
    expect(
      checkoutQuoteRequestSchema.safeParse({
        items: [{ variantId: 'not-a-uuid', quantity: 1 }],
      }).success,
    ).toBe(false);

    expect(
      checkoutQuoteRequestSchema.safeParse({
        items: [{ variantId: validVariantId, quantity: -1 }],
      }).success,
    ).toBe(false);

    expect(
      checkoutQuoteRequestSchema.safeParse({
        items: [{ variantId: validVariantId, quantity: 0 }],
      }).success,
    ).toBe(false);

    expect(
      checkoutQuoteRequestSchema.safeParse({
        items: [{ variantId: validVariantId, quantity: 100 }],
      }).success,
    ).toBe(false);

    expect(
      checkoutQuoteRequestSchema.safeParse({
        items: [],
      }).success,
    ).toBe(false);

    const fiftyOneItems = Array.from({ length: 51 }, () => ({
      variantId: validVariantId,
      quantity: 1,
    }));
    expect(
      checkoutQuoteRequestSchema.safeParse({
        items: fiftyOneItems,
      }).success,
    ).toBe(false);
  });

  it('validates createOrderRequestSchema for both saved-address and guest checkout flows', () => {
    const userOrder = createOrderRequestSchema.safeParse({
      addressId: validAddressId,
      shipping: { provider: 'jne-adapter', service: 'REG' },
      items: [{ variantId: validVariantId, quantity: 1 }],
    });
    expect(userOrder.success).toBe(true);

    const guestOrder = createOrderRequestSchema.safeParse({
      guestEmail: '  GUEST@Arven.ID ',
      guestAddress: validGuestAddress,
      shipping: { provider: 'sicepat-adapter', service: 'BEST' },
      couponCode: 'WELCOME10',
      items: [{ variantId: validVariantId, quantity: 2 }],
    });
    expect(guestOrder.success).toBe(true);
    if (guestOrder.success) {
      expect(guestOrder.data.guestEmail).toBe('guest@arven.id');
      expect(guestOrder.data.guestAddress?.countryCode).toBe('ID');
      expect(guestOrder.data.guestAddress?.phone).toBe('081234567890');
    }

    const missingGuestFields = createOrderRequestSchema.safeParse({
      shipping: { provider: 'jne-adapter', service: 'REG' },
      items: [{ variantId: validVariantId, quantity: 1 }],
    });
    expect(missingGuestFields.success).toBe(false);
    if (!missingGuestFields.success) {
      const paths = missingGuestFields.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('guestEmail');
      expect(paths).toContain('guestAddress');
    }

    const injectedOrderFields = createOrderRequestSchema.safeParse({
      addressId: validAddressId,
      shipping: { provider: 'jne-adapter', service: 'REG' },
      items: [{ variantId: validVariantId, quantity: 1 }],
      status: 'PAID',
      discountAmount: 999999,
      userId: validAddressId,
      roles: ['OWNER'],
    });
    expect(injectedOrderFields.success).toBe(false);

    expect(
      checkoutGuestAddressSchema.safeParse({
        ...validGuestAddress,
        countryCode: 'SG',
      }).success,
    ).toBe(false);
  });

  it('validates order queries, cancellation, payment session, params, and Midtrans passthrough webhook', () => {
    const query = listOrdersQuerySchema.safeParse({
      page: '2',
      limit: '10',
      status: 'PENDING_PAYMENT',
    });
    expect(query.success).toBe(true);
    expect(
      listOrdersQuerySchema.safeParse({ page: 1, limit: 10, userId: validAddressId }).success,
    ).toBe(false);

    expect(cancelOrderRequestSchema.safeParse({ reason: 'Changed mind' }).success).toBe(true);
    expect(cancelOrderRequestSchema.safeParse({ reason: 'no' }).success).toBe(false);
    expect(
      cancelOrderRequestSchema.safeParse({ reason: 'Changed mind', status: 'CANCELLED' }).success,
    ).toBe(false);

    expect(
      createPaymentSessionRequestSchema.safeParse({ preferredMethod: 'qris' }).success,
    ).toBe(true);
    expect(
      createPaymentSessionRequestSchema.safeParse({ amountIdr: 1 }).success,
    ).toBe(false);

    const webhook = midtransWebhookPayloadSchema.safeParse({
      order_id: 'ARV-20261116-000001',
      status_code: '200',
      gross_amount: '287100.00',
      transaction_status: 'settlement',
      transaction_id: 'mt-tx-990011',
      signature_key: 'a'.repeat(128),
      payment_type: 'qris',
      fraud_status: 'accept',
      settlement_time: '2026-11-16 14:30:00',
      acquirer: 'gopay',
      currency: 'IDR',
    });
    expect(webhook.success).toBe(true);
    if (webhook.success) {
      expect(webhook.data.acquirer).toBe('gopay');
    }

    expect(
      orderNumberParamSchema.safeParse({ orderNumber: 'ARV-20261116-000001' }).success,
    ).toBe(true);
    expect(
      orderNumberParamSchema.safeParse({ orderNumber: 'bad order!' }).success,
    ).toBe(false);
    expect(orderIdParamSchema.safeParse({ orderId: validAddressId }).success).toBe(true);
    expect(paymentIdParamSchema.safeParse({ id: validVariantId }).success).toBe(true);

    const jsonSchema = createOrderRequestSchema['~standard'].jsonSchema.input({
      target: 'openapi-3.0',
    });
    expect(jsonSchema).toHaveProperty('type', 'object');
  });
});
