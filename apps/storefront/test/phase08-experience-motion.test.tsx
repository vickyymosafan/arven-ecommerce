import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentType } from 'react';
import type { ShowroomZonePublicDto } from '@arven/contracts';
import type {
  OutfitSlotRenderItem,
  OutfitStudioExperienceProps,
} from '@arven/three-engine/outfit-studio';
import type {
  ShowroomCameraControlHandle,
  ShowroomExperienceProps,
} from '@arven/three-engine/showroom';

const { capturedShowroomProps, capturedOutfitProps, mockCameraHandle } =
  vi.hoisted(() => ({
    capturedShowroomProps: {
      current: null as ShowroomExperienceProps | null,
    },
    capturedOutfitProps: {
      current: null as OutfitStudioExperienceProps | null,
    },
    mockCameraHandle: {
      rotateBy: vi.fn(),
      moveForward: vi.fn(),
      focusHotspot: vi.fn(),
      resetView: vi.fn(),
    } satisfies ShowroomCameraControlHandle,
  }));

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
          return options?.loading ? (
            options.loading()
          ) : (
            <div data-testid="arven-3d-loading" />
          );
        }

        return <LoadedComponent {...props} />;
      };
    },
  };
});

vi.mock('@arven/three-engine/showroom', async () => {
  const React = await import('react');
  return {
    ShowroomExperience: (props: ShowroomExperienceProps) => {
      capturedShowroomProps.current = props;
      const onControlsReady = props.onControlsReady;
      React.useEffect(() => {
        onControlsReady?.(mockCameraHandle);
        return () => {
          onControlsReady?.(null);
        };
      }, [onControlsReady]);

      const activeZone =
        props.zones.find((z) => z.code === props.activeZoneCode) ??
        props.zones[0];

      return (
        <div
          data-testid="mock-showroom-experience"
          data-reduced-motion={String(Boolean(props.reducedMotion))}
          data-interaction-enabled={String(Boolean(props.interactionEnabled))}
          data-active-zone={props.activeZoneCode}
        >
          {activeZone?.hotspots[0] ? (
            <button
              type="button"
              data-testid="mock-hotspot-trigger"
              onClick={() => props.onHotspotSelect?.(activeZone.hotspots[0]!)}
            >
              Trigger Hotspot
            </button>
          ) : null}
        </div>
      );
    },
  };
});

vi.mock('@arven/three-engine/outfit-studio', async () => {
  return {
    OutfitStudioExperience: (props: OutfitStudioExperienceProps) => {
      capturedOutfitProps.current = props;
      return (
        <div
          data-testid="mock-outfit-studio-experience"
          data-reduced-motion={String(Boolean(props.reducedMotion))}
          data-interaction-enabled={String(Boolean(props.interactionEnabled))}
        >
          <button
            type="button"
            data-testid="mock-slot-loaded-trigger"
            onClick={() => props.onSlotLoaded?.('top', 'asset-top-1')}
          >
            Simulate Slot Loaded
          </button>
        </div>
      );
    },
  };
});

import { Showroom3DIsland } from '../src/components/experience/showroom-3d-island.js';
import { OutfitStudio3DIsland } from '../src/components/experience/outfit-studio-3d-island.js';

function makeFixtureZones(): ShowroomZonePublicDto[] {
  return [
    {
      id: 'zone-1',
      code: 'atrium-entrance',
      title: 'Atrium',
      description: 'Zona pembuka galeri ARVEN.',
      sortOrder: 0,
      sceneUrl: '/api/v1/showroom/zones/atrium-entrance/scene',
      liteSceneUrl: '/api/v1/showroom/zones/atrium-entrance/scene-lite',
      posterUrl: '/api/v1/showroom/zones/atrium-entrance/poster',
      sceneBytes: 120_000,
      liteSceneBytes: 80_000,
      cameraBaseline: {
        fovDeg: 45,
        position: [0, 1.8, 5.2],
        target: [0, 1.0, 0],
        minDistance: 1.5,
        maxDistance: 12,
      },
      portals: [
        {
          targetZoneCode: 'tailoring-gallery',
          label: 'Galeri Tailoring',
          position: [2.2, 0, -2.5],
        },
      ],
      lightingPreset: 'arven_studio_neutral_v1',
      hotspots: [
        {
          id: 'hs-1',
          zoneId: 'zone-1',
          productId: 'prod-1',
          productSlug: 'essentials-heavyweight-crew-tee',
          productName: 'Essentials Heavyweight Crew Tee',
          variantId: null,
          label: 'Heavyweight Crew Tee',
          fromPriceIdr: 499_000,
          primaryImageUrl: '/images/tee.webp',
          primaryImageAlt: 'Crew Tee',
          has3dEnabled: true,
          position: [1.1, 1.0, -0.8],
          sortOrder: 0,
        },
      ],
    },
    {
      id: 'zone-2',
      code: 'tailoring-gallery',
      title: 'Galeri Tailoring',
      description: 'Koleksi siluet terstruktur.',
      sortOrder: 1,
      sceneUrl: '/api/v1/showroom/zones/tailoring-gallery/scene',
      liteSceneUrl: '/api/v1/showroom/zones/tailoring-gallery/scene-lite',
      posterUrl: '/api/v1/showroom/zones/tailoring-gallery/poster',
      sceneBytes: 130_000,
      liteSceneBytes: 85_000,
      cameraBaseline: {
        fovDeg: 45,
        position: [0, 1.8, 5.4],
        target: [0, 1.0, 0],
        minDistance: 1.5,
        maxDistance: 12,
      },
      portals: [
        {
          targetZoneCode: 'atrium-entrance',
          label: 'Atrium',
          position: [-2.2, 0, 2.5],
        },
      ],
      lightingPreset: 'arven_warm_editorial_v1',
      hotspots: [],
    },
  ];
}

function makeSlotItem(
  slot: OutfitSlotRenderItem['slot'],
  assetId: string,
  presetId: string | null = null,
): OutfitSlotRenderItem {
  return {
    slot,
    productId: `prod-${slot}`,
    variantId: `var-${slot}`,
    assetId,
    modelUrl: `/api/v1/3d-assets/${assetId}/model`,
    mobileModelUrl: `/api/v1/3d-assets/${assetId}/model-lite`,
    anchor: slot === 'bottom' ? 'pelvis' : 'spine_upper',
    materialSlots: [],
    presetId,
    materialOverrides: null,
  };
}

function mockWebGLAvailable(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    ((contextId: string) => {
      if (contextId === 'webgl2' || contextId === 'webgl') {
        return {
          getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
        } as unknown as RenderingContext;
      }
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext,
  );
}

function mockMatchMedia({
  reducedMotion = false,
  mobile = false,
}: {
  reducedMotion?: boolean;
  mobile?: boolean;
}) {
  let currentReducedMotion = reducedMotion;
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();

  const impl = vi.fn((query: string) => {
    const isReducedQuery = query.includes('prefers-reduced-motion');
    const isMobileQuery = query.includes('max-width: 767px');
    const matches = isReducedQuery
      ? currentReducedMotion
      : isMobileQuery
        ? mobile
        : false;

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: (
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        if (type === 'change') {
          const set = listeners.get(query) ?? new Set();
          set.add(listener);
          listeners.set(query, set);
        }
      },
      removeEventListener: (
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        if (type === 'change') {
          listeners.get(query)?.delete(listener);
        }
      },
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as MediaQueryList;
  });

  vi.stubGlobal('matchMedia', impl);

  return {
    emitReducedMotionChange(nextMatches: boolean) {
      currentReducedMotion = nextMatches;
      for (const [query, set] of listeners.entries()) {
        if (query.includes('prefers-reduced-motion')) {
          for (const listener of set) {
            listener({
              matches: nextMatches,
              media: query,
            } as MediaQueryListEvent);
          }
        }
      }
    },
  };
}

describe('Phase 08 Experience 3D Islands Motion & Accessibility', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    capturedShowroomProps.current = null;
    capturedOutfitProps.current = null;
    mockCameraHandle.rotateBy.mockReset();
    mockCameraHandle.moveForward.mockReset();
    mockCameraHandle.focusHotspot.mockReset();
    mockCameraHandle.resetView.mockReset();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1024,
    });
  });

  it('triggers onWebGLFallback("webgl-unavailable") and renders 2D fallback on both islands when WebGL is unsupported', async () => {
    mockMatchMedia({ reducedMotion: false });
    const onShowroomFallback = vi.fn();
    const onOutfitFallback = vi.fn();
    const zones = makeFixtureZones();

    const showroomRender = render(
      <Showroom3DIsland
        zones={zones}
        activeZoneCode="atrium-entrance"
        onWebGLFallback={onShowroomFallback}
      />,
    );

    await waitFor(() => {
      expect(onShowroomFallback).toHaveBeenCalledWith('webgl-unavailable');
      expect(screen.getByTestId('arven-showroom-fallback')).toBeTruthy();
    });

    expect(showroomRender.container.textContent).not.toContain('\u2014');
    expect(showroomRender.container.innerHTML.toLowerCase()).not.toContain('#ff69b4');
    expect(showroomRender.container.innerHTML.toLowerCase()).not.toContain('#ec4899');
    expect(showroomRender.container.innerHTML.toLowerCase()).not.toContain('#f472b6');
    expect(showroomRender.container.innerHTML.toLowerCase()).not.toContain('#8b897f');

    showroomRender.unmount();

    const outfitRender = render(
      <OutfitStudio3DIsland
        rigId="arven_mannequin_unisex_v1"
        rigModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model"
        rigMobileModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model-lite"
        rigPosterUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/poster"
        slots={{}}
        onWebGLFallback={onOutfitFallback}
      />,
    );

    await waitFor(() => {
      expect(onOutfitFallback).toHaveBeenCalledWith('webgl-unavailable');
      expect(screen.getByTestId('arven-outfit-studio-fallback')).toBeTruthy();
    });

    expect(outfitRender.container.textContent).not.toContain('\u2014');
    expect(outfitRender.container.innerHTML.toLowerCase()).not.toContain('#ff69b4');
    expect(outfitRender.container.innerHTML.toLowerCase()).not.toContain('#ec4899');
    expect(outfitRender.container.innerHTML.toLowerCase()).not.toContain('#f472b6');
    expect(outfitRender.container.innerHTML.toLowerCase()).not.toContain('#8b897f');
  });

  it('forwards prefers-reduced-motion: reduce and reacts to live media query changes on both islands', async () => {
    mockWebGLAvailable();
    const media = mockMatchMedia({ reducedMotion: true });
    const zones = makeFixtureZones();

    const showroomView = render(
      <Showroom3DIsland zones={zones} activeZoneCode="atrium-entrance" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-showroom-experience')).toBeTruthy();
    });

    expect(capturedShowroomProps.current?.reducedMotion).toBe(true);
    expect(
      screen
        .getByTestId('mock-showroom-experience')
        .getAttribute('data-reduced-motion'),
    ).toBe('true');

    act(() => {
      media.emitReducedMotionChange(false);
    });

    await waitFor(() => {
      expect(capturedShowroomProps.current?.reducedMotion).toBe(false);
    });

    showroomView.unmount();

    act(() => {
      media.emitReducedMotionChange(true);
    });

    render(
      <OutfitStudio3DIsland
        rigId="arven_mannequin_unisex_v1"
        rigModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model"
        rigMobileModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model-lite"
        rigPosterUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/poster"
        slots={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-outfit-studio-experience')).toBeTruthy();
    });

    expect(capturedOutfitProps.current?.reducedMotion).toBe(true);
  });

  it('drives ShowroomCameraControlHandle, enforces 44x44px controls, zone navigation, mobile scroll-lock, and polite aria-live announcements', async () => {
    mockWebGLAvailable();
    mockMatchMedia({ reducedMotion: false, mobile: true });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });

    const onZoneRequest = vi.fn();
    const onHotspotSelect = vi.fn();
    const zones = makeFixtureZones();

    const { rerender } = render(
      <Showroom3DIsland
        zones={zones}
        activeZoneCode="atrium-entrance"
        onZoneRequest={onZoneRequest}
        onHotspotSelect={onHotspotSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-showroom-experience')).toBeTruthy();
    });

    const stage = screen.getByTestId('showroom-stage');
    expect(stage.style.touchAction).toBe('pan-y');
    expect(capturedShowroomProps.current?.interactionEnabled).toBe(false);

    const touchToggle = screen.getByTestId('showroom-touch-toggle');
    expect(touchToggle.className).toContain('min-h-11');
    expect(touchToggle.className).toContain('min-w-11');
    expect(touchToggle.textContent).toBe('Aktifkan Putar 3D');

    fireEvent.click(touchToggle);
    expect(touchToggle.textContent).toBe('Kunci Gulir Halaman');
    expect(touchToggle.getAttribute('aria-pressed')).toBe('true');
    expect(stage.style.touchAction).toBe('none');
    expect(capturedShowroomProps.current?.interactionEnabled).toBe(true);
    expect(screen.getByTestId('showroom-live-region').textContent).toContain(
      'Mode putar 3D diaktifkan',
    );

    const rotateLeftBtn = screen.getByTestId('showroom-cam-rotate-left');
    const rotateRightBtn = screen.getByTestId('showroom-cam-rotate-right');
    const stepForwardBtn = screen.getByTestId('showroom-cam-step-forward');
    const resetBtn = screen.getByTestId('showroom-cam-reset');

    for (const btn of [rotateLeftBtn, rotateRightBtn, stepForwardBtn, resetBtn]) {
      expect(btn.className).toContain('min-h-11');
      expect(btn.className).toContain('min-w-11');
      expect(btn.className).toContain(
        'transition-[background-color,border-color,color]',
      );
      expect(btn.className).toContain('focus-visible:outline-[#82B0DC]');
    }

    fireEvent.click(rotateLeftBtn);
    expect(mockCameraHandle.rotateBy).toHaveBeenCalledWith(-Math.PI / 4);

    fireEvent.click(rotateRightBtn);
    expect(mockCameraHandle.rotateBy).toHaveBeenCalledWith(Math.PI / 4);

    fireEvent.click(stepForwardBtn);
    expect(mockCameraHandle.moveForward).toHaveBeenCalledWith(1.2);
    expect(screen.getByTestId('showroom-live-region').textContent).toContain(
      'melangkah maju',
    );

    fireEvent.click(resetBtn);
    expect(mockCameraHandle.resetView).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('showroom-live-region').textContent).toContain(
      'direset',
    );

    fireEvent.click(screen.getByTestId('showroom-portal-btn-tailoring-gallery'));
    expect(onZoneRequest).toHaveBeenCalledWith('tailoring-gallery');

    const atriumRadio = screen.getByTestId('showroom-zone-btn-atrium-entrance');
    fireEvent.keyDown(atriumRadio, { key: 'ArrowRight' });
    expect(onZoneRequest).toHaveBeenCalledWith('tailoring-gallery');

    fireEvent.click(screen.getByTestId('mock-hotspot-trigger'));
    expect(onHotspotSelect).toHaveBeenCalledWith(zones[0]!.hotspots[0]);
    expect(screen.getByTestId('showroom-live-region').textContent).toContain(
      'Essentials Heavyweight Crew Tee',
    );

    rerender(
      <Showroom3DIsland
        zones={zones}
        activeZoneCode="tailoring-gallery"
        onZoneRequest={onZoneRequest}
        onHotspotSelect={onHotspotSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('showroom-live-region').textContent).toContain(
        'Galeri Tailoring',
      );
    });
  });

  it('announces Outfit Studio slot attach/swap updates, enforces tabular-nums slot readout and mobile touch lock', async () => {
    mockWebGLAvailable();
    mockMatchMedia({ reducedMotion: false, mobile: true });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });

    const topA = makeSlotItem('top', 'asset-top-a', 'preset-1');
    const topB = makeSlotItem('top', 'asset-top-b', 'preset-2');

    const { rerender } = render(
      <OutfitStudio3DIsland
        rigId="arven_mannequin_unisex_v1"
        rigModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model"
        rigMobileModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model-lite"
        rigPosterUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/poster"
        slots={{}}
        activeSlotCount={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-outfit-studio-experience')).toBeTruthy();
    });

    const stage = screen.getByTestId('outfit-studio-stage');
    expect(stage.className).toContain('aspect-[3/4]');
    expect(stage.style.touchAction).toBe('pan-y');
    expect(capturedOutfitProps.current?.interactionEnabled).toBe(false);

    const slotCount = screen.getByTestId('outfit-studio-slot-count');
    expect(slotCount.className).toContain('tabular-nums');
    expect(slotCount.textContent).toBe('Slot Terisi: 0 / 5');

    const touchToggle = screen.getByTestId('outfit-studio-touch-toggle');
    expect(touchToggle.className).toContain('min-h-11');
    expect(touchToggle.className).toContain('min-w-11');
    fireEvent.click(touchToggle);
    expect(touchToggle.textContent).toBe('Kunci Gulir Halaman');
    expect(stage.style.touchAction).toBe('none');
    expect(capturedOutfitProps.current?.interactionEnabled).toBe(true);

    rerender(
      <OutfitStudio3DIsland
        rigId="arven_mannequin_unisex_v1"
        rigModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model"
        rigMobileModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model-lite"
        rigPosterUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/poster"
        slots={{ top: topA }}
        activeSlotCount={1}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('outfit-studio-slot-count').textContent).toBe(
        'Slot Terisi: 1 / 5',
      );
      expect(
        screen.getByTestId('outfit-studio-live-region').textContent,
      ).toContain('dipasang pada slot Atasan');
    });

    rerender(
      <OutfitStudio3DIsland
        rigId="arven_mannequin_unisex_v1"
        rigModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model"
        rigMobileModelUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/model-lite"
        rigPosterUrl="/api/v1/outfit-studio/rigs/arven_mannequin_unisex_v1/poster"
        slots={{ top: topB }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('outfit-studio-live-region').textContent,
      ).toContain('diganti');
    });

    fireEvent.click(screen.getByTestId('mock-slot-loaded-trigger'));
    expect(
      screen.getByTestId('outfit-studio-live-region').textContent,
    ).toContain('selesai dimuat ke manekin');
  });

  it('maintains dynamic bundle isolation without importing root @arven/three-engine', () => {
    const showroomSource = readFileSync(
      resolve(
        process.cwd(),
        'src/components/experience/showroom-3d-island.tsx',
      ),
      'utf8',
    );
    const outfitSource = readFileSync(
      resolve(
        process.cwd(),
        'src/components/experience/outfit-studio-3d-island.tsx',
      ),
      'utf8',
    );

    for (const source of [showroomSource, outfitSource]) {
      expect(source).not.toMatch(/from\s+['"]@arven\/three-engine['"]/);
      expect(source).not.toMatch(/import\(['"]@arven\/three-engine['"]\)/);
      expect(source).toContain('ssr: false');
      expect(source).not.toContain('\u2014');
      expect(source.toLowerCase()).not.toContain('#8b897f');
    }

    expect(showroomSource).toContain("import('@arven/three-engine/showroom')");
    expect(outfitSource).toContain("import('@arven/three-engine/outfit-studio')");
  });
});
