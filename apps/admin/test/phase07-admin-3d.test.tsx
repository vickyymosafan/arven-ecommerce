import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  AdminProduct3DAssetDto,
  AdminProductDetailDto,
  CustomizationPresetDto,
  Presign3DAssetResponseDto,
} from '@arven/contracts';
import {
  DEFAULT_ARVEN_MATERIAL_SLOTS,
  DEFAULT_ARVEN_PROVENANCE,
  buildDefaultAssetConfig,
} from '@arven/three-engine/glb';
import { ToastProvider } from '@arven/ui';
import { AdminProduct3DPanel } from '../src/components/catalog/admin-product-3d-panel';
import { AdminProductDetailView } from '../src/components/catalog/admin-product-detail-view';
import { adminApi, clearAdminCsrfTokenCache } from '../src/lib/api-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => `/catalog/products/${PRODUCT_ID}`,
}));

vi.mock('next/dynamic', () => ({
  default: () =>
    function MockDynamicThreeExperience(props: { productName: string; modelUrl: string }) {
      return (
        <div data-testid="mock-admin-3d-qa-preview" data-model-url={props.modelUrl}>
          Preview QA: {props.productName}
        </div>
      );
    },
}));

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID_1 = '22222222-2222-4222-8222-222222222221';
const VARIANT_ID_2 = '22222222-2222-4222-8222-222222222222';
const ASSET_V1_ID = '33333333-3333-4333-8333-333333333331';
const ASSET_V2_ID = '33333333-3333-4333-8333-333333333332';
const PRESET_1_ID = '44444444-4444-4444-8444-444444444441';
const PRESET_2_ID = '44444444-4444-4444-8444-444444444442';

function makeProductDetail(): AdminProductDetailDto {
  return {
    id: PRODUCT_ID,
    slug: 'atelier-boxy-wool-overshirt',
    name: 'Atelier Boxy Wool Overshirt',
    description: 'Boxy tailored overshirt.',
    material: '100% Virgin Wool',
    fit: 'Boxy',
    careInstruction: 'Dry clean only',
    seoTitle: null,
    seoDescription: null,
    status: 'READY_TO_PUBLISH',
    isVisible: true,
    isFeatured: true,
    has3dEnabled: false,
    sizeGuideOverride: null,
    effectiveSizeGuide: null,
    categories: [],
    collections: [],
    variants: [
      {
        id: VARIANT_ID_1,
        productId: PRODUCT_ID,
        sku: 'ARV-OVR-001-M-CHR',
        barcode: null,
        size: 'M',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 1_490_000,
        compareAtPriceIdr: null,
        weightGrams: 620,
        dimensionsJson: null,
        isActive: true,
        quantityOnHand: 10,
        quantityReserved: 0,
        availableQty: 10,
        lowStockThreshold: 2,
        stockStatus: 'IN_STOCK',
        createdAt: '2026-11-18T00:00:00.000Z',
        updatedAt: '2026-11-18T00:00:00.000Z',
      },
      {
        id: VARIANT_ID_2,
        productId: PRODUCT_ID,
        sku: 'ARV-OVR-002-M-OLV',
        barcode: null,
        size: 'M',
        color: 'Olive',
        colorHex: '#416B59',
        priceIdr: 1_540_000,
        compareAtPriceIdr: null,
        weightGrams: 620,
        dimensionsJson: null,
        isActive: true,
        quantityOnHand: 6,
        quantityReserved: 0,
        availableQty: 6,
        lowStockThreshold: 2,
        stockStatus: 'IN_STOCK',
        createdAt: '2026-11-18T00:00:00.000Z',
        updatedAt: '2026-11-18T00:00:00.000Z',
      },
    ],
    media: [],
    publishGate: {
      canPublish: true,
      unmetCount: 0,
      checks: [],
      issues: [],
    },
    publishedAt: null,
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
  };
}

function makeAdminAsset(overrides: Partial<AdminProduct3DAssetDto> = {}): AdminProduct3DAssetDto {
  const id = overrides.id ?? ASSET_V1_ID;
  const version = overrides.version ?? 1;
  return {
    id,
    productId: PRODUCT_ID,
    variantId: null,
    version,
    format: 'GLB',
    objectKey: `products/atelier-boxy-wool-overshirt/v000${version}/model.glb`,
    mobileObjectKey: `products/atelier-boxy-wool-overshirt/v000${version}/model-lite.glb`,
    posterKey: `products/atelier-boxy-wool-overshirt/v000${version}/poster.svg`,
    bytes: 16_240,
    status: 'READY',
    isActiveVersion: false,
    config: buildDefaultAssetConfig({
      silhouette: 'overshirt',
      lightingPreset: 'arven_studio_neutral_v1',
      materialSlots: [...DEFAULT_ARVEN_MATERIAL_SLOTS],
      provenance: DEFAULT_ARVEN_PROVENANCE,
      defaultProfile: { triangles: 440, vertices: 330, bytes: 16_240 },
    }),
    modelUrl: `/api/v1/3d-assets/${id}/model`,
    mobileModelUrl: `/api/v1/3d-assets/${id}/model-lite`,
    posterUrl: `/api/v1/3d-assets/${id}/poster`,
    previewModelUrl: `/api/v1/admin/3d-assets/${id}/preview-model`,
    validationRuns: [
      {
        id: '55555555-5555-4555-8555-555555555551',
        assetId: id,
        status: 'PASSED',
        validatorVersion: 'arven-glb-validator-1.0.0',
        report: { triangleCount: 440, vertexCount: 330 },
        errorSummary: null,
        startedAt: '2026-11-18T00:00:00.000Z',
        completedAt: '2026-11-18T00:00:01.000Z',
        createdAt: '2026-11-18T00:00:00.000Z',
      },
    ],
    customizationPresets: [
      {
        id: PRESET_1_ID,
        productId: PRODUCT_ID,
        assetId: id,
        code: 'charcoal-wool',
        label: 'Charcoal Wool',
        swatchHex: '#17191B',
        materialOverrides: {
          mat_fabric_primary: { baseColorHex: '#17191B' },
        },
        variantId: VARIANT_ID_1,
        variantSku: 'ARV-OVR-001-M-CHR',
        variantColor: 'Charcoal',
        isActive: true,
        sortOrder: 0,
        createdAt: '2026-11-18T00:00:00.000Z',
        updatedAt: '2026-11-18T00:00:00.000Z',
      },
    ],
    publishedAt: null,
    createdBy: '66666666-6666-4666-8666-666666666661',
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('Phase 07 Admin 3D Asset Lifecycle, QA Preview & Presets Panel', () => {
  afterEach(() => {
    cleanup();
    clearAdminCsrfTokenCache();
    vi.restoreAllMocks();
  });

  it('renders asset versions, triggers Studio GLB upload -> presign -> staging -> confirm -> publish, and manages presets', async () => {
    const product = makeProductDetail();
    const initialAsset = makeAdminAsset({ version: 1, status: 'READY', isActiveVersion: false });
    const uploadedV2 = makeAdminAsset({
      id: ASSET_V2_ID,
      version: 2,
      status: 'READY',
      isActiveVersion: false,
      customizationPresets: [],
    });
    const publishedV2 = makeAdminAsset({
      id: ASSET_V2_ID,
      version: 2,
      status: 'READY',
      isActiveVersion: true,
      customizationPresets: [],
      publishedAt: '2026-11-18T01:00:00.000Z',
    });

    const listSpy = vi
      .spyOn(adminApi, 'listProduct3DAssets')
      .mockResolvedValueOnce([initialAsset])
      .mockResolvedValueOnce([uploadedV2, initialAsset])
      .mockResolvedValueOnce([publishedV2, initialAsset]);

    const presignResponse: Presign3DAssetResponseDto = {
      asset: makeAdminAsset({
        id: ASSET_V2_ID,
        version: 2,
        status: 'UPLOADED',
        isActiveVersion: false,
        validationRuns: [],
        customizationPresets: [],
      }),
      stagingKey: `staging/3d/${ASSET_V2_ID}/upload.glb`,
      uploadUrl: `/api/v1/admin/3d-assets/${ASSET_V2_ID}/upload-staging`,
      uploadMethod: 'PUT',
      uploadHeaders: { 'Content-Type': 'model/gltf-binary' },
      expiresAtUtc: '2026-11-18T00:10:00.000Z',
    };

    const presignSpy = vi
      .spyOn(adminApi, 'presign3DAssetUpload')
      .mockResolvedValue(presignResponse);
    const uploadSpy = vi
      .spyOn(adminApi, 'uploadStaging3DAsset')
      .mockResolvedValue(presignResponse.asset);
    const confirmSpy = vi
      .spyOn(adminApi, 'confirm3DAsset')
      .mockResolvedValue(uploadedV2);
    const publishSpy = vi
      .spyOn(adminApi, 'publish3DAsset')
      .mockResolvedValue(publishedV2);
    const onProductUpdated = vi.fn();

    const createdPreset: CustomizationPresetDto = {
      id: PRESET_2_ID,
      productId: PRODUCT_ID,
      assetId: ASSET_V2_ID,
      code: 'olive-gabardine',
      label: 'Olive Gabardine',
      swatchHex: '#416B59',
      materialOverrides: {
        mat_fabric_primary: { baseColorHex: '#416B59' },
      },
      variantId: VARIANT_ID_2,
      variantSku: 'ARV-OVR-002-M-OLV',
      variantColor: 'Olive',
      isActive: true,
      sortOrder: 0,
      createdAt: '2026-11-18T02:00:00.000Z',
      updatedAt: '2026-11-18T02:00:00.000Z',
    };
    const createPresetSpy = vi
      .spyOn(adminApi, 'create3DAssetPreset')
      .mockResolvedValue(createdPreset);
    const deletePresetSpy = vi
      .spyOn(adminApi, 'delete3DAssetPreset')
      .mockResolvedValue(undefined);

    const { container } = render(
      <ToastProvider>
        <AdminProduct3DPanel
          product={product}
          canReadAssets
          canUploadAssets
          canPublishAssets
          onProductUpdated={onProductUpdated}
        />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('v0001')).toBeTruthy();
    });
    expect(screen.getByText('Validation PASSED')).toBeTruthy();
    expect(screen.getByText('arven-glb-validator-1.0.0')).toBeTruthy();
    expect(screen.getByText('Charcoal Wool')).toBeTruthy();

    // Generate Studio GLB & Validate flow
    fireEvent.click(screen.getByRole('button', { name: 'Generate Studio GLB & Validate' }));

    await waitFor(() => {
      expect(presignSpy).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({
          fileName: 'atelier-boxy-wool-overshirt-studio.glb',
          contentType: 'model/gltf-binary',
          silhouette: 'overshirt',
        }),
      );
      expect(uploadSpy).toHaveBeenCalledWith(
        ASSET_V2_ID,
        expect.objectContaining({
          glbBase64: expect.any(String),
          liteGlbBase64: expect.any(String),
        }),
      );
      expect(confirmSpy).toHaveBeenCalledWith(ASSET_V2_ID, {});
      expect(listSpy).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('v0002')).toBeTruthy();
    });

    // Open Preview 3D QA modal
    const previewButtons = screen.getAllByRole('button', { name: 'Preview 3D QA' });
    fireEvent.click(previewButtons[0]!);
    expect(screen.getByTestId('mock-admin-3d-qa-preview').getAttribute('data-model-url')).toBe(
      `/api/v1/admin/3d-assets/${ASSET_V2_ID}/preview-model`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    // Publish READY v0002 version
    const publishButtons = screen.getAllByRole('button', { name: 'Publish 3D Version' });
    fireEvent.click(publishButtons[0]!);

    await waitFor(() => {
      expect(publishSpy).toHaveBeenCalledWith(ASSET_V2_ID, { enableProduct3d: true });
      expect(onProductUpdated).toHaveBeenCalled();
    });

    // Reject pink swatch hex before calling API
    fireEvent.change(screen.getByLabelText(/Preset Code/i), {
      target: { value: 'pink-test' },
    });
    fireEvent.change(screen.getByLabelText(/Preset Label/i), {
      target: { value: 'Pink Forbidden' },
    });
    fireEvent.change(screen.getByLabelText(/Swatch Hex/i), {
      target: { value: '#FF69B4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Preset' }));
    expect(screen.getByText(/Pink and magenta colors are forbidden/i)).toBeTruthy();
    expect(createPresetSpy).not.toHaveBeenCalled();

    // Create valid preset bound to mat_fabric_primary
    fireEvent.change(screen.getByLabelText(/Preset Code/i), {
      target: { value: 'olive-gabardine' },
    });
    fireEvent.change(screen.getByLabelText(/Preset Label/i), {
      target: { value: 'Olive Gabardine' },
    });
    fireEvent.change(screen.getByLabelText(/Swatch Hex/i), {
      target: { value: '#416B59' },
    });
    fireEvent.change(screen.getByLabelText(/Linked Variant/i), {
      target: { value: VARIANT_ID_2 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Preset' }));

    await waitFor(() => {
      expect(createPresetSpy).toHaveBeenCalledWith(ASSET_V2_ID, {
        code: 'olive-gabardine',
        label: 'Olive Gabardine',
        swatchHex: '#416B59',
        materialOverrides: {
          mat_fabric_primary: {
            baseColorHex: '#416B59',
          },
        },
        variantId: VARIANT_ID_2,
        isActive: true,
        sortOrder: 0,
      });
    });

    expect(screen.getByText('Olive Gabardine')).toBeTruthy();

    // Delete preset
    fireEvent.click(screen.getByRole('button', { name: 'Delete Preset' }));
    await waitFor(() => {
      expect(deletePresetSpy).toHaveBeenCalledWith(ASSET_V2_ID, PRESET_2_ID);
    });
    expect(screen.queryByText('Olive Gabardine')).toBeNull();

    // Anti-slop verification: zero em dashes and zero pink hexes
    expect(container.textContent).not.toContain('\u2014');
    const lowerHtml = container.innerHTML.toLowerCase();
    expect(lowerHtml).not.toContain('#ff69b4');
    expect(lowerHtml).not.toContain('#ec4899');
    expect(lowerHtml).not.toContain('#ff00ff');
  });

  it('hides upload, publish, and preset mutation controls when staff lacks upload/publish permissions', async () => {
    const product = makeProductDetail();
    const asset = makeAdminAsset({ version: 1, status: 'READY', isActiveVersion: false });
    vi.spyOn(adminApi, 'listProduct3DAssets').mockResolvedValue([asset]);

    render(
      <ToastProvider>
        <AdminProduct3DPanel
          product={product}
          canReadAssets
          canUploadAssets={false}
          canPublishAssets={false}
        />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('v0001')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Generate Studio GLB & Validate' })).toBeNull();
    expect(screen.queryByLabelText('Upload .GLB File')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish 3D Version' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Preset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Preset' })).toBeNull();
    // Preview QA remains available for read-only asset reviewers
    expect(screen.getByRole('button', { name: 'Preview 3D QA' })).toBeTruthy();
  });

  it('calls 3D analytics and asset admin API client routes accurately', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            viewerOpenedCount: 42,
            presetSelectedCount: 19,
            cameraPresetCount: 11,
            fallbackTriggeredCount: 2,
            loadErrorCount: 0,
            contextLostCount: 0,
            readyAssetsCount: 4,
            productsWith3DCount: 4,
            generatedAt: '2026-11-18T00:00:00.000Z',
          },
          meta: { requestId: 'req-3d-analytics' },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const stats = await adminApi.get3DEngagementAnalytics();
    expect(stats.viewerOpenedCount).toBe(42);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/analytics/3d-engagement');
  });

  it('wires has3dEnabled checkbox and AdminProduct3DPanel inside AdminProductDetailView', async () => {
    const product = makeProductDetail();
    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: {
        id: '77777777-7777-4777-8777-777777777771',
        email: 'owner@arven.id',
        fullName: 'Arven Owner',
        phone: null,
        status: 'ACTIVE',
        roles: ['OWNER'],
        permissions: [],
        mfaEnabled: true,
        mfaVerified: true,
        mfaVerifiedAt: '2026-11-18T00:00:00.000Z',
      },
      mfaRequired: false,
    });
    vi.spyOn(adminApi, 'getProductById').mockResolvedValue(product);
    vi.spyOn(adminApi, 'listCategories').mockResolvedValue([]);
    vi.spyOn(adminApi, 'listCollections').mockResolvedValue([]);
    vi.spyOn(adminApi, 'listProduct3DAssets').mockResolvedValue([]);
    const updateSpy = vi
      .spyOn(adminApi, 'updateProduct')
      .mockResolvedValue({ ...product, has3dEnabled: true });

    render(
      <ToastProvider>
        <AdminProductDetailView productId={PRODUCT_ID} />
      </ToastProvider>,
    );

    const checkbox = (await screen.findByLabelText(
      'Enable 3D Product Viewer (Requires READY 3D Asset)',
    )) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save Product Metadata' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({
          has3dEnabled: true,
        }),
      );
    });
  });
});
