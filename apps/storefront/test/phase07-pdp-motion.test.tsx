import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import type { Product3DAssetPublicDto } from '@arven/contracts';
import {
  DEFAULT_ARVEN_MATERIAL_SLOTS,
  DEFAULT_ARVEN_PROVENANCE,
  buildDefaultAssetConfig,
} from '@arven/three-engine/glb';

vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: (
      loader: () => Promise<ComponentType<Record<string, unknown>>>,
      options?: { loading?: () => React.ReactNode },
    ) => {
      return function MockNextDynamic(props: Record<string, unknown>) {
        const [LoadedComponent, setLoadedComponent] = React.useState<ComponentType<
          Record<string, unknown>
        > | null>(null);

        React.useEffect(() => {
          let active = true;
          void loader().then((comp) => {
            if (active) {
              setLoadedComponent(() => comp);
            }
          });
          return () => {
            active = false;
          };
        }, []);

        if (!LoadedComponent) {
          return options?.loading ? options.loading() : <div data-testid="arven-3d-loading" />;
        }

        return <LoadedComponent {...props} />;
      };
    },
  };
});

import { Product3DViewerIsland } from '../src/components/catalog/product-3d-viewer-island.js';
import { storefrontApi } from '../src/lib/api-client.js';

function makeFixtureAsset(): Product3DAssetPublicDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    productId: '22222222-2222-4222-8222-222222222222',
    productSlug: 'atelier-boxy-wool-overshirt',
    productName: 'Atelier Boxy Wool Overshirt',
    variantId: null,
    version: 1,
    format: 'GLB',
    bytes: 18_432,
    modelUrl: '/api/v1/3d-assets/11111111-1111-4111-8111-111111111111/model',
    mobileModelUrl: '/api/v1/3d-assets/11111111-1111-4111-8111-111111111111/model-lite',
    posterUrl: '/api/v1/3d-assets/11111111-1111-4111-8111-111111111111/poster',
    config: buildDefaultAssetConfig({
      silhouette: 'overshirt',
      lightingPreset: 'arven_studio_neutral_v1',
      materialSlots: [...DEFAULT_ARVEN_MATERIAL_SLOTS],
      provenance: DEFAULT_ARVEN_PROVENANCE,
      defaultProfile: { triangles: 480, vertices: 360, bytes: 18_432 },
    }),
    customizationPresets: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        productId: '22222222-2222-4222-8222-222222222222',
        assetId: '11111111-1111-4111-8111-111111111111',
        code: 'charcoal-wool',
        label: 'Charcoal Wool',
        swatchHex: '#17191B',
        materialOverrides: {
          mat_fabric_primary: { baseColorHex: '#17191B', roughness: 0.88, metalness: 0.02 },
        },
        variantId: null,
        isActive: true,
        sortOrder: 0,
        createdAt: '2026-11-18T00:00:00.000Z',
        updatedAt: '2026-11-18T00:00:00.000Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        productId: '22222222-2222-4222-8222-222222222222',
        assetId: '11111111-1111-4111-8111-111111111111',
        code: 'ivory-twill',
        label: 'Ivory Twill',
        swatchHex: '#E9E4DA',
        materialOverrides: {
          mat_fabric_primary: { baseColorHex: '#E9E4DA', roughness: 0.85, metalness: 0.02 },
        },
        variantId: null,
        isActive: true,
        sortOrder: 1,
        createdAt: '2026-11-18T00:00:00.000Z',
        updatedAt: '2026-11-18T00:00:00.000Z',
      },
    ],
    publishedAt: '2026-11-18T00:00:00.000Z',
  };
}

describe('Product3DViewerIsland motion, fallback & telemetry boundary', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('triggers accessible 2D fallback cleanly in jsdom without WebGL and avoids em dashes', async () => {
    const telemetrySpy = vi.spyOn(storefrontApi, 'record3DTelemetry').mockResolvedValue({
      recorded: true,
      eventType: 'fallback_triggered',
      recordedAtUtc: '2026-11-18T00:00:00.000Z',
    });
    const onFallbackTo2D = vi.fn();
    const asset = makeFixtureAsset();

    const { container } = render(
      <Product3DViewerIsland
        asset={asset}
        activePresetId={asset.customizationPresets[0]?.id ?? null}
        onFallbackTo2D={onFallbackTo2D}
      />,
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('arven-3d-fallback')).toBeTruthy();
      },
      { timeout: 5000 },
    );

    expect(onFallbackTo2D).toHaveBeenCalledWith('webgl_context_unavailable');
    expect(telemetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'fallback_triggered',
        productId: asset.productId,
        assetId: asset.id,
        version: 1,
      }),
    );

    const switchBackBtn = screen.getByRole('button', { name: 'Kembali ke Foto 2D' });
    fireEvent.click(switchBackBtn);
    expect(onFallbackTo2D).toHaveBeenCalledWith('user_switched_to_2d');

    expect(container.textContent).not.toContain('\u2014');
    expect(container.innerHTML.toLowerCase()).not.toContain('#ff69b4');
    expect(container.innerHTML.toLowerCase()).not.toContain('#ec4899');
  });

  it('emits preset_selected telemetry without failing when telemetry endpoint errors', async () => {
    const telemetrySpy = vi
      .spyOn(storefrontApi, 'record3DTelemetry')
      .mockRejectedValue(new Error('network offline'));
    const asset = makeFixtureAsset();

    const { rerender } = render(
      <Product3DViewerIsland
        asset={asset}
        activePresetId={asset.customizationPresets[0]?.id ?? null}
      />,
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('arven-3d-fallback')).toBeTruthy();
      },
      { timeout: 5000 },
    );

    rerender(
      <Product3DViewerIsland
        asset={asset}
        activePresetId={asset.customizationPresets[1]?.id ?? null}
      />,
    );

    await waitFor(() => {
      expect(telemetrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'preset_selected',
          presetCode: 'ivory-twill',
        }),
      );
    });
  });
});
