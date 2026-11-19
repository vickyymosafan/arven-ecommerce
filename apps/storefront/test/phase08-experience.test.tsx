import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  AddOutfitToCartResultDto,
  CartDto,
  OutfitSceneDto,
  OutfitStudioCatalogDto,
  ShowroomZonePublicDto,
} from '@arven/contracts';
import type { ShowroomCameraControlHandle } from '@arven/three-engine/showroom';
import { ToastProvider } from '@arven/ui';
import { SavedOutfitsView } from '../src/components/account/saved-outfits-view';
import { OutfitStudioView } from '../src/components/experience/outfit-studio-view';
import { ShowroomView } from '../src/components/experience/showroom-view';
import { clearCsrfTokenCache, storefrontApi } from '../src/lib/api-client';
import {
  OUTFIT_STUDIO_DISCLOSURE,
  OUTFIT_STUDIO_RIG_CONTRACT,
  buildOutfitStudioHrefFromScene,
  computeDraftLiveTotalIdr,
  countDraftSlots,
  evaluateClientOutfitSelection,
  findConflictForCandidate,
  formatOutfitCompatibilityError,
  formatSlotConflictSummary,
  parseApiIssueToken,
  parseOutfitDraftSearchParams,
  serializeOutfitDraftSearchParams,
} from '../src/lib/outfit-helpers';

const { mockRouterReplace, mockRouter, mockCameraHandle } = vi.hoisted(() => {
  const mockRouterReplace = vi.fn();
  return {
    mockRouterReplace,
    mockRouter: {
      replace: mockRouterReplace,
      push: vi.fn(),
    },
    mockCameraHandle: {
      rotateBy: vi.fn(),
      moveForward: vi.fn(),
      focusHotspot: vi.fn(),
      resetView: vi.fn(),
    } satisfies ShowroomCameraControlHandle,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/account/outfits',
}));

vi.mock('@/components/experience/showroom-3d-island', async () => {
  const React = await import('react');
  return {
    Showroom3DIsland: (props: {
      activeZoneCode: string;
      zoneTitle?: string;
      onControlsReady?: (handle: ShowroomCameraControlHandle | null) => void;
      onWebGLFallback?: (reason: string) => void;
    }) => {
      const onControlsReady = props.onControlsReady;
      React.useEffect(() => {
        onControlsReady?.(mockCameraHandle);
        return () => {
          onControlsReady?.(null);
        };
      }, [onControlsReady]);
      return (
        <div
          data-testid="mock-showroom-3d-island"
          data-active-zone={props.activeZoneCode}
        >
          <span>3D Showroom Stage: {props.zoneTitle}</span>
          <button
            type="button"
            data-testid="trigger-showroom-fallback"
            onClick={() => props.onWebGLFallback?.('context_lost')}
          >
            Simulate WebGL Fallback
          </button>
        </div>
      );
    },
  };
});

vi.mock('@/components/experience/outfit-studio-3d-island', () => ({
  OutfitStudio3DIsland: (props: {
    rigId: string;
    activeSlotCount?: number;
    onWebGLFallback?: (reason: string) => void;
  }) => (
    <div
      data-testid="mock-outfit-studio-3d-island"
      data-rig-id={props.rigId}
      data-slot-count={String(props.activeSlotCount ?? 0)}
    >
      <span>3D Mannequin Stage: {props.rigId}</span>
      <button
        type="button"
        data-testid="trigger-outfit-fallback"
        onClick={() => props.onWebGLFallback?.('context_lost')}
      >
        Simulate Outfit WebGL Fallback
      </button>
    </div>
  ),
}));

const PROD_TEE_ID = '11111111-1111-4111-8111-111111111101';
const VAR_TEE_ID = '22222222-2222-4222-8222-222222222201';
const ASSET_TEE_ID = '33333333-3333-4333-8333-333333333301';
const PRESET_TEE_ID = '44444444-4444-4444-8444-444444444401';

const PROD_POPLIN_ID = '11111111-1111-4111-8111-111111111102';
const VAR_POPLIN_ID = '22222222-2222-4222-8222-222222222202';
const ASSET_POPLIN_ID = '33333333-3333-4333-8333-333333333302';

const PROD_TROUSER_ID = '11111111-1111-4111-8111-111111111103';
const VAR_TROUSER_ID = '22222222-2222-4222-8222-222222222203';
const ASSET_TROUSER_ID = '33333333-3333-4333-8333-333333333303';

const PROD_OVERSHIRT_ID = '11111111-1111-4111-8111-111111111104';
const VAR_OVERSHIRT_ID = '22222222-2222-4222-8222-222222222204';
const ASSET_OVERSHIRT_ID = '33333333-3333-4333-8333-333333333304';

const PUBLIC_PRESET_ID = '55555555-5555-4555-8555-555555555501';
const SAVED_SCENE_ID = '66666666-6666-4666-8666-666666666601';

function makeShowroomZones(): ShowroomZonePublicDto[] {
  return [
    {
      id: '77777777-7777-4777-8777-777777777701',
      code: 'atrium-entrance',
      title: 'Atrium',
      description: 'Galeri pembuka koleksi kontemporer ARVEN.',
      sortOrder: 0,
      sceneUrl: '/api/v1/showroom/zones/atrium-entrance/scene',
      liteSceneUrl: '/api/v1/showroom/zones/atrium-entrance/scene-lite',
      posterUrl: '/api/v1/showroom/zones/atrium-entrance/poster',
      sceneBytes: 1_450_000,
      liteSceneBytes: 820_000,
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
          position: [2.4, 0, -2.5],
        },
      ],
      lightingPreset: 'arven_studio_neutral_v1',
      hotspots: [
        {
          id: '88888888-8888-4888-8888-888888888801',
          zoneId: '77777777-7777-4777-8777-777777777701',
          productId: PROD_TEE_ID,
          productSlug: 'essentials-heavyweight-crew-tee',
          productName: 'Essentials Heavyweight Crew Tee',
          variantId: VAR_TEE_ID,
          label: 'Heavyweight Crew Tee',
          fromPriceIdr: 499_000,
          primaryImageUrl: '/images/crew-tee.svg',
          primaryImageAlt: 'Essentials Heavyweight Crew Tee',
          has3dEnabled: true,
          position: [-1.2, 1.1, 0.4],
          sortOrder: 0,
        },
      ],
    },
    {
      id: '77777777-7777-4777-8777-777777777702',
      code: 'tailoring-gallery',
      title: 'Galeri Tailoring',
      description: 'Siluet wol terstruktur dan celana lipit lebar.',
      sortOrder: 1,
      sceneUrl: '/api/v1/showroom/zones/tailoring-gallery/scene',
      liteSceneUrl: '/api/v1/showroom/zones/tailoring-gallery/scene-lite',
      posterUrl: '/api/v1/showroom/zones/tailoring-gallery/poster',
      sceneBytes: 1_620_000,
      liteSceneBytes: 910_000,
      cameraBaseline: {
        fovDeg: 45,
        position: [0, 1.7, 5.5],
        target: [0, 1.0, 0],
        minDistance: 1.4,
        maxDistance: 12,
      },
      portals: [
        {
          targetZoneCode: 'atrium-entrance',
          label: 'Atrium',
          position: [-2.4, 0, 2.5],
        },
      ],
      lightingPreset: 'arven_warm_editorial_v1',
      hotspots: [],
    },
  ];
}

function makeOutfitCatalog(): OutfitStudioCatalogDto {
  return {
    rig: {
      rigId: OUTFIT_STUDIO_RIG_CONTRACT.RIG_ID,
      skeletonVersion: OUTFIT_STUDIO_RIG_CONTRACT.SKELETON_VERSION,
      slots: OUTFIT_STUDIO_RIG_CONTRACT.SLOTS,
      anchors: OUTFIT_STUDIO_RIG_CONTRACT.ANCHORS,
      modelUrl: '/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model',
      mobileModelUrl: '/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model-lite',
      posterUrl: '/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/poster',
    },
    garments: [
      {
        productId: PROD_TEE_ID,
        productSlug: 'essentials-heavyweight-crew-tee',
        productName: 'Essentials Heavyweight Crew Tee',
        material: '100% Organic Cotton',
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
        materialSlots: [
          {
            slotId: 'mat_fabric_primary',
            meshNames: ['garment_body'],
            materialName: 'mat_fabric_primary',
            customizable: true,
            defaultBaseColorHex: '#17191B',
            roughnessRange: [0.4, 0.95],
            metalnessRange: [0.0, 0.15],
          },
        ],
        variants: [
          {
            id: VAR_TEE_ID,
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
        customizationPresets: [
          {
            id: PRESET_TEE_ID,
            productId: PROD_TEE_ID,
            assetId: ASSET_TEE_ID,
            code: 'charcoal-cotton',
            label: 'Charcoal Cotton',
            swatchHex: '#17191B',
            materialOverrides: {
              mat_fabric_primary: { baseColorHex: '#17191B' },
            },
            variantId: VAR_TEE_ID,
            variantSku: 'ARV-TEE-001-M-CHR',
            variantColor: 'Charcoal',
            isActive: true,
            sortOrder: 0,
            createdAt: '2026-11-19T00:00:00.000Z',
            updatedAt: '2026-11-19T00:00:00.000Z',
          },
        ],
      },
      {
        productId: PROD_POPLIN_ID,
        productSlug: 'atelier-oversized-poplin-shirt',
        productName: 'Atelier Oversized Poplin Shirt',
        material: '100% Cotton Poplin',
        fit: 'Oversized',
        assetId: ASSET_POPLIN_ID,
        assetVersion: 1,
        modelUrl: `/api/v1/3d-assets/${ASSET_POPLIN_ID}/model`,
        mobileModelUrl: `/api/v1/3d-assets/${ASSET_POPLIN_ID}/model-lite`,
        posterUrl: `/api/v1/3d-assets/${ASSET_POPLIN_ID}/poster`,
        compatibility: {
          rigId: 'arven_mannequin_unisex_v1',
          skeletonVersion: '1.0.0',
          slot: 'top',
          anchor: 'spine_upper',
          incompatibleSlots: ['outerwear'],
        },
        materialSlots: [],
        variants: [
          {
            id: VAR_POPLIN_ID,
            sku: 'ARV-SHT-001-M-IVR',
            size: 'M',
            color: 'Ivory',
            colorHex: '#F8F7F3',
            priceIdr: 899_000,
            compareAtPriceIdr: null,
            availableQty: 8,
            inStock: true,
          },
        ],
        customizationPresets: [],
      },
      {
        productId: PROD_TROUSER_ID,
        productSlug: 'form-wide-leg-tailored-trouser',
        productName: 'Form Wide-Leg Tailored Trouser',
        material: 'Wool Blend',
        fit: 'Wide-Leg',
        assetId: ASSET_TROUSER_ID,
        assetVersion: 1,
        modelUrl: `/api/v1/3d-assets/${ASSET_TROUSER_ID}/model`,
        mobileModelUrl: `/api/v1/3d-assets/${ASSET_TROUSER_ID}/model-lite`,
        posterUrl: `/api/v1/3d-assets/${ASSET_TROUSER_ID}/poster`,
        compatibility: {
          rigId: 'arven_mannequin_unisex_v1',
          skeletonVersion: '1.0.0',
          slot: 'bottom',
          anchor: 'pelvis',
          incompatibleSlots: [],
        },
        materialSlots: [],
        variants: [
          {
            id: VAR_TROUSER_ID,
            sku: 'ARV-TRS-001-32-CHR',
            size: '32',
            color: 'Charcoal',
            colorHex: '#17191B',
            priceIdr: 1_299_000,
            compareAtPriceIdr: null,
            availableQty: 7,
            inStock: true,
          },
        ],
        customizationPresets: [],
      },
      {
        productId: PROD_OVERSHIRT_ID,
        productSlug: 'atelier-boxy-wool-overshirt',
        productName: 'Atelier Boxy Wool Overshirt',
        material: '100% Virgin Wool',
        fit: 'Boxy',
        assetId: ASSET_OVERSHIRT_ID,
        assetVersion: 1,
        modelUrl: `/api/v1/3d-assets/${ASSET_OVERSHIRT_ID}/model`,
        mobileModelUrl: `/api/v1/3d-assets/${ASSET_OVERSHIRT_ID}/model-lite`,
        posterUrl: `/api/v1/3d-assets/${ASSET_OVERSHIRT_ID}/poster`,
        compatibility: {
          rigId: 'arven_mannequin_unisex_v1',
          skeletonVersion: '1.0.0',
          slot: 'outerwear',
          anchor: 'spine_upper',
          incompatibleSlots: [],
        },
        materialSlots: [],
        variants: [
          {
            id: VAR_OVERSHIRT_ID,
            sku: 'ARV-OVR-001-M-CHR',
            size: 'M',
            color: 'Charcoal',
            colorHex: '#17191B',
            priceIdr: 1_490_000,
            compareAtPriceIdr: null,
            availableQty: 5,
            inStock: true,
          },
        ],
        customizationPresets: [],
      },
    ],
    publicPresets: [
      {
        id: PUBLIC_PRESET_ID,
        title: 'Seragam Atelier',
        rigId: 'arven_mannequin_unisex_v1',
        skeletonVersion: '1.0.0',
        isPublicPreset: true,
        slots: [
          {
            slot: 'top',
            productId: PROD_TEE_ID,
            productSlug: 'essentials-heavyweight-crew-tee',
            productName: 'Essentials Heavyweight Crew Tee',
            variantId: VAR_TEE_ID,
            sku: 'ARV-TEE-001-M-CHR',
            size: 'M',
            color: 'Charcoal',
            assetId: ASSET_TEE_ID,
            presetId: PRESET_TEE_ID,
            presetCode: 'charcoal-cotton',
            presetLabel: 'Charcoal Cotton',
            swatchHex: '#17191B',
            unitPriceIdr: 499_000,
            availableQty: 12,
            inStock: true,
            posterUrl: `/api/v1/3d-assets/${ASSET_TEE_ID}/poster`,
            stale: false,
            staleReasons: [],
          },
          {
            slot: 'bottom',
            productId: PROD_TROUSER_ID,
            productSlug: 'form-wide-leg-tailored-trouser',
            productName: 'Form Wide-Leg Tailored Trouser',
            variantId: VAR_TROUSER_ID,
            sku: 'ARV-TRS-001-32-CHR',
            size: '32',
            color: 'Charcoal',
            assetId: ASSET_TROUSER_ID,
            presetId: null,
            presetCode: null,
            presetLabel: null,
            swatchHex: '#17191B',
            unitPriceIdr: 1_299_000,
            availableQty: 7,
            inStock: true,
            posterUrl: `/api/v1/3d-assets/${ASSET_TROUSER_ID}/poster`,
            stale: false,
            staleReasons: [],
          },
        ],
        liveTotalIdr: 1_798_000,
        hasStaleItems: false,
        createdAt: '2026-11-19T00:00:00.000Z',
        updatedAt: '2026-11-19T00:00:00.000Z',
      },
    ],
  };
}

function makeSavedOutfitScene(overrides: Partial<OutfitSceneDto> = {}): OutfitSceneDto {
  return {
    id: SAVED_SCENE_ID,
    title: 'Paduan Monokrom Sore',
    rigId: 'arven_mannequin_unisex_v1',
    skeletonVersion: '1.0.0',
    isPublicPreset: false,
    slots: [
      {
        slot: 'top',
        productId: PROD_TEE_ID,
        productSlug: 'essentials-heavyweight-crew-tee',
        productName: 'Essentials Heavyweight Crew Tee',
        variantId: VAR_TEE_ID,
        sku: 'ARV-TEE-001-M-CHR',
        size: 'M',
        color: 'Charcoal',
        assetId: ASSET_TEE_ID,
        presetId: PRESET_TEE_ID,
        presetCode: 'charcoal-cotton',
        presetLabel: 'Charcoal Cotton',
        swatchHex: '#17191B',
        unitPriceIdr: 499_000,
        availableQty: 12,
        inStock: true,
        posterUrl: `/api/v1/3d-assets/${ASSET_TEE_ID}/poster`,
        stale: false,
        staleReasons: [],
      },
      {
        slot: 'bottom',
        productId: PROD_TROUSER_ID,
        productSlug: 'form-wide-leg-tailored-trouser',
        productName: 'Form Wide-Leg Tailored Trouser',
        variantId: VAR_TROUSER_ID,
        sku: 'ARV-TRS-001-32-CHR',
        size: '32',
        color: 'Charcoal',
        assetId: ASSET_TROUSER_ID,
        presetId: null,
        presetCode: null,
        presetLabel: null,
        swatchHex: '#17191B',
        unitPriceIdr: 1_299_000,
        availableQty: 7,
        inStock: true,
        posterUrl: `/api/v1/3d-assets/${ASSET_TROUSER_ID}/poster`,
        stale: false,
        staleReasons: [],
      },
    ],
    liveTotalIdr: 1_798_000,
    hasStaleItems: false,
    createdAt: '2026-11-19T01:00:00.000Z',
    updatedAt: '2026-11-19T01:00:00.000Z',
    ...overrides,
  };
}

describe('Phase 08 Storefront Virtual Showroom, Outfit Studio & Account Saved Outfits', () => {
  afterEach(() => {
    cleanup();
    clearCsrfTokenCache();
    vi.restoreAllMocks();
    mockRouterReplace.mockReset();
    mockCameraHandle.rotateBy.mockReset();
    mockCameraHandle.moveForward.mockReset();
    mockCameraHandle.focusHotspot.mockReset();
    mockCameraHandle.resetView.mockReset();
  });

  it('parses and serializes URL draft parameters, discards invalid UUIDs/price keys, and evaluates symmetric LAYER_CONFLICT', () => {
    const catalog = makeOutfitCatalog();

    const parsed = parseOutfitDraftSearchParams(
      new URLSearchParams(
        `top=${VAR_TEE_ID}:${PRESET_TEE_ID}&bottom=${VAR_TROUSER_ID}&outerwear=invalid-uuid&footwear=${VAR_TEE_ID}&priceIdr=100`,
      ),
      catalog,
    );

    expect(parsed.slots.top).toEqual({
      slot: 'top',
      variantId: VAR_TEE_ID,
      presetId: PRESET_TEE_ID,
    });
    expect(parsed.slots.bottom).toEqual({
      slot: 'bottom',
      variantId: VAR_TROUSER_ID,
      presetId: null,
    });
    expect(parsed.slots.outerwear).toBeUndefined();
    expect(parsed.slots.footwear).toBeUndefined();
    expect(parsed.discardedCount).toBe(2);

    const serialized = serializeOutfitDraftSearchParams(parsed.slots);
    expect(serialized).toContain(`top=${encodeURIComponent(`${VAR_TEE_ID}:${PRESET_TEE_ID}`)}`);
    expect(serialized).toContain(`bottom=${VAR_TROUSER_ID}`);
    expect(serialized).not.toContain('price');

    expect(countDraftSlots(parsed.slots)).toBe(2);
    expect(computeDraftLiveTotalIdr(catalog, parsed.slots)).toBe(1_798_000);

    // Symmetric LAYER_CONFLICT check: overshirt in outerwear + poplin shirt candidate
    const poplinGarment = catalog.garments.find((g) => g.productId === PROD_POPLIN_ID)!;
    const conflict = findConflictForCandidate(
      {
        outerwear: {
          slot: 'outerwear',
          variantId: VAR_OVERSHIRT_ID,
          presetId: null,
        },
      },
      poplinGarment,
      catalog,
    );
    expect(conflict).not.toBeNull();
    expect(conflict?.conflictingSlot).toBe('outerwear');
    expect(conflict?.message).toBe(
      'Kemeja oversized ini tidak kompatibel dengan outerwear yang sedang aktif.',
    );

    const evaluation = evaluateClientOutfitSelection(catalog, {
      top: { slot: 'top', variantId: VAR_POPLIN_ID, presetId: null },
      outerwear: { slot: 'outerwear', variantId: VAR_OVERSHIRT_ID, presetId: null },
    });
    expect(evaluation.valid).toBe(false);
    expect(evaluation.violations[0]?.reason).toBe('LAYER_CONFLICT');

    const issueParsed = parseApiIssueToken(
      `SKELETON_VERSION_MISMATCH|productId=${PROD_OVERSHIRT_ID}|Skeleton 0.9.0 incompatible`,
    );
    expect(issueParsed.reason).toBe('SKELETON_VERSION_MISMATCH');
    expect(issueParsed.productId).toBe(PROD_OVERSHIRT_ID);

    expect(
      formatSlotConflictSummary(
        [
          {
            field: 'slots.outerwear',
            issue: `SKELETON_VERSION_MISMATCH|productId=${PROD_OVERSHIRT_ID}|Mismatch`,
          },
        ],
        'Fallback error',
        catalog,
      ),
    ).toContain('Versi kerangka manekin tidak cocok');

    expect(
      formatOutfitCompatibilityError({
        reason: 'SLOT_MISMATCH',
        slot: 'top',
      }),
    ).toContain('Atasan');
  });

  it('renders ShowroomView with zone radiogroup, keyboard navigation, hotspot quick-card, 2D fallback, and SSR catalog directory', async () => {
    const zones = makeShowroomZones();

    const { container } = render(
      <ToastProvider>
        <ShowroomView initialZones={zones} initialZoneCode="atrium-entrance" />
      </ToastProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Atrium', level: 1 })).toBeTruthy();
    expect(screen.getByText('Katalog Zona Ruang Pamer')).toBeTruthy();

    // Camera controls invoke handle
    fireEvent.click(screen.getByRole('button', { name: 'Putar Kiri 45°' }));
    expect(mockCameraHandle.rotateBy).toHaveBeenCalledWith(-Math.PI / 4);

    // Open hotspot quick card from DOM hotspot strip
    const hotspotBtn = screen.getByRole('button', {
      name: /Produk: Essentials Heavyweight Crew Tee, mulai Rp\s*499\.000/i,
    });
    fireEvent.click(hotspotBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Lihat Detail Produk' })).toBeTruthy();
    });
    expect(mockCameraHandle.focusHotspot).toHaveBeenCalledWith(
      '88888888-8888-4888-8888-888888888801',
    );

    // Close quick-card
    fireEvent.click(screen.getByRole('button', { name: 'Tutup Kartu Produk' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // Keyboard navigation on zone radiogroup
    const atriumRadio = screen.getByRole('radio', { name: /Atrium/i });
    fireEvent.keyDown(atriumRadio, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Galeri Tailoring', level: 1 })).toBeTruthy();
    });

    // Switch back via Portal button
    fireEvent.click(screen.getByRole('button', { name: /Portal: Atrium/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Atrium', level: 1 })).toBeTruthy();
    });

    // Switch to 2D Poster fallback
    fireEvent.click(screen.getByRole('button', { name: 'Poster 2D' }));
    expect(screen.getByTestId('showroom-2d-fallback')).toBeTruthy();
    expect(screen.getByText('Mode Poster 2D Aktif')).toBeTruthy();

    expect(container.textContent).not.toContain('\u2014');
  });

  it('renders OutfitStudioView with permanent disclosure, inline LAYER_CONFLICT alert + resolution, server validate, add-to-cart, and saved outfit creation', async () => {
    const catalog = makeOutfitCatalog();
    const savedScene = makeSavedOutfitScene();

    vi.spyOn(storefrontApi, 'getCurrentUser').mockResolvedValue({
      user: {
        id: '99999999-9999-4999-8999-999999999999',
        email: 'member@arven.id',
        fullName: 'Arven Member',
        phone: null,
        status: 'ACTIVE',
        roles: ['CUSTOMER'],
        permissions: [],
        mfaEnabled: false,
        mfaVerified: false,
        mfaVerifiedAt: null,
      },
      mfaRequired: false,
    });
    vi.spyOn(storefrontApi.outfitScenes, 'list').mockResolvedValue([savedScene]);
    const validateSpy = vi
      .spyOn(storefrontApi.outfitStudio, 'validate')
      .mockResolvedValue({
        valid: true,
        rigId: 'arven_mannequin_unisex_v1',
        skeletonVersion: '1.0.0',
        slotCount: 2,
      });

    const mockCart: CartDto = {
      id: 'cart-1',
      status: 'ACTIVE',
      ownerType: 'USER',
      currency: 'IDR',
      itemCount: 2,
      totalQuantity: 2,
      subtotalIdr: 1_989_000,
      hasUnavailableItems: false,
      items: [],
      updatedAt: '2026-11-19T01:00:00.000Z',
    };
    const addToCartResult: AddOutfitToCartResultDto = {
      cart: mockCart,
      results: [
        {
          slot: 'top',
          variantId: VAR_POPLIN_ID,
          productId: PROD_POPLIN_ID,
          status: 'ADDED',
          reason: null,
        },
        {
          slot: 'bottom',
          variantId: VAR_TROUSER_ID,
          productId: PROD_TROUSER_ID,
          status: 'ADDED',
          reason: null,
        },
      ],
    };
    const addToCartSpy = vi
      .spyOn(storefrontApi.outfitStudio, 'addToCart')
      .mockResolvedValue(addToCartResult);
    const createSceneSpy = vi
      .spyOn(storefrontApi.outfitScenes, 'create')
      .mockResolvedValue({
        ...savedScene,
        id: '66666666-6666-4666-8666-666666666602',
        title: 'Paduan Galeri Baru',
      });

    const { container } = render(
      <ToastProvider>
        <OutfitStudioView initialCatalog={catalog} />
      </ToastProvider>,
    );

    // Permanent mandatory disclosure must be visible
    expect(screen.getByText(OUTFIT_STUDIO_DISCLOSURE)).toBeTruthy();

    // Apply public preset 'Seragam Atelier' (top tee + bottom trouser)
    fireEvent.click(screen.getByRole('button', { name: /Seragam Atelier/i }));
    expect(screen.getByText('Slot Terisi: 2 / 5')).toBeTruthy();

    // Switch to Outerwear slot and select Atelier Boxy Wool Overshirt
    fireEvent.click(screen.getByRole('radio', { name: /Outerwear/i }));
    fireEvent.click(screen.getByRole('radio', { name: /Atelier Boxy Wool Overshirt/i }));
    expect(screen.getByText('Slot Terisi: 3 / 5')).toBeTruthy();

    // Switch back to Atasan (top) slot and attempt to select Atelier Oversized Poplin Shirt -> LAYER_CONFLICT
    fireEvent.click(screen.getByRole('radio', { name: /Atasan/i }));
    fireEvent.click(screen.getByRole('radio', { name: /Atelier Oversized Poplin Shirt/i }));

    expect(screen.getByText('Kombinasi Layer Tidak Kompatibel')).toBeTruthy();
    expect(
      screen.getAllByText(
        'Kemeja oversized ini tidak kompatibel dengan outerwear yang sedang aktif.',
      ).length,
    ).toBeGreaterThanOrEqual(1);

    // Resolve conflict in one click via 'Lepas Outerwear & Pasang'
    fireEvent.click(screen.getByRole('button', { name: /Lepas Outerwear & Pasang/i }));
    expect(screen.queryByText('Kombinasi Layer Tidak Kompatibel')).toBeNull();
    expect(screen.getByText('Slot Terisi: 2 / 5')).toBeTruthy();

    // Validate on server
    fireEvent.click(screen.getByRole('button', { name: 'Validasi' }));
    await waitFor(() => {
      expect(validateSpy).toHaveBeenCalled();
      expect(screen.getByText(/Validasi server berhasil/i)).toBeTruthy();
    });

    // Add compatible items to bag
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Item ke Tas' }));
    await waitFor(() => {
      expect(addToCartSpy).toHaveBeenCalledWith({
        rigId: 'arven_mannequin_unisex_v1',
        slots: [
          { slot: 'top', variantId: VAR_POPLIN_ID, presetId: null },
          { slot: 'bottom', variantId: VAR_TROUSER_ID, presetId: null },
        ],
      });
      expect(screen.getByText('Hasil Penambahan ke Tas')).toBeTruthy();
      expect(screen.getAllByText('ADDED').length).toBeGreaterThanOrEqual(2);
    });

    // Save outfit for authenticated customer
    await waitFor(() => {
      expect(screen.getByLabelText(/Judul Paduan/i)).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText(/Judul Paduan/i), {
      target: { value: 'Paduan Galeri Baru' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Paduan' }));

    await waitFor(() => {
      expect(createSceneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Paduan Galeri Baru',
          rigId: 'arven_mannequin_unisex_v1',
        }),
      );
      expect(screen.getByText('Paduan Galeri Baru')).toBeTruthy();
    });

    expect(container.textContent).not.toContain('\u2014');
  });

  it('renders SavedOutfitsView (/account/outfits) with 2D posters, live IDR totals, stale badge, rename, and delete', async () => {
    const scene = makeSavedOutfitScene({
      hasStaleItems: true,
    });
    expect(buildOutfitStudioHrefFromScene(scene)).toContain('/outfit-studio?');

    vi.spyOn(storefrontApi.outfitScenes, 'list').mockResolvedValue([scene]);
    const updateSpy = vi
      .spyOn(storefrontApi.outfitScenes, 'update')
      .mockResolvedValue({
        ...scene,
        title: 'Paduan Malam Arsitektural',
      });
    const removeSpy = vi
      .spyOn(storefrontApi.outfitScenes, 'remove')
      .mockResolvedValue(undefined);

    const { container } = render(
      <ToastProvider>
        <SavedOutfitsView />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Paduan Monokrom Sore')).toBeTruthy();
    });

    expect(screen.getByText('Stok atau varian berubah')).toBeTruthy();
    expect(screen.getByText(/Rp\s*1\.798\.000/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Buka di Studio' })).toBeTruthy();

    // Rename outfit
    fireEvent.click(screen.getByRole('button', { name: 'Ubah Nama' }));
    const input = screen.getByLabelText(/Nama Baru Paduan/i);
    fireEvent.change(input, { target: { value: 'Paduan Malam Arsitektural' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Nama' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(SAVED_SCENE_ID, {
        title: 'Paduan Malam Arsitektural',
      });
      expect(
        screen.getByRole('heading', { name: 'Paduan Malam Arsitektural' }),
      ).toBeTruthy();
    });

    // Delete outfit
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }));
    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledWith(SAVED_SCENE_ID);
      expect(screen.getByText('Belum ada paduan tersimpan.')).toBeTruthy();
    });

    expect(container.textContent).not.toContain('\u2014');
  });

  it('enforces zero em-dashes, zero #8B897F, zero pink hexes, and zero three.js imports on non-3D storefront files', () => {
    const phase08StorefrontFiles = [
      'src/app/showroom/page.tsx',
      'src/app/outfit-studio/page.tsx',
      'src/app/account/outfits/page.tsx',
      'src/components/experience/showroom-view.tsx',
      'src/components/experience/showroom-fallback.tsx',
      'src/components/experience/hotspot-quick-card.tsx',
      'src/components/experience/outfit-studio-view.tsx',
      'src/components/experience/outfit-slot-picker.tsx',
      'src/components/experience/saved-outfits-panel.tsx',
      'src/components/experience/outfit-studio-fallback.tsx',
      'src/components/account/saved-outfits-view.tsx',
      'src/components/storefront-shell.tsx',
      'src/components/account-shell.tsx',
      'src/lib/outfit-helpers.ts',
    ];

    const non3DFiles = [
      'src/app/account/outfits/page.tsx',
      'src/components/account/saved-outfits-view.tsx',
      'src/components/experience/showroom-fallback.tsx',
      'src/components/experience/hotspot-quick-card.tsx',
      'src/components/experience/outfit-slot-picker.tsx',
      'src/components/experience/saved-outfits-panel.tsx',
      'src/components/experience/outfit-studio-fallback.tsx',
      'src/components/storefront-shell.tsx',
      'src/components/account-shell.tsx',
      'src/lib/outfit-helpers.ts',
    ];

    for (const relPath of phase08StorefrontFiles) {
      const fullPath = path.resolve(import.meta.dirname, '..', relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lower = content.toLowerCase();

      expect(content, `${relPath} must not contain em-dash`).not.toContain('\u2014');
      expect(lower, `${relPath} must not use #8b897f`).not.toContain('#8b897f');
      expect(lower, `${relPath} must not contain pink hex`).not.toMatch(
        /#(ff69b4|ec4899|f472b6|ff00ff|db2777)/,
      );
    }

    for (const relPath of non3DFiles) {
      const fullPath = path.resolve(import.meta.dirname, '..', relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content, `${relPath} must not import three`).not.toMatch(
        /from\s+['"](three|@react-three\/|@arven\/three-engine)/,
      );
    }
  });
});
