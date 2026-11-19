'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import type {
  ShowroomHotspotPublicDto,
  ShowroomZonePublicDto,
} from '@arven/contracts';
import type {
  ShowroomCameraControlHandle,
  ShowroomExperienceProps,
} from '@arven/three-engine/showroom';

const DynamicShowroomExperience = dynamic(
  () =>
    import('@arven/three-engine/showroom').then((m) => m.ShowroomExperience),
  {
    ssr: false,
    loading: () => (
      <div
        data-theme="dark"
        className="flex aspect-[4/3] min-h-[300px] w-full flex-col items-center justify-center gap-3 bg-[#17191B] p-6 text-center sm:aspect-[16/10] lg:aspect-[16/9]"
        data-testid="showroom-3d-loading"
      >
        <span className="border border-[#46494C] bg-[#35383A] px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] text-[#C5A572]">
          Virtual Showroom
        </span>
        <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
          Memuat Ruang Pamer 3D...
        </p>
      </div>
    ),
  },
);

export interface Showroom3DIslandProps extends ShowroomExperienceProps {
  readonly className?: string;
  readonly zoneTitle?: string;
}

function probeWebGLSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2', {
        failIfMajorPerformanceCaveat: false,
      }) as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl', {
        failIfMajorPerformanceCaveat: false,
      }) as WebGLRenderingContext | null);

    if (!gl) {
      return false;
    }

    const loseExt = gl.getExtension('WEBGL_lose_context');
    if (loseExt) {
      loseExt.loseContext();
    }
    return true;
  } catch {
    return false;
  }
}

function readSystemReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readIsMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.innerWidth > 0) {
    return window.innerWidth < 768;
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(max-width: 767px)').matches;
  }
  return false;
}

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  mql.addEventListener('change', onStoreChange);
  return () => {
    mql.removeEventListener('change', onStoreChange);
  };
}

function subscribeMobileViewport(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener('resize', onStoreChange);
  return () => {
    window.removeEventListener('resize', onStoreChange);
  };
}

/**
 * Client-only Virtual Showroom 3D boundary loaded via `next/dynamic(..., { ssr: false })`.
 * Enforces mobile `touch-action: pan-y` scroll isolation, 44x44px camera & zone controls,
 * dark showcase focus rings (`#82B0DC`, 0ms outline transition), and polite live announcements.
 */
export function Showroom3DIsland({
  zones,
  activeZoneCode,
  selectedHotspotId = null,
  tierOverride,
  reducedMotion,
  interactionEnabled,
  dracoDecoderPath = '/decoders/draco/',
  ktx2TranscoderPath = '/decoders/basis/',
  onHotspotSelect,
  onZoneRequest,
  onWebGLFallback,
  onControlsReady,
  className,
  zoneTitle,
}: Showroom3DIslandProps) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [runtimeFallbackReason, setRuntimeFallbackReason] = useState<string | null>(null);
  const [touchOrbitActive, setTouchOrbitActive] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const systemReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readSystemReducedMotion,
    () => false,
  );
  const isMobileViewport = useSyncExternalStore(
    subscribeMobileViewport,
    readIsMobileViewport,
    () => false,
  );

  const controlsHandleRef = useRef<ShowroomCameraControlHandle | null>(null);
  const onWebGLFallbackRef = useRef(onWebGLFallback);
  const onHotspotSelectRef = useRef(onHotspotSelect);
  const onZoneRequestRef = useRef(onZoneRequest);
  const onControlsReadyRef = useRef(onControlsReady);
  const zoneButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const prevZoneCodeRef = useRef<string>(activeZoneCode);
  const prevHotspotIdRef = useRef<string | null>(selectedHotspotId);

  useEffect(() => {
    onWebGLFallbackRef.current = onWebGLFallback;
  }, [onWebGLFallback]);

  useEffect(() => {
    onHotspotSelectRef.current = onHotspotSelect;
  }, [onHotspotSelect]);

  useEffect(() => {
    onZoneRequestRef.current = onZoneRequest;
  }, [onZoneRequest]);

  useEffect(() => {
    onControlsReadyRef.current = onControlsReady;
  }, [onControlsReady]);

  useEffect(() => {
    let active = true;
    const supported = probeWebGLSupport();

    queueMicrotask(() => {
      if (!active) return;
      setWebglSupported(supported);
      if (!supported) {
        setLiveAnnouncement(
          'Tampilan 3D tidak tersedia pada perangkat ini. Mode poster 2D aktif dan seluruh produk tetap dapat dibeli.',
        );
        onWebGLFallbackRef.current?.('webgl-unavailable');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const activeZone: ShowroomZonePublicDto | null = useMemo(
    () => zones.find((z) => z.code === activeZoneCode) ?? zones[0] ?? null,
    [activeZoneCode, zones],
  );

  const resolvedReducedMotion = reducedMotion ?? systemReducedMotion;
  const resolvedZoneTitle = zoneTitle ?? activeZone?.title ?? 'Ruang Pamer ARVEN';
  const effectiveInteractionEnabled =
    interactionEnabled ?? (!isMobileViewport || touchOrbitActive);

  useEffect(() => {
    if (prevZoneCodeRef.current === activeZoneCode) {
      return;
    }
    prevZoneCodeRef.current = activeZoneCode;
    if (!activeZone) {
      return;
    }
    let active = true;
    const msg = `Berpindah ke zona ${activeZone.title}. ${activeZone.hotspots.length} produk tersedia.`;
    queueMicrotask(() => {
      if (active) {
        setLiveAnnouncement(msg);
      }
    });
    return () => {
      active = false;
    };
  }, [activeZone, activeZoneCode]);

  useEffect(() => {
    if (prevHotspotIdRef.current === selectedHotspotId) {
      return;
    }
    prevHotspotIdRef.current = selectedHotspotId;
    if (!selectedHotspotId || !activeZone) {
      return;
    }
    const matched = activeZone.hotspots.find((h) => h.id === selectedHotspotId);
    if (!matched) {
      return;
    }
    controlsHandleRef.current?.focusHotspot(matched.id);
    let active = true;
    const msg = `Membuka kartu produk ${matched.productName}.`;
    queueMicrotask(() => {
      if (active) {
        setLiveAnnouncement(msg);
      }
    });
    return () => {
      active = false;
    };
  }, [activeZone, selectedHotspotId]);

  const handleControlsReady = useCallback(
    (handle: ShowroomCameraControlHandle | null) => {
      controlsHandleRef.current = handle;
      onControlsReadyRef.current?.(handle);
    },
    [],
  );

  const handleHotspotSelect = useCallback(
    (hotspot: ShowroomHotspotPublicDto) => {
      setLiveAnnouncement(`Membuka kartu produk ${hotspot.productName}.`);
      onHotspotSelectRef.current?.(hotspot);
    },
    [],
  );

  const handleZoneSelect = useCallback(
    (targetCode: string, targetLabel?: string) => {
      const targetZone = zones.find((z) => z.code === targetCode);
      const label = targetLabel ?? targetZone?.title ?? targetCode;
      setLiveAnnouncement(`Memilih zona ${label}.`);
      onZoneRequestRef.current?.(targetCode);
    },
    [zones],
  );

  const handleRuntimeWebGLFallback = useCallback((reason: string) => {
    setRuntimeFallbackReason(reason);
    setLiveAnnouncement(
      'Tampilan 3D dialihkan ke mode poster 2D agar penelusuran tetap stabil.',
    );
    onWebGLFallbackRef.current?.(reason);
  }, []);

  const handleRotateLeft = useCallback(() => {
    controlsHandleRef.current?.rotateBy(-Math.PI / 4);
    setLiveAnnouncement('Kamera diputar 45 derajat ke kiri.');
  }, []);

  const handleRotateRight = useCallback(() => {
    controlsHandleRef.current?.rotateBy(Math.PI / 4);
    setLiveAnnouncement('Kamera diputar 45 derajat ke kanan.');
  }, []);

  const handleStepForward = useCallback(() => {
    controlsHandleRef.current?.moveForward(1.2);
    setLiveAnnouncement('Kamera melangkah maju.');
  }, []);

  const handleResetView = useCallback(() => {
    controlsHandleRef.current?.resetView();
    setLiveAnnouncement('Tampilan kamera direset.');
  }, []);

  const handleToggleTouchOrbit = useCallback(() => {
    setTouchOrbitActive((prev) => {
      const next = !prev;
      setLiveAnnouncement(
        next
          ? 'Mode putar 3D diaktifkan. Sentuh dan seret untuk memutar tampilan.'
          : 'Gulir halaman dikunci ke mode gulir normal.',
      );
      return next;
    });
  }, []);

  const handleZoneRadioKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (zones.length === 0) return;
      let nextIndex = -1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % zones.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + zones.length) % zones.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = zones.length - 1;
      }

      if (nextIndex >= 0) {
        event.preventDefault();
        const nextZone = zones[nextIndex];
        zoneButtonRefs.current[nextIndex]?.focus();
        if (nextZone) {
          handleZoneSelect(nextZone.code, nextZone.title);
        }
      }
    },
    [handleZoneSelect, zones],
  );

  const isFallbackActive =
    webglSupported === false || runtimeFallbackReason !== null;

  return (
    <section
      data-theme="dark"
      data-reduced-motion={resolvedReducedMotion ? 'true' : 'false'}
      data-interaction-enabled={effectiveInteractionEnabled ? 'true' : 'false'}
      aria-label={`Panggung Virtual Showroom 3D ${resolvedZoneTitle}`}
      data-testid="showroom-3d-island"
      className={[
        'overflow-hidden border border-[#35383A] bg-[#17191B] text-[#F8F7F3]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#46494C] bg-[#17191B] px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="border border-[#46494C] bg-[#35383A] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#C5A572]">
            Virtual Showroom
          </span>
          <span className="text-sm font-medium text-[#F8F7F3]">
            {resolvedZoneTitle}
          </span>
        </div>

        <span className="font-mono text-xs tabular-nums text-[#B2B0A6]">
          {activeZone ? `${activeZone.hotspots.length} Produk` : '0 Produk'}
          {resolvedReducedMotion ? ' · Gerak Dikurangi' : ''}
        </span>
      </div>

      <div
        data-testid="showroom-stage"
        style={{
          touchAction: touchOrbitActive ? 'none' : 'pan-y',
        }}
        className="relative aspect-[4/3] max-h-[62dvh] min-h-[300px] w-full overflow-hidden bg-[#17191B] sm:aspect-[16/10] sm:max-h-[68dvh] lg:aspect-[16/9] lg:max-h-[72dvh]"
      >
        {!activeZone ? (
          <div
            data-testid="showroom-empty-stage"
            className="flex h-full w-full items-center justify-center bg-[#222528] p-6 text-center"
          >
            <p className="text-sm text-[#B2B0A6]">
              Belum ada zona ruang pamer yang dipublikasikan.
            </p>
          </div>
        ) : isFallbackActive ? (
          <div
            data-testid="arven-showroom-fallback"
            className="relative h-full w-full overflow-hidden bg-[#17191B]"
          >
            {activeZone.posterUrl ? (
              <Image
                src={activeZone.posterUrl}
                alt={`Poster zona ${activeZone.title}`}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#222528] p-6">
                <span className="font-display text-2xl text-[#F8F7F3]">
                  {activeZone.title}
                </span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 border-t border-[#46494C] bg-[#17191B]/95 p-4">
              <p className="text-sm text-[#F8F7F3]">
                Tampilan 3D tidak tersedia pada perangkat ini. Mode poster 2D
                aktif dan seluruh produk tetap dapat dibeli.
              </p>
            </div>
          </div>
        ) : webglSupported ? (
          <DynamicShowroomExperience
            zones={zones}
            activeZoneCode={activeZone.code}
            selectedHotspotId={selectedHotspotId}
            tierOverride={tierOverride}
            reducedMotion={resolvedReducedMotion}
            interactionEnabled={effectiveInteractionEnabled}
            dracoDecoderPath={dracoDecoderPath}
            ktx2TranscoderPath={ktx2TranscoderPath}
            onHotspotSelect={handleHotspotSelect}
            onZoneRequest={handleZoneSelect}
            onWebGLFallback={handleRuntimeWebGLFallback}
            onControlsReady={handleControlsReady}
          />
        ) : (
          <div
            data-testid="showroom-3d-loading"
            className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#17191B] p-6 text-center"
          >
            <span className="border border-[#46494C] bg-[#35383A] px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] text-[#C5A572]">
              Virtual Showroom
            </span>
            <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
              Memuat Ruang Pamer 3D...
            </p>
          </div>
        )}
      </div>

      <div
        className="space-y-3 border-t border-[#46494C] bg-[#17191B] px-3 py-3 sm:px-4"
        data-testid="showroom-3d-controls"
      >
        {zones.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="radiogroup"
              aria-label="Pilih Zona Ruang Pamer"
              className="flex flex-wrap items-center gap-2"
            >
              {zones.map((zone, index) => {
                const selected = zone.code === activeZone?.code;
                return (
                  <button
                    key={zone.id}
                    ref={(el) => {
                      zoneButtonRefs.current[index] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => handleZoneSelect(zone.code, zone.title)}
                    onKeyDown={(e) => handleZoneRadioKeyDown(e, index)}
                    data-testid={`showroom-zone-btn-${zone.code}`}
                    className={[
                      'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 px-3 py-2 text-xs font-medium tracking-[0.04em] transition-[background-color,border-color,color] duration-[var(--duration-fast)]',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]',
                      selected
                        ? 'border-2 border-[#C5A572] bg-[#35383A] text-[#F8F7F3]'
                        : 'border border-[#9E9C92] bg-[#17191B] text-[#F8F7F3] hover:border-[#F8F7F3] hover:bg-[#35383A]',
                    ].join(' ')}
                  >
                    {selected ? (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 bg-[#C5A572]"
                      />
                    ) : null}
                    <span>{zone.title}</span>
                  </button>
                );
              })}
            </div>

            {activeZone && activeZone.portals.length > 0 ? (
              <div
                role="group"
                aria-label="Pintasan Portal Zona"
                className="flex flex-wrap items-center gap-2"
              >
                {activeZone.portals.map((portal) => (
                  <button
                    key={portal.targetZoneCode}
                    type="button"
                    onClick={() =>
                      handleZoneSelect(portal.targetZoneCode, portal.label)
                    }
                    data-testid={`showroom-portal-btn-${portal.targetZoneCode}`}
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-[#C5A572] bg-[#222528] px-3 py-2 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] duration-[var(--duration-fast)] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]"
                  >
                    Portal: {portal.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Kontrol Navigasi Kamera Ruang Pamer"
            className="flex flex-wrap items-center gap-2"
          >
            <button
              type="button"
              onClick={handleRotateLeft}
              disabled={isFallbackActive || !activeZone}
              aria-label="Rotate Left"
              data-testid="showroom-cam-rotate-left"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-[#9E9C92] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] duration-[var(--duration-fast)] hover:border-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] disabled:cursor-not-allowed disabled:border-[#46494C] disabled:bg-[#222528] disabled:text-[#B2B0A6]"
            >
              Putar Kiri
            </button>
            <button
              type="button"
              onClick={handleRotateRight}
              disabled={isFallbackActive || !activeZone}
              aria-label="Rotate Right"
              data-testid="showroom-cam-rotate-right"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-[#9E9C92] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] duration-[var(--duration-fast)] hover:border-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] disabled:cursor-not-allowed disabled:border-[#46494C] disabled:bg-[#222528] disabled:text-[#B2B0A6]"
            >
              Putar Kanan
            </button>
            <button
              type="button"
              onClick={handleStepForward}
              disabled={isFallbackActive || !activeZone}
              aria-label="Step Forward"
              data-testid="showroom-cam-step-forward"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-[#9E9C92] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] duration-[var(--duration-fast)] hover:border-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] disabled:cursor-not-allowed disabled:border-[#46494C] disabled:bg-[#222528] disabled:text-[#B2B0A6]"
            >
              Langkah Maju
            </button>
            <button
              type="button"
              onClick={handleResetView}
              disabled={isFallbackActive || !activeZone}
              aria-label="Reset View"
              data-testid="showroom-cam-reset"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-[#9E9C92] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] duration-[var(--duration-fast)] hover:border-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] disabled:cursor-not-allowed disabled:border-[#46494C] disabled:bg-[#222528] disabled:text-[#B2B0A6]"
            >
              Reset Tampilan
            </button>
          </div>

          <button
            type="button"
            aria-pressed={touchOrbitActive}
            onClick={handleToggleTouchOrbit}
            data-testid="showroom-touch-toggle"
            className={[
              'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center px-3 py-2 text-xs font-medium transition-[background-color,border-color,color] duration-[var(--duration-fast)] md:hidden',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]',
              touchOrbitActive
                ? 'border-2 border-[#C5A572] bg-[#35383A] text-[#F8F7F3]'
                : 'border border-[#9E9C92] bg-[#17191B] text-[#F8F7F3] hover:border-[#F8F7F3] hover:bg-[#35383A]',
            ].join(' ')}
          >
            {touchOrbitActive ? 'Kunci Gulir Halaman' : 'Aktifkan Putar 3D'}
          </button>
        </div>

        <p
          className="sr-only"
          aria-live="polite"
          data-testid="showroom-live-region"
        >
          {liveAnnouncement}
        </p>
      </div>
    </section>
  );
}
