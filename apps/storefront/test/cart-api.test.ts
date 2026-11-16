import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CartDto } from '@arven/contracts';
import {
  CART_UPDATED_EVENT,
  clearCsrfTokenCache,
  notifyCartUpdated,
  storefrontApi,
} from '../src/lib/api-client';

const SAMPLE_CART: CartDto = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'ACTIVE',
  ownerType: 'GUEST',
  currency: 'IDR',
  itemCount: 1,
  totalQuantity: 2,
  subtotalIdr: 598000,
  hasUnavailableItems: false,
  items: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      variantId: '33333333-3333-4333-8333-333333333333',
      productId: '44444444-4444-4444-8444-444444444444',
      productSlug: 'essential-heavyweight-tee',
      productName: 'Essential Heavyweight Tee',
      sku: 'ARV-TEE-BLK-M',
      color: 'Charcoal',
      colorHex: '#17191B',
      size: 'M',
      unitPriceIdr: 299000,
      compareAtIdr: null,
      lineSubtotalIdr: 598000,
      quantity: 2,
      availableQty: 8,
      isAvailable: true,
      availabilityStatus: 'IN_STOCK',
      issueCode: null,
      issueMessage: null,
      configuration: {},
      configurationHash: 'empty',
      primaryImageUrl: null,
      primaryImageAlt: null,
      createdAt: '2026-11-15T10:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
    },
  ],
  updatedAt: '2026-11-15T10:00:00.000Z',
};

describe('storefrontApi cart methods and browser sync helper', () => {
  afterEach(() => {
    clearCsrfTokenCache();
    vi.restoreAllMocks();
  });

  it('hydrates cart with credentials included and handles 204 No Content on removeCartItem', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: SAMPLE_CART,
            meta: { requestId: 'req-get-cart' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-cart-1' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal('fetch', fetchMock);

    const cart = await storefrontApi.getCart();
    expect(cart.totalQuantity).toBe(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/cart');
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include');

    await expect(
      storefrontApi.removeCartItem('22222222-2222-4222-8222-222222222222'),
    ).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      '/api/v1/cart/items/22222222-2222-4222-8222-222222222222',
    );
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('DELETE');
    const deleteHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(deleteHeaders.get('x-csrf-token')).toBe('csrf-cart-1');
  });

  it('sends addCartItem, updateCartItem, and mergeGuestCart with CSRF protection', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-cart-2' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: SAMPLE_CART,
            meta: { requestId: 'req-add' },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { ...SAMPLE_CART, totalQuantity: 3 },
            meta: { requestId: 'req-patch' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              merged: true,
              mergedItemCount: 1,
              adjustedItemCount: 0,
              notices: [],
              cart: { ...SAMPLE_CART, ownerType: 'USER' },
            },
            meta: { requestId: 'req-merge' },
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const added = await storefrontApi.addCartItem({
      variantId: '33333333-3333-4333-8333-333333333333',
      quantity: 2,
    });
    expect(added.totalQuantity).toBe(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/cart/items');

    const updated = await storefrontApi.updateCartItem(
      '22222222-2222-4222-8222-222222222222',
      { quantity: 3 },
    );
    expect(updated.totalQuantity).toBe(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      '/api/v1/cart/items/22222222-2222-4222-8222-222222222222',
    );
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('PATCH');

    const merged = await storefrontApi.mergeGuestCart();
    expect(merged.merged).toBe(true);
    expect(merged.cart.ownerType).toBe('USER');
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/v1/cart/merge');
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe('POST');
  });

  it('dispatches arven:cart-updated CustomEvent with optional cart detail', () => {
    const received: Array<CartDto | undefined> = [];
    const listener = (event: Event) => {
      received.push((event as CustomEvent<CartDto | undefined>).detail);
    };

    window.addEventListener(CART_UPDATED_EVENT, listener);
    notifyCartUpdated(SAMPLE_CART);
    notifyCartUpdated();
    window.removeEventListener(CART_UPDATED_EVENT, listener);

    expect(received).toHaveLength(2);
    expect(received[0]?.totalQuantity).toBe(2);
    expect(received[1]).toBeNull();
  });
});
