import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CheckoutQuoteDto,
  CreateOrderResultDto,
  OrderDetailDto,
  OrderSummaryDto,
  PaymentSessionDto,
  PaymentSummaryDto,
} from '@arven/contracts';
import {
  CART_UPDATED_EVENT,
  clearCsrfTokenCache,
  createIdempotencyKey,
  readGuestOrderToken,
  saveGuestOrderToken,
  storefrontApi,
} from '../src/lib/api-client.js';

const SAMPLE_QUOTE: CheckoutQuoteDto = {
  currency: 'IDR',
  warehouseCode: 'JKT-MAIN-01',
  totalWeightGrams: 500,
  items: [
    {
      variantId: '33333333-3333-4333-8333-333333333333',
      sku: 'ARV-TEE-BLK-M',
      productId: '44444444-4444-4444-8444-444444444444',
      productSlug: 'essential-heavyweight-tee',
      productName: 'Essential Heavyweight Tee',
      size: 'M',
      color: 'Charcoal',
      unitPriceIdr: 299000,
      quantity: 1,
      discountAllocatedIdr: 29900,
      lineTotalIdr: 269100,
      availableQuantity: 8,
      primaryImageUrl: null,
    },
  ],
  shippingOptions: [
    {
      provider: 'jne-adapter',
      serviceCode: 'REG',
      serviceName: 'JNE Reguler',
      costIdr: 18000,
      estimatedMinDays: 1,
      estimatedMaxDays: 2,
    },
  ],
  selectedShipping: {
    provider: 'jne-adapter',
    serviceCode: 'REG',
    serviceName: 'JNE Reguler',
    costIdr: 18000,
    estimatedMinDays: 1,
    estimatedMaxDays: 2,
  },
  subtotalIdr: 299000,
  discountTotalIdr: 29900,
  shippingTotalIdr: 18000,
  taxTotalIdr: 0,
  grandTotalIdr: 287100,
  appliedCoupon: {
    code: 'WELCOME10',
    name: 'Welcome 10%',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    discountAppliedIdr: 29900,
  },
  quoteExpiresAt: '2026-11-16T09:00:00.000Z',
};

const SAMPLE_PAYMENT: PaymentSummaryDto = {
  id: '55555555-5555-4555-8555-555555555555',
  orderId: '66666666-6666-4666-8666-666666666666',
  provider: 'midtrans',
  providerReference: 'ARV-20261116-ABCD1234-99887766',
  providerTransactionId: null,
  method: null,
  status: 'PENDING',
  amountIdr: 287100,
  currency: 'IDR',
  snapToken: 'stub-snap-123456',
  redirectUrl: 'http://127.0.0.1:3000/checkout/payment-stub?ref=ARV-20261116-ABCD1234-99887766',
  expiresAt: '2026-11-16T09:00:00.000Z',
  settledAt: null,
  failureReason: null,
  createdAt: '2026-11-16T08:45:00.000Z',
  updatedAt: '2026-11-16T08:45:00.000Z',
};

const SAMPLE_ORDER_DETAIL: OrderDetailDto = {
  id: '66666666-6666-4666-8666-666666666666',
  orderNumber: 'ARV-20261116-ABCD1234',
  isGuest: true,
  guestEmail: 'client@arven.id',
  status: 'PENDING_PAYMENT',
  currency: 'IDR',
  subtotalIdr: 299000,
  discountTotalIdr: 29900,
  shippingTotalIdr: 18000,
  taxTotalIdr: 0,
  grandTotalIdr: 287100,
  shippingProvider: 'jne-adapter',
  shippingService: 'REG',
  couponCodeSnapshot: 'WELCOME10',
  addressSnapshot: {
    recipientName: 'Siti Rahmawati',
    phone: '+6281234567890',
    line1: 'Jl. Senopati No. 18',
    line2: null,
    subdistrict: 'Kebayoran Baru',
    city: 'Jakarta Selatan',
    province: 'DKI Jakarta',
    postalCode: '12190',
    countryCode: 'ID',
  },
  items: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      variantId: '33333333-3333-4333-8333-333333333333',
      sku: 'ARV-TEE-BLK-M',
      productName: 'Essential Heavyweight Tee',
      size: 'M',
      color: 'Charcoal',
      unitPriceIdr: 299000,
      discountAllocatedIdr: 29900,
      quantity: 1,
      lineTotalIdr: 269100,
      configuration: {},
    },
  ],
  statusHistory: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      fromStatus: null,
      toStatus: 'PENDING_PAYMENT',
      reason: 'Order placed',
      actorType: 'GUEST',
      createdAt: '2026-11-16T08:45:00.000Z',
    },
  ],
  latestPayment: SAMPLE_PAYMENT,
  payments: [SAMPLE_PAYMENT],
  paymentExpiresAt: '2026-11-16T09:00:00.000Z',
  paidAt: null,
  createdAt: '2026-11-16T08:45:00.000Z',
  updatedAt: '2026-11-16T08:45:00.000Z',
};

describe('storefrontApi Phase 05 checkout, orders, and payment methods', () => {
  afterEach(() => {
    clearCsrfTokenCache();
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('generates valid idempotency keys (16..128 chars) with fallback when randomUUID is absent', () => {
    const key1 = createIdempotencyKey();
    const key2 = createIdempotencyKey();

    expect(key1.length).toBeGreaterThanOrEqual(16);
    expect(key1.length).toBeLessThanOrEqual(128);
    expect(key2).not.toBe(key1);

    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = i + 1;
        }
        return arr;
      },
    });
    const fallbackKey = createIdempotencyKey();
    expect(fallbackKey.length).toBeGreaterThanOrEqual(16);
    expect(fallbackKey.length).toBeLessThanOrEqual(128);
    vi.stubGlobal('crypto', originalCrypto);
  });

  it('stores and reads guest order tokens strictly in sessionStorage', () => {
    saveGuestOrderToken('ARV-20261116-ABCD1234', '  guest-secret-token-xyz  ');

    expect(window.sessionStorage.getItem('arven:guest-order:ARV-20261116-ABCD1234')).toBe(
      'guest-secret-token-xyz',
    );
    expect(window.localStorage.getItem('arven:guest-order:ARV-20261116-ABCD1234')).toBeNull();
    expect(readGuestOrderToken('ARV-20261116-ABCD1234')).toBe('guest-secret-token-xyz');
    expect(readGuestOrderToken('ARV-MISSING')).toBeNull();
  });

  it('quotes checkout and creates order with Idempotency-Key while dispatching arven:cart-updated', async () => {
    const createOrderResult: CreateOrderResultDto = {
      order: SAMPLE_ORDER_DETAIL,
      guestToken: 'guest-token-once-123456',
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-checkout-1' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: SAMPLE_QUOTE,
            meta: { requestId: 'req-quote' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: createOrderResult,
            meta: { requestId: 'req-create-order' },
          }),
          { status: 201 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const cartEvents: Event[] = [];
    const listener = (event: Event) => {
      cartEvents.push(event);
    };
    window.addEventListener(CART_UPDATED_EVENT, listener);

    const quote = await storefrontApi.quoteCheckout({
      items: [{ variantId: '33333333-3333-4333-8333-333333333333', quantity: 1 }],
      couponCode: 'WELCOME10',
    });
    expect(quote.grandTotalIdr).toBe(287100);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/checkout/quote');

    const result = await storefrontApi.createOrder(
      {
        guestEmail: 'client@arven.id',
        guestAddress: {
          recipientName: SAMPLE_ORDER_DETAIL.addressSnapshot.recipientName,
          phone: SAMPLE_ORDER_DETAIL.addressSnapshot.phone,
          line1: SAMPLE_ORDER_DETAIL.addressSnapshot.line1,
          city: SAMPLE_ORDER_DETAIL.addressSnapshot.city,
          province: SAMPLE_ORDER_DETAIL.addressSnapshot.province,
          postalCode: SAMPLE_ORDER_DETAIL.addressSnapshot.postalCode,
          countryCode: 'ID',
        },
        shipping: { provider: 'jne-adapter', service: 'REG' },
        couponCode: 'WELCOME10',
        items: [{ variantId: '33333333-3333-4333-8333-333333333333', quantity: 1 }],
      },
      'idem-order-key-0001',
    );

    window.removeEventListener(CART_UPDATED_EVENT, listener);

    expect(result.order.orderNumber).toBe('ARV-20261116-ABCD1234');
    expect(result.guestToken).toBe('guest-token-once-123456');
    expect(cartEvents).toHaveLength(1);

    const orderInit = fetchMock.mock.calls[2]?.[1];
    const orderHeaders = new Headers(orderInit?.headers);
    expect(orderHeaders.get('idempotency-key')).toBe('idem-order-key-0001');
    expect(orderHeaders.get('x-csrf-token')).toBe('csrf-checkout-1');
  });

  it('lists customer orders with pagination metadata and queries guest-scoped order & payment endpoints', async () => {
    const orderSummary: OrderSummaryDto = {
      id: SAMPLE_ORDER_DETAIL.id,
      orderNumber: SAMPLE_ORDER_DETAIL.orderNumber,
      status: 'PENDING_PAYMENT',
      currency: 'IDR',
      itemCount: 1,
      totalQuantity: 1,
      subtotalIdr: 299000,
      discountTotalIdr: 29900,
      shippingTotalIdr: 18000,
      taxTotalIdr: 0,
      grandTotalIdr: 287100,
      shippingProvider: 'jne-adapter',
      shippingService: 'REG',
      paymentExpiresAt: '2026-11-16T09:00:00.000Z',
      paidAt: null,
      createdAt: '2026-11-16T08:45:00.000Z',
      updatedAt: '2026-11-16T08:45:00.000Z',
    };

    const paymentSession: PaymentSessionDto = {
      paymentId: SAMPLE_PAYMENT.id,
      orderId: SAMPLE_ORDER_DETAIL.id,
      orderNumber: SAMPLE_ORDER_DETAIL.orderNumber,
      provider: 'midtrans',
      providerReference: SAMPLE_PAYMENT.providerReference,
      status: 'PENDING',
      amountIdr: 287100,
      currency: 'IDR',
      snapToken: SAMPLE_PAYMENT.snapToken,
      redirectUrl: SAMPLE_PAYMENT.redirectUrl,
      expiresAt: SAMPLE_PAYMENT.expiresAt,
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [orderSummary],
            meta: { requestId: 'req-list', page: 2, limit: 10, total: 14, totalPages: 2 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: SAMPLE_ORDER_DETAIL,
            meta: { requestId: 'req-detail' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-pay-1' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: paymentSession,
            meta: { requestId: 'req-pay-session' },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: SAMPLE_PAYMENT,
            meta: { requestId: 'req-pay-summary' },
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const list = await storefrontApi.listMyOrders({
      page: 2,
      limit: 10,
      status: 'PENDING_PAYMENT',
    });
    expect(list.items).toHaveLength(1);
    expect(list.meta.totalPages).toBe(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/v1/orders?page=2&limit=10&status=PENDING_PAYMENT',
    );

    const detail = await storefrontApi.getOrderDetail(
      'ARV-20261116-ABCD1234',
      'guest-token-xyz-987654',
    );
    expect(detail.orderNumber).toBe('ARV-20261116-ABCD1234');
    const detailHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(detailHeaders.get('x-guest-order-token')).toBe('guest-token-xyz-987654');

    const session = await storefrontApi.createPaymentSession(
      SAMPLE_ORDER_DETAIL.id,
      'idem-pay-key-0002',
      {},
      'guest-token-xyz-987654',
    );
    expect(session.snapToken).toBe('stub-snap-123456');
    const payHeaders = new Headers(fetchMock.mock.calls[3]?.[1]?.headers);
    expect(payHeaders.get('idempotency-key')).toBe('idem-pay-key-0002');
    expect(payHeaders.get('x-guest-order-token')).toBe('guest-token-xyz-987654');

    const summary = await storefrontApi.getPaymentSummary(
      SAMPLE_PAYMENT.id,
      'guest-token-xyz-987654',
    );
    expect(summary.status).toBe('PENDING');
    const summaryHeaders = new Headers(fetchMock.mock.calls[4]?.[1]?.headers);
    expect(summaryHeaders.get('x-guest-order-token')).toBe('guest-token-xyz-987654');
  });

  it('preserves Idempotency-Key and X-Guest-Order-Token across CSRF 403 retry on cancelOrder', async () => {
    const cancelledOrder: OrderDetailDto = {
      ...SAMPLE_ORDER_DETAIL,
      status: 'CANCELLED',
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'stale-csrf' },
            meta: { requestId: 'req-1' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'CSRF_TOKEN_INVALID', message: 'Expired CSRF token' },
            meta: { requestId: 'req-2' },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'fresh-csrf' },
            meta: { requestId: 'req-3' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: cancelledOrder,
            meta: { requestId: 'req-4' },
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const updated = await storefrontApi.cancelOrder(
      SAMPLE_ORDER_DETAIL.id,
      'idem-cancel-key-0003',
      { reason: 'Adjusting size' },
      'guest-token-xyz-987654',
    );

    expect(updated.status).toBe('CANCELLED');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const retryHeaders = new Headers(fetchMock.mock.calls[3]?.[1]?.headers);
    expect(retryHeaders.get('x-csrf-token')).toBe('fresh-csrf');
    expect(retryHeaders.get('idempotency-key')).toBe('idem-cancel-key-0003');
    expect(retryHeaders.get('x-guest-order-token')).toBe('guest-token-xyz-987654');
  });
});
