import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  AdminOutfitGarmentDiagnosticDto,
  AdminProductSummaryDto,
  AdminShowroomHotspotDto,
  AdminShowroomZoneDto,
  AuthUserSummary,
  OutfitSceneDto,
  OutfitStudioCatalogDto,
} from '@arven/contracts';
import { ToastProvider } from '@arven/ui';
import { AdminOutfitStudioView } from '../src/components/experience/admin-outfit-studio-view';
import { AdminShowroomView } from '../src/components/experience/admin-showroom-view';
import { adminApi, clearAdminCsrfTokenCache } from '../src/lib/api-client';
import {
  ADMIN_NAV_ITEMS,
  canUserPublishExperience,
  filterAdminNavItems,
  getShowroomZoneStatusBadge,
} from '../src/lib/ops-helpers';

const { mockRouter } = vi.hoisted(() => ({
  mockRouter: {
    replace: vi.fn(),
    push: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/experience/showroom',
}));

vi.mock('next/dynamic', () => ({
  default: () =>
    function MockDynamicAdminExperience(props: {
      activeZoneCode?: string;
      rigId?: string;
    }) {
      return (
        <div
          data-testid="mock-admin-3d-experience-preview"
          data-zone={props.activeZoneCode ?? ''}
          data-rig={props.rigId ?? ''}
        >
          3D Preview Active
        </div>
      );
    },
}));

const ZONE_ATRIUM_ID = '11111111-1111-4111-8111-111111111101';
const ZONE_VAULT_ID = '11111111-1111-4111-8111-111111111102';
const HOTSPOT_1_ID = '22222222-2222-4222-8222-222222222201';
const PRODUCT_TEE_ID = '33333333-3333-4333-8333-333333333301';
const VARIANT_TEE_ID = '33333333-3333-4333-8333-333333333302';
const ASSET_TEE_ID = '44444444-4444-4444-8444-444444444401';
const PRODUCT_JACKET_ID = '33333333-3333-4333-8333-333333333309';
const ASSET_JACKET_ID = '44444444-4444-4444-8444-444444444409';
const PRESET_ATELIER_ID = '55555555-5555-4555-8555-555555555501';

function makeStaffUser(params: {
  roles: AuthUserSummary['roles'];
  permissions: string[];
}): AuthUserSummary {
  return {
    id: '77777777-7777-4777-8777-777777777771',
    email: 'staff@arven.id',
    fullName: 'Arven Staff',
    phone: null,
    status: 'ACTIVE',
    roles: params.roles,
    permissions: params.permissions,
    mfaEnabled: true,
    mfaVerified: true,
    mfaVerifiedAt: '2026-11-19T00:00:00.000Z',
  };
}

function makeAdminZones(): AdminShowroomZoneDto[] {
  return [
    {
      id: ZONE_ATRIUM_ID,
      code: 'atrium-entrance',
      title: 'Atrium',
      description: 'Zona pembuka galeri ARVEN.',
      status: 'PUBLISHED',
      sortOrder: 0,
      sceneObjectKey: 'showroom/atrium-entrance/v0001/scene.glb',
      liteSceneObjectKey: 'showroom/atrium-entrance/v0001/scene-lite.glb',
      posterKey: 'showroom/atrium-entrance/v0001/poster.svg',
      sceneUrl: '/api/v1/showroom/zones/atrium-entrance/scene',
      liteSceneUrl: '/api/v1/showroom/zones/atrium-entrance/scene-lite',
      posterUrl: '/api/v1/showroom/zones/atrium-entrance/poster',
      sceneBytes: 142_000,
      liteSceneBytes: 88_000,
      cameraBaseline: {
        fovDeg: 45,
        position: [0, 1.7, 5.2],
        target: [0, 1.0, 0],
        minDistance: 1.4,
        maxDistance: 12,
      },
      portals: [
        {
          targetZoneCode: 'tailoring-gallery',
          label: 'Galeri Tailoring',
          position: [2.2, 0, -2.5],
        },
      ],
      config: {
        lightingPreset: 'arven_studio_neutral_v1',
        bakedLighting: true,
      },
      publishedAt: '2026-11-19T00:00:00.000Z',
      createdBy: null,
      hotspots: [
        {
          id: HOTSPOT_1_ID,
          zoneId: ZONE_ATRIUM_ID,
          productId: PRODUCT_TEE_ID,
          productSlug: 'essentials-heavyweight-crew-tee',
          productName: 'Essentials Heavyweight Crew Tee',
          productStatus: 'PUBLISHED',
          variantId: VARIANT_TEE_ID,
          label: 'Heavyweight Crew Tee Plinth',
          positionX: -1.2,
          positionY: 1.1,
          positionZ: 0.4,
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-11-19T00:00:00.000Z',
          updatedAt: '2026-11-19T00:00:00.000Z',
        },
      ],
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    },
    {
      id: ZONE_VAULT_ID,
      code: 'archive-vault',
      title: 'Arsip',
      description: 'Zona draf internal.',
      status: 'DRAFT',
      sortOrder: 3,
      sceneObjectKey: 'showroom/archive-vault/v0001/scene.glb',
      liteSceneObjectKey: 'showroom/archive-vault/v0001/scene-lite.glb',
      posterKey: 'showroom/archive-vault/v0001/poster.svg',
      sceneUrl: '/api/v1/showroom/zones/archive-vault/scene',
      liteSceneUrl: '/api/v1/showroom/zones/archive-vault/scene-lite',
      posterUrl: '/api/v1/showroom/zones/archive-vault/poster',
      sceneBytes: 128_000,
      liteSceneBytes: 76_000,
      cameraBaseline: {
        fovDeg: 45,
        position: [0, 1.7, 5.2],
        target: [0, 1.0, 0],
        minDistance: 1.4,
        maxDistance: 12,
      },
      portals: [],
      config: {
        lightingPreset: 'arven_studio_neutral_v1',
        bakedLighting: true,
      },
      publishedAt: null,
      createdBy: null,
      hotspots: [],
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    },
  ];
}

function makeGarmentDiagnostics(): AdminOutfitGarmentDiagnosticDto[] {
  return [
    {
      assetId: ASSET_TEE_ID,
      productId: PRODUCT_TEE_ID,
      productSlug: 'essentials-heavyweight-crew-tee',
      productName: 'Essentials Heavyweight Crew Tee',
      productStatus: 'PUBLISHED',
      assetStatus: 'READY',
      isActiveVersion: true,
      version: 1,
      posterUrl: `/api/v1/3d-assets/${ASSET_TEE_ID}/poster`,
      compatibility: {
        rigId: 'arven_mannequin_unisex_v1',
        skeletonVersion: '1.0.0',
        slot: 'top',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      },
      compatibleWithCurrentRig: true,
      diagnosticMessage: null,
    },
    {
      assetId: ASSET_JACKET_ID,
      productId: PRODUCT_JACKET_ID,
      productSlug: 'atelier-archive-field-jacket',
      productName: 'Atelier Archive Field Jacket',
      productStatus: 'PUBLISHED',
      assetStatus: 'READY',
      isActiveVersion: true,
      version: 1,
      posterUrl: `/api/v1/3d-assets/${ASSET_JACKET_ID}/poster`,
      compatibility: {
        rigId: 'arven_mannequin_unisex_v1',
        skeletonVersion: '0.9.0',
        slot: 'outerwear',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      },
      compatibleWithCurrentRig: false,
      diagnosticMessage:
        'Skeleton version 0.9.0 does not match active rig skeleton 1.0.0.',
    },
  ];
}

function makePublicPresets(): OutfitSceneDto[] {
  return [
    {
      id: PRESET_ATELIER_ID,
      title: 'Seragam Atelier',
      rigId: 'arven_mannequin_unisex_v1',
      skeletonVersion: '1.0.0',
      isPublicPreset: true,
      slots: [
        {
          slot: 'top',
          productId: PRODUCT_TEE_ID,
          productSlug: 'essentials-heavyweight-crew-tee',
          productName: 'Essentials Heavyweight Crew Tee',
          variantId: VARIANT_TEE_ID,
          sku: 'ARV-TEE-001-M-CHR',
          size: 'M',
          color: 'Charcoal',
          assetId: ASSET_TEE_ID,
          presetId: null,
          presetCode: null,
          presetLabel: null,
          swatchHex: '#17191B',
          unitPriceIdr: 499_000,
          availableQty: 12,
          inStock: true,
          posterUrl: `/api/v1/3d-assets/${ASSET_TEE_ID}/poster`,
          stale: false,
          staleReasons: [],
        },
      ],
      liveTotalIdr: 499_000,
      hasStaleItems: false,
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    },
  ];
}

function makePublicCatalog(): OutfitStudioCatalogDto {
  return {
    rig: {
      rigId: 'arven_mannequin_unisex_v1',
      skeletonVersion: '1.0.0',
      slots: ['top', 'bottom', 'outerwear', 'footwear', 'accessory'],
      anchors: {
        top: ['spine_upper'],
        outerwear: ['spine_upper'],
        bottom: ['pelvis'],
        footwear: ['feet'],
        accessory: ['shoulder_left', 'shoulder_right', 'wrist_left'],
      },
      modelUrl: '/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model',
      mobileModelUrl: '/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model-lite',
      posterUrl: '/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/poster',
    },
    garments: [
      {
        productId: PRODUCT_TEE_ID,
        productSlug: 'essentials-heavyweight-crew-tee',
        productName: 'Essentials Heavyweight Crew Tee',
        material: '100% Cotton',
        fit: 'Relaxed',
        assetId: ASSET_TEE_ID,
        assetVersion: 1,
        modelUrl: `/api/v1/3d-assets/${ASSET_TEE_ID}/model`,
        mobileModelUrl: `/api/v1/3d-assets/${ASSET_TEE_ID}/model-lite`,
        posterUrl: `/api/v1/3d-assets/${ASSET_TEE_ID}/poster`,
        compatibility: {
          rigId: 'arven_mannequin_unisex_v1',
          skeletonVersion: '1.0.0',
          slot: 'top',
          anchor: 'spine_upper',
          incompatibleSlots: [],
        },
        materialSlots: [],
        variants: [
          {
            id: VARIANT_TEE_ID,
            sku: 'ARV-TEE-001-M-CHR',
            size: 'M',
            color: 'Charcoal',
            colorHex: '#17191B',
            priceIdr: 499_000,
            compareAtPriceIdr: null,
            availableQty: 12,
            inStock: true,
          },
        ],
        customizationPresets: [],
      },
    ],
    publicPresets: makePublicPresets(),
  };
}

describe('Phase 08 Admin Showroom & Outfit Studio Management', () => {
  afterEach(() => {
    cleanup();
    clearAdminCsrfTokenCache();
    vi.restoreAllMocks();
  });

  it('registers Showroom and Outfit Studio nav items gated by asset.read / asset.publish', () => {
    const showroomNav = ADMIN_NAV_ITEMS.find((i) => i.href === '/experience/showroom');
    const outfitNav = ADMIN_NAV_ITEMS.find((i) => i.href === '/experience/outfit-studio');

    expect(showroomNav?.requiredPermissions).toEqual(['asset.read', 'asset.publish']);
    expect(outfitNav?.requiredPermissions).toEqual(['asset.read', 'asset.publish']);

    const contentNav = filterAdminNavItems({
      roles: ['CONTENT'],
      permissions: ['asset.read', 'cms.read'],
      authenticated: true,
    });
    expect(contentNav.some((i) => i.href === '/experience/showroom')).toBe(true);
    expect(contentNav.some((i) => i.href === '/experience/outfit-studio')).toBe(true);

    const supportNav = filterAdminNavItems({
      roles: ['SUPPORT'],
      permissions: ['order.read.limited'],
      authenticated: true,
    });
    expect(supportNav.some((i) => i.href === '/experience/showroom')).toBe(false);
    expect(supportNav.some((i) => i.href === '/experience/outfit-studio')).toBe(false);

    expect(getShowroomZoneStatusBadge('PUBLISHED').tone).toBe('success');
    expect(getShowroomZoneStatusBadge('DRAFT').tone).toBe('neutral');
    expect(getShowroomZoneStatusBadge('ARCHIVED').tone).toBe('warning');

    expect(canUserPublishExperience({ roles: ['CONTENT'], permissions: ['asset.read'] })).toBe(
      false,
    );
    expect(
      canUserPublishExperience({
        roles: ['PRODUCT'],
        permissions: ['asset.read', 'asset.publish'],
      }),
    ).toBe(true);
  });

  it('allows PRODUCT/OWNER staff with asset.publish to create zones, transition statuses, and manage hotspots in AdminShowroomView', async () => {
    const zones = makeAdminZones();
    const sampleProduct: AdminProductSummaryDto = {
      id: PRODUCT_TEE_ID,
      slug: 'essentials-heavyweight-crew-tee',
      name: 'Essentials Heavyweight Crew Tee',
      status: 'PUBLISHED',
      isVisible: true,
      isFeatured: true,
      has3dEnabled: true,
      priceIdr: 499_000,
      compareAtPriceIdr: null,
      variantCount: 2,
      totalAvailableStock: 12,
      primaryCategory: null,
      collections: [],
      primaryMedia: null,
      publishGate: {
        canPublish: true,
        unmetCount: 0,
      },
      publishedAt: '2026-11-19T00:00:00.000Z',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    };

    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: makeStaffUser({
        roles: ['PRODUCT'],
        permissions: ['asset.read', 'asset.publish'],
      }),
      mfaRequired: false,
    });
    vi.spyOn(adminApi, 'listShowroomZones').mockResolvedValue(zones);
    vi.spyOn(adminApi, 'listProducts').mockResolvedValue({
      items: [sampleProduct],
      meta: { requestId: 'req-1', page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    const transitionSpy = vi
      .spyOn(adminApi, 'transitionShowroomZone')
      .mockResolvedValue({
        ...zones[1]!,
        status: 'PUBLISHED',
        publishedAt: '2026-11-19T03:00:00.000Z',
      });

    const createdZone: AdminShowroomZoneDto = {
      ...zones[1]!,
      id: '11111111-1111-4111-8111-111111111109',
      code: 'movement-annex',
      title: 'Annex Movement',
    };
    const createZoneSpy = vi
      .spyOn(adminApi, 'createShowroomZone')
      .mockResolvedValue(createdZone);

    const createdHotspot: AdminShowroomHotspotDto = {
      id: '22222222-2222-4222-8222-222222222209',
      zoneId: ZONE_ATRIUM_ID,
      productId: PRODUCT_TEE_ID,
      productSlug: 'essentials-heavyweight-crew-tee',
      productName: 'Essentials Heavyweight Crew Tee',
      productStatus: 'PUBLISHED',
      variantId: null,
      label: 'North Plinth Display',
      positionX: 1.5,
      positionY: 1.2,
      positionZ: -0.5,
      sortOrder: 1,
      isActive: true,
      createdAt: '2026-11-19T03:00:00.000Z',
      updatedAt: '2026-11-19T03:00:00.000Z',
    };
    const createHotspotSpy = vi
      .spyOn(adminApi, 'createShowroomHotspot')
      .mockResolvedValue(createdHotspot);
    const updateHotspotSpy = vi
      .spyOn(adminApi, 'updateShowroomHotspot')
      .mockResolvedValue({
        ...zones[0]!.hotspots[0]!,
        isActive: false,
      });
    const deleteHotspotSpy = vi
      .spyOn(adminApi, 'deleteShowroomHotspot')
      .mockResolvedValue(undefined);

    const { container } = render(
      <ToastProvider>
        <AdminShowroomView />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('atrium-entrance').length).toBeGreaterThan(0);
      expect(screen.getAllByText('archive-vault').length).toBeGreaterThan(0);
    });

    // Transition DRAFT -> PUBLISHED
    const publishButtons = screen.getAllByRole('button', { name: 'Publish Zone' });
    fireEvent.click(publishButtons[0]!);
    await waitFor(() => {
      expect(transitionSpy).toHaveBeenCalledWith(ZONE_VAULT_ID, {
        targetStatus: 'PUBLISHED',
      });
    });

    // Add Hotspot to Atrium
    fireEvent.change(screen.getByLabelText(/Hotspot Label/i), {
      target: { value: 'North Plinth Display' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Hotspot' }));
    await waitFor(() => {
      expect(createHotspotSpy).toHaveBeenCalledWith(
        ZONE_ATRIUM_ID,
        expect.objectContaining({
          productId: PRODUCT_TEE_ID,
          label: 'North Plinth Display',
        }),
      );
      expect(screen.getByText('North Plinth Display')).toBeTruthy();
    });

    // Toggle hotspot active state
    const pauseButtons = screen.getAllByRole('button', { name: 'Pause Hotspot' });
    fireEvent.click(pauseButtons[0]!);
    await waitFor(() => {
      expect(updateHotspotSpy).toHaveBeenCalledWith(HOTSPOT_1_ID, {
        isActive: false,
      });
    });

    // Delete hotspot
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete Hotspot' });
    fireEvent.click(deleteButtons[0]!);
    await waitFor(() => {
      expect(deleteHotspotSpy).toHaveBeenCalledWith(HOTSPOT_1_ID);
    });

    // Create new showroom zone
    fireEvent.click(screen.getByRole('button', { name: 'Create Showroom Zone' }));
    fireEvent.change(screen.getByLabelText(/Zone Code \(Slug\)/i), {
      target: { value: 'movement-annex' },
    });
    fireEvent.change(screen.getByLabelText(/Zone Title/i), {
      target: { value: 'Annex Movement' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate & Create Zone' }));

    await waitFor(() => {
      expect(createZoneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'movement-annex',
          title: 'Annex Movement',
        }),
      );
      expect(screen.getAllByText('movement-annex').length).toBeGreaterThan(0);
    });

    // Open 3D preview modal
    const previewButtons = screen.getAllByRole('button', { name: 'Preview 3D Zone' });
    fireEvent.click(previewButtons[0]!);
    expect(screen.getByTestId('mock-admin-3d-experience-preview')).toBeTruthy();

    expect(container.textContent).not.toContain('\u2014');
  });

  it('enforces read-only mode on AdminShowroomView for CONTENT role (asset.read without asset.publish)', async () => {
    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: makeStaffUser({
        roles: ['CONTENT'],
        permissions: ['asset.read', 'cms.read'],
      }),
      mfaRequired: false,
    });
    vi.spyOn(adminApi, 'listShowroomZones').mockResolvedValue(makeAdminZones());
    vi.spyOn(adminApi, 'listProducts').mockResolvedValue({
      items: [],
      meta: { requestId: 'req-1', page: 1, limit: 50, total: 0, totalPages: 1 },
    });

    render(
      <ToastProvider>
        <AdminShowroomView />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Read-Only Access Mode')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Create Showroom Zone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Zone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish Zone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive Zone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Hotspot' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Hotspot' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Preview 3D Zone' }).length).toBeGreaterThan(0);
  });

  it('displays 0.9.0 skeleton mismatch on atelier-archive-field-jacket, updates compatibility, and manages public presets in AdminOutfitStudioView', async () => {
    const garments = makeGarmentDiagnostics();
    const presets = makePublicPresets();
    const catalog = makePublicCatalog();

    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: makeStaffUser({
        roles: ['OWNER'],
        permissions: ['asset.read', 'asset.publish'],
      }),
      mfaRequired: false,
    });
    vi.spyOn(adminApi, 'listOutfitStudioGarments').mockResolvedValue(garments);
    vi.spyOn(adminApi, 'listOutfitStudioPresets').mockResolvedValue(presets);
    vi.spyOn(adminApi, 'getPublicOutfitStudioCatalog').mockResolvedValue(catalog);

    const setCompatSpy = vi
      .spyOn(adminApi, 'setAssetOutfitCompatibility')
      .mockResolvedValue({
        ...garments[1]!,
        compatibility: {
          rigId: 'arven_mannequin_unisex_v1',
          skeletonVersion: '1.0.0',
          slot: 'outerwear',
          anchor: 'spine_upper',
          incompatibleSlots: [],
        },
        compatibleWithCurrentRig: true,
        diagnosticMessage: null,
      });

    const removeCompatSpy = vi
      .spyOn(adminApi, 'removeAssetOutfitCompatibility')
      .mockResolvedValue(undefined);

    const createPresetSpy = vi
      .spyOn(adminApi, 'createOutfitStudioPreset')
      .mockResolvedValue({
        ...presets[0]!,
        id: '55555555-5555-4555-8555-555555555502',
        title: 'Linen Harian',
      });

    const deletePresetSpy = vi
      .spyOn(adminApi, 'deleteOutfitStudioPreset')
      .mockResolvedValue(undefined);

    const { container } = render(
      <ToastProvider>
        <AdminOutfitStudioView />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Atelier Archive Field Jacket').length).toBeGreaterThan(0);
    });

    // Verify 0.9.0 skeleton mismatch diagnostic is highlighted
    expect(screen.getAllByText('v0.9.0').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        'Skeleton version 0.9.0 does not match active rig skeleton 1.0.0.',
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('INCOMPATIBLE').length).toBeGreaterThan(0);

    // Configure compatibility on field jacket to 1.0.0
    const configButtons = screen.getAllByRole('button', {
      name: 'Configure Compatibility',
    });
    fireEvent.click(configButtons[1]!);

    const skeletonInput = screen.getByLabelText(/Skeleton Version/i);
    fireEvent.change(skeletonInput, { target: { value: '1.0.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Compatibility Config' }));

    await waitFor(() => {
      expect(setCompatSpy).toHaveBeenCalledWith(ASSET_JACKET_ID, {
        rigId: 'arven_mannequin_unisex_v1',
        skeletonVersion: '1.0.0',
        slot: 'outerwear',
        anchor: 'spine_upper',
        incompatibleSlots: [],
      });
    });

    // Remove compatibility on first garment
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[0]!);
    await waitFor(() => {
      expect(removeCompatSpy).toHaveBeenCalledWith(ASSET_TEE_ID);
    });

    // Create public preset 'Linen Harian'
    fireEvent.click(screen.getByRole('button', { name: 'Create Public Preset' }));
    fireEvent.change(screen.getByLabelText(/Preset Title/i), {
      target: { value: 'Linen Harian' },
    });
    const submitPresetButtons = screen.getAllByRole('button', {
      name: 'Create Public Preset',
    });
    fireEvent.click(submitPresetButtons[submitPresetButtons.length - 1]!);

    await waitFor(() => {
      expect(createPresetSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Linen Harian',
          rigId: 'arven_mannequin_unisex_v1',
        }),
      );
      expect(screen.getAllByText('Linen Harian').length).toBeGreaterThan(0);
    });

    // Delete public preset
    const deletePresetBtns = screen.getAllByRole('button', { name: 'Delete Preset' });
    fireEvent.click(deletePresetBtns[0]!);
    await waitFor(() => {
      expect(deletePresetSpy).toHaveBeenCalled();
    });

    expect(container.textContent).not.toContain('\u2014');
  });

  it('enforces read-only mode on AdminOutfitStudioView for CONTENT role (asset.read without asset.publish)', async () => {
    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: makeStaffUser({
        roles: ['CONTENT'],
        permissions: ['asset.read'],
      }),
      mfaRequired: false,
    });
    vi.spyOn(adminApi, 'listOutfitStudioGarments').mockResolvedValue(
      makeGarmentDiagnostics(),
    );
    vi.spyOn(adminApi, 'listOutfitStudioPresets').mockResolvedValue(makePublicPresets());
    vi.spyOn(adminApi, 'getPublicOutfitStudioCatalog').mockResolvedValue(
      makePublicCatalog(),
    );

    render(
      <ToastProvider>
        <AdminOutfitStudioView />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Read-Only Access Mode')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: 'Create Public Preset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Configure Compatibility' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Preset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Preset' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Preview 3D Mannequin' })).toBeTruthy();
  });

  it('calls admin experience API endpoints and passes static anti-slop scan across all Phase 08 admin files', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [],
            meta: { requestId: 'req-zones' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-admin-p8' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 204 }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const zones = await adminApi.listShowroomZones();
    expect(zones).toEqual([]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/showroom/zones');

    await adminApi.removeAssetOutfitCompatibility(ASSET_JACKET_ID);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `/api/v1/admin/3d-assets/${ASSET_JACKET_ID}/outfit-compatibility`,
    );
    const deleteHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(deleteHeaders.get('x-csrf-token')).toBe('csrf-admin-p8');

    const phase08AdminFiles = [
      'src/app/experience/showroom/page.tsx',
      'src/app/experience/outfit-studio/page.tsx',
      'src/components/experience/admin-showroom-view.tsx',
      'src/components/experience/admin-outfit-studio-view.tsx',
      'src/lib/api-client.ts',
      'src/lib/ops-helpers.ts',
      'src/lib/permissions.ts',
    ];

    for (const relPath of phase08AdminFiles) {
      const fullPath = path.resolve(import.meta.dirname, '..', relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lower = content.toLowerCase();

      expect(content, `${relPath} must not contain em-dash`).not.toContain('\u2014');
      expect(lower, `${relPath} must not use #8b897f`).not.toContain('#8b897f');
      expect(lower, `${relPath} must not contain pink hex`).not.toMatch(
        /#(ff69b4|ec4899|f472b6|ff00ff|db2777)/,
      );
    }
  });
});
