import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  CartDto,
  Product3DAssetPublicDto,
  ProductDetailDto,
} from '@arven/contracts';
import {
  DEFAULT_ARVEN_MATERIAL_SLOTS,
  DEFAULT_ARVEN_PROVENANCE,
  buildDefaultAssetConfig,
} from '@arven/three-engine/glb';
import { ToastProvider, formatIDR } from '@arven/ui';
import { ProductDetailView } from '../src/components/catalog/product-detail-view';
import { ApiClientError, clearCsrfTokenCache, storefrontApi } from '../src/lib/api-client';

vi.mock('@/components/catalog/product-3d-viewer-island', () => ({
  Product3DViewerIsland: ({
    asset,
    activePresetId,
    onFallbackTo2D,
  }: {
    asset: Product3DAssetPublicDto;
    activePresetId: string | null;
    onFallbackTo2D?: (reason: string) => void;
  }) => (
    <div data-testid="mock-product-3d-island" data-active-preset-id={activePresetId ?? ''}>
      <span>3D Viewer Active: {asset.productName}</span>
      <button
        type="button"
        onClick={() => onFallbackTo2D?.('webgl_context_unavailable')}
      >
        Simulate WebGL Fallback
      </button>
      <button
        type="button"
        onClick={() => onFallbackTo2D?.('user_switched_to_2d')}
      >
        Kembali ke Foto 2D
      </button>
    </div>
  ),
}));

const VARIANT_CHARCOAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const VARIANT_IVORY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const PRESET_CHARCOAL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const PRESET_IVORY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const PRODUCT_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const ASSET_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

function makeSampleProduct(has3dEnabled = true): ProductDetailDto {
  return {
    id: PRODUCT_ID,
    slug: 'atelier-boxy-wool-overshirt',
    name: 'Atelier Boxy Wool Overshirt',
    description: 'Architectural virgin wool overshirt crafted in small batches.',
    material: '100% Virgin Merino Wool',
    fit: 'Boxy Cropped Fit',
    careInstruction: 'Dry clean only.',
    seoTitle: 'Atelier Boxy Wool Overshirt | ARVEN',
    seoDescription: 'Architectural wool overshirt.',
    isFeatured: true,
    has3dEnabled,
    priceIdr: 1_490_000,
    compareAtPriceIdr: null,
    inStock: true,
    stockStatus: 'IN_STOCK',
    primaryCategory: {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
      slug: 'outerwear',
      name: 'Outerwear',
    },
    categories: [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
        slug: 'outerwear',
        name: 'Outerwear',
        isPrimary: true,
      },
    ],
    collections: [],
    variants: [
      {
        id: VARIANT_CHARCOAL_ID,
        sku: 'ARV-OVR-001-M-CHR',
        size: 'M',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 1_490_000,
        compareAtPriceIdr: null,
        weightGrams: 620,
        availableQty: 8,
        lowStockThreshold: 2,
        stockStatus: 'IN_STOCK',
      },
      {
        id: VARIANT_IVORY_ID,
        sku: 'ARV-OVR-002-M-IVR',
        size: 'M',
        color: 'Ivory',
        colorHex: '#E9E4DA',
        priceIdr: 1_590_000,
        compareAtPriceIdr: null,
        weightGrams: 620,
        availableQty: 5,
        lowStockThreshold: 2,
        stockStatus: 'IN_STOCK',
      },
    ],
    media: [
      {
        id: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
        productId: PRODUCT_ID,
        variantId: null,
        type: 'IMAGE',
        url: '/images/atelier-overshirt.webp',
        altText: 'Atelier Boxy Wool Overshirt front view',
        position: 0,
        width: 900,
        height: 1200,
        isPrimary: true,
      },
    ],
    primaryMedia: {
      id: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
      productId: PRODUCT_ID,
      variantId: null,
      type: 'IMAGE',
      url: '/images/atelier-overshirt.webp',
      altText: 'Atelier Boxy Wool Overshirt front view',
      position: 0,
      width: 900,
      height: 1200,
      isPrimary: true,
    },
    sizeGuide: null,
    relatedProducts: [],
    publishedAt: '2026-11-18T00:00:00.000Z',
  };
}

function makeSample3DAsset(): Product3DAssetPublicDto {
  return {
    id: ASSET_ID,
    productId: PRODUCT_ID,
    productSlug: 'atelier-boxy-wool-overshirt',
    productName: 'Atelier Boxy Wool Overshirt',
    variantId: null,
    version: 1,
    format: 'GLB',
    bytes: 18_432,
    modelUrl: `/api/v1/3d-assets/${ASSET_ID}/model`,
    mobileModelUrl: `/api/v1/3d-assets/${ASSET_ID}/model-lite`,
    posterUrl: `/api/v1/3d-assets/${ASSET_ID}/poster`,
    config: buildDefaultAssetConfig({
      silhouette: 'overshirt',
      lightingPreset: 'arven_studio_neutral_v1',
      materialSlots: [...DEFAULT_ARVEN_MATERIAL_SLOTS],
      provenance: DEFAULT_ARVEN_PROVENANCE,
      defaultProfile: { triangles: 480, vertices: 360, bytes: 18_432 },
    }),
    customizationPresets: [
      {
        id: PRESET_CHARCOAL_ID,
        productId: PRODUCT_ID,
        assetId: ASSET_ID,
        code: 'charcoal-wool',
        label: 'Charcoal Wool',
        swatchHex: '#17191B',
        materialOverrides: {
          mat_fabric_primary: { baseColorHex: '#17191B', roughness: 0.88, metalness: 0.02 },
        },
        variantId: VARIANT_CHARCOAL_ID,
        variantSku: 'ARV-OVR-001-M-CHR',
        variantColor: 'Charcoal',
        isActive: true,
        sortOrder: 0,
        createdAt: '2026-11-18T00:00:00.000Z',
        updatedAt: '2026-11-18T00:00:00.000Z',
      },
      {
        id: PRESET_IVORY_ID,
        productId: PRODUCT_ID,
        assetId: ASSET_ID,
        code: 'ivory-twill',
        label: 'Ivory Twill',
        swatchHex: '#E9E4DA',
        materialOverrides: {
          mat_fabric_primary: { baseColorHex: '#E9E4DA', roughness: 0.85, metalness: 0.02 },
        },
        variantId: null,
        variantSku: null,
        variantColor: 'Ivory',
        isActive: true,
        sortOrder: 1,
        createdAt: '2026-11-18T00:00:00.000Z',
        updatedAt: '2026-11-18T00:00:00.000Z',
      },
    ],
    publishedAt: '2026-11-18T00:00:00.000Z',
  };
}

function makeEmptyCart(): CartDto {
  return {
    id: '99999999-9999-4999-8999-999999999991',
    status: 'ACTIVE',
    ownerType: 'GUEST',
    currency: 'IDR',
    itemCount: 1,
    totalQuantity: 1,
    subtotalIdr: 1_590_000,
    hasUnavailableItems: false,
    items: [],
    updatedAt: '2026-11-18T00:00:00.000Z',
  };
}

describe('Phase 07 Storefront PDP 3D Viewer, Presets & Cart Integration', () => {
  afterEach(() => {
    cleanup();
    clearCsrfTokenCache();
    vi.restoreAllMocks();
  });

  it('handles 404 as null in storefrontApi.getProduct3DAssets and sends telemetry POST', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'RESOURCE_NOT_FOUND', message: 'No 3D asset found' },
            meta: { requestId: 'req-3d-404' },
          }),
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-3d-1' },
            meta: { requestId: 'req-csrf-3d' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              recorded: true,
              eventType: 'viewer_opened',
              recordedAtUtc: '2026-11-18T00:00:00.000Z',
            },
            meta: { requestId: 'req-tel-1' },
          }),
          { status: 202 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const missing = await storefrontApi.getProduct3DAssets('nonexistent-garment');
    expect(missing).toBeNull();

    const receipt = await storefrontApi.record3DTelemetry({
      eventType: 'viewer_opened',
      productId: PRODUCT_ID,
      assetId: ASSET_ID,
      version: 1,
      deviceTier: 'default',
    });
    expect(receipt.recorded).toBe(true);
    expect(receipt.eventType).toBe('viewer_opened');
  });

  it('renders skip link, 2D/3D mode bar, preset radiogroup variant sync, and sends configuration on Add to Bag', async () => {
    const product = makeSampleProduct(true);
    const asset3d = makeSample3DAsset();

    vi.spyOn(storefrontApi, 'getProductBySlug').mockResolvedValue(product);
    vi.spyOn(storefrontApi, 'getProduct3DAssets').mockResolvedValue(asset3d);
    const addCartSpy = vi
      .spyOn(storefrontApi, 'addCartItem')
      .mockResolvedValue(makeEmptyCart());

    const { container } = render(
      <ToastProvider>
        <ProductDetailView slug={product.slug} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: product.name })).toBeTruthy();
    });

    // Skip link right before media column pointing to #pdp-purchase-controls
    const skipLink = screen.getByRole('link', { name: 'Lewati Tampilan 3D' });
    expect(skipLink.getAttribute('href')).toBe('#pdp-purchase-controls');
    const purchaseSection = document.getElementById('pdp-purchase-controls');
    expect(purchaseSection).not.toBeNull();

    // Accessible 2-button mode bar starting in 2D editorial mode
    const modeBar = screen.getByRole('group', { name: 'Mode Tampilan Produk' });
    const btn2d = within(modeBar).getByRole('button', { name: 'Foto 2D' });
    const btn3d = within(modeBar).getByRole('button', { name: 'Model 3D' });
    expect(btn2d.getAttribute('aria-pressed')).toBe('true');
    expect(btn3d.getAttribute('aria-pressed')).toBe('false');
    expect(btn2d.className).toContain('min-h-11');
    expect(btn3d.className).toContain('min-h-11');

    // Switch to 3D mode
    fireEvent.click(btn3d);
    expect(btn3d.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('mock-product-3d-island')).toBeTruthy();

    // Simulate automatic WebGL fallback notice while keeping purchase controls active
    fireEvent.click(screen.getByRole('button', { name: 'Simulate WebGL Fallback' }));
    expect(screen.getByText('Mode 2D Studio Aktif')).toBeTruthy();

    // Clicking "Kembali ke Foto 2D" switches back cleanly to 2D
    fireEvent.click(screen.getByRole('button', { name: 'Kembali ke Foto 2D' }));
    expect(btn2d.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('mock-product-3d-island')).toBeNull();

    // Switch back to 3D and verify preset selection updates activePresetId + variant + IDR price
    fireEvent.click(btn3d);
    const radiogroup = screen.getByRole('radiogroup', { name: 'Material and color presets' });
    const charcoalRadio = within(radiogroup).getByRole('radio', { name: 'Charcoal Wool' });
    const ivoryRadio = within(radiogroup).getByRole('radio', { name: 'Ivory Twill' });
    expect(charcoalRadio.getAttribute('aria-checked')).toBe('true');
    expect(ivoryRadio.getAttribute('aria-checked')).toBe('false');
    expect(ivoryRadio.className).toContain('min-h-11');

    // Initial IDR price for Charcoal variant
    expect(container.textContent).toContain(formatIDR(1_490_000));
    expect(container.textContent).toContain('ARV-OVR-001-M-CHR');

    // Select Ivory Twill preset -> synchronizes variant by variantColor ("Ivory") + updates IDR price & SKU
    fireEvent.click(ivoryRadio);
    expect(ivoryRadio.getAttribute('aria-checked')).toBe('true');
    expect(charcoalRadio.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('mock-product-3d-island').getAttribute('data-active-preset-id')).toBe(
      PRESET_IVORY_ID,
    );
    expect(container.textContent).toContain(formatIDR(1_590_000));
    expect(container.textContent).toContain('ARV-OVR-002-M-IVR');

    // Click Add to Bag -> verifies variantId + configuration preset payload
    const addToBagBtn = screen.getByRole('button', { name: 'Add to Bag' });
    fireEvent.click(addToBagBtn);

    await waitFor(() => {
      expect(addCartSpy).toHaveBeenCalledWith({
        variantId: VARIANT_IVORY_ID,
        quantity: 1,
        configuration: {
          colorPresetId: PRESET_IVORY_ID,
          colorPresetCode: 'ivory-twill',
          colorPresetLabel: 'Ivory Twill',
        },
      });
    });

    // Anti-slop verification: zero em dashes, zero pink hexes, zero banned #8b897f
    expect(container.textContent).not.toContain('\u2014');
    const lowerHtml = container.innerHTML.toLowerCase();
    expect(lowerHtml).not.toContain('#ff69b4');
    expect(lowerHtml).not.toContain('#ec4899');
    expect(lowerHtml).not.toContain('#ff00ff');
    expect(lowerHtml).not.toContain('#8b897f');
  });

  it('omits 3D controls and cart configuration when product has no 3D asset', async () => {
    const product = makeSampleProduct(false);
    vi.spyOn(storefrontApi, 'getProductBySlug').mockResolvedValue(product);
    vi.spyOn(storefrontApi, 'getProduct3DAssets').mockResolvedValue(null);
    const addCartSpy = vi
      .spyOn(storefrontApi, 'addCartItem')
      .mockResolvedValue(makeEmptyCart());

    render(
      <ToastProvider>
        <ProductDetailView slug={product.slug} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: product.name })).toBeTruthy();
    });

    expect(screen.queryByRole('group', { name: 'Mode Tampilan Produk' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Lewati Tampilan 3D' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Material and color presets' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add to Bag' }));

    await waitFor(() => {
      expect(addCartSpy).toHaveBeenCalledWith({
        variantId: VARIANT_CHARCOAL_ID,
        quantity: 1,
      });
    });
  });

  it('rethrows non-404 errors in storefrontApi.getProduct3DAssets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Database unavailable' },
            meta: { requestId: 'req-3d-500' },
          }),
          { status: 500 },
        ),
      ),
    );

    await expect(storefrontApi.getProduct3DAssets('atelier-overshirt')).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });
});
