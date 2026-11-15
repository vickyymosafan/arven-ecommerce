import { afterEach, describe, expect, it, vi } from 'vitest';
import { storefrontApi } from '../src/lib/api-client.js';

describe('storefrontApi public catalog methods', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds filtered /api/v1/products query string and returns paginated metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: 'prod-1',
              slug: 'essential-heavyweight-tee',
              name: 'Essential Heavyweight Tee',
              description: 'Heavy cotton tee.',
              material: '100% Combed Cotton',
              fit: 'Relaxed Fit',
              priceIdr: 299000,
              compareAtPriceIdr: null,
              isFeatured: true,
              has3dEnabled: false,
              inStock: true,
              stockStatus: 'IN_STOCK',
              primaryCategory: { id: 'cat-1', slug: 'tops', name: 'Tops' },
              collections: [],
              primaryMedia: null,
              availableSizes: ['M', 'L'],
              availableColors: [{ color: 'Charcoal', colorHex: '#17191B' }],
              publishedAt: '2026-11-15T00:00:00.000Z',
            },
          ],
          meta: {
            requestId: 'req-cat-1',
            page: 2,
            limit: 12,
            total: 15,
            totalPages: 2,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const result = await storefrontApi.getProducts({
      page: 2,
      category: 'tops',
      size: 'M',
      inStock: true,
      q: 'heavyweight',
      sort: 'price_asc',
    });

    expect(result.items).toHaveLength(1);
    expect(result.meta.page).toBe(2);
    expect(result.meta.total).toBe(15);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/v1/products?page=2&category=tops&size=M&inStock=true&q=heavyweight&sort=price_asc',
    );
  });

  it('fetches product detail by URL-encoded slug', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 'prod-1',
            slug: 'essential-heavyweight-tee',
            name: 'Essential Heavyweight Tee',
          },
          meta: { requestId: 'req-pdp' },
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const detail = await storefrontApi.getProductBySlug('essential-heavyweight-tee');
    expect(detail.slug).toBe('essential-heavyweight-tee');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/products/essential-heavyweight-tee');
  });
});
