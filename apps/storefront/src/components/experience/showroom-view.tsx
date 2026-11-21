'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type {
  ShowroomHotspotPublicDto,
  ShowroomZonePublicDto,
} from '@arven/contracts';
import type { ShowroomCameraControlHandle } from '@arven/three-engine/showroom';
import {
  Badge,
  EmptyState,
  ErrorState,
  StatusBanner,
  Surface,
  buttonClassName,
  cn,
  formatIDR,
} from '@arven/ui';
import { Showroom3DIsland } from '@/components/experience/showroom-3d-island';
import { HotspotQuickCard } from '@/components/experience/hotspot-quick-card';
import { ShowroomFallback } from '@/components/experience/showroom-fallback';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

export interface ShowroomViewProps {
  readonly initialZones: ReadonlyArray<ShowroomZonePublicDto> | null;
  readonly initialZoneCode?: string | null;
  readonly initialError?: string | null;
}

export function ShowroomView({
  initialZones,
  initialZoneCode,
  initialError = null,
}: ShowroomViewProps) {
  const [zones, setZones] = useState<ReadonlyArray<ShowroomZonePublicDto>>(
    initialZones ?? [],
  );
  const [loading, setLoading] = useState(initialZones === null && !initialError);
  const [loadError, setLoadError] = useState<string | null>(initialError);

  const [activeZoneCode, setActiveZoneCode] = useState<string>(() => {
    const list = initialZones ?? [];
    if (initialZoneCode && list.some((z) => z.code === initialZoneCode)) {
      return initialZoneCode;
    }
    return list[0]?.code ?? '';
  });

  const [selectedHotspot, setSelectedHotspot] =
    useState<ShowroomHotspotPublicDto | null>(null);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const controlsRef = useRef<ShowroomCameraControlHandle | null>(null);
  const zoneRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastHotspotTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const applyFetchedZones = useCallback((nextZones: ReadonlyArray<ShowroomZonePublicDto>) => {
    setZones(nextZones);
    setActiveZoneCode((current) => {
      if (current && nextZones.some((z) => z.code === current)) {
        return current;
      }
      return nextZones[0]?.code ?? '';
    });
  }, []);

  const fetchScenes = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await storefrontApi.showroom.getScenes();
      applyFetchedZones(response.zones);
    } catch (err) {
      setLoadError(
        err instanceof ApiClientError
          ? err.message
          : 'Gagal memuat daftar zona ruang pamer ARVEN.',
      );
    } finally {
      setLoading(false);
    }
  }, [applyFetchedZones]);

  useEffect(() => {
    if (initialZones !== null) {
      return;
    }
    let active = true;
    storefrontApi.showroom
      .getScenes()
      .then((response) => {
        if (!active) return;
        applyFetchedZones(response.zones);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiClientError
            ? err.message
            : 'Gagal memuat daftar zona ruang pamer ARVEN.',
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [applyFetchedZones, initialZones]);

  const activeZone = useMemo(() => {
    if (zones.length === 0) return null;
    return zones.find((z) => z.code === activeZoneCode) ?? zones[0] ?? null;
  }, [activeZoneCode, zones]);

  const handleZoneChange = useCallback(
    (nextCode: string) => {
      const target = zones.find((z) => z.code === nextCode);
      if (!target) return;
      setActiveZoneCode(target.code);
      setSelectedHotspot(null);
      setLiveAnnouncement(
        `Berpindah ke zona ${target.title}. ${target.hotspots.length} produk tersedia.`,
      );
    },
    [zones],
  );

  const handleZoneRadioKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (zones.length <= 1) return;
    let nextIdx: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIdx = (index + 1) % zones.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIdx = (index - 1 + zones.length) % zones.length;
    } else if (event.key === 'Home') {
      nextIdx = 0;
    } else if (event.key === 'End') {
      nextIdx = zones.length - 1;
    }
    if (nextIdx === null) return;
    event.preventDefault();
    const targetZone = zones[nextIdx];
    if (targetZone) {
      handleZoneChange(targetZone.code);
      zoneRadioRefs.current[nextIdx]?.focus();
    }
  };

  const handleOpenHotspot = useCallback(
    (hotspot: ShowroomHotspotPublicDto, triggerEl?: HTMLButtonElement | null) => {
      if (triggerEl) {
        lastHotspotTriggerRef.current = triggerEl;
      }
      controlsRef.current?.focusHotspot(hotspot.id);
      setSelectedHotspot(hotspot);
      setLiveAnnouncement(
        `Membuka kartu produk ${hotspot.productName}, mulai ${formatIDR(hotspot.fromPriceIdr)}.`,
      );
    },
    [],
  );

  const handleCloseHotspot = useCallback(() => {
    setSelectedHotspot(null);
    const trigger = lastHotspotTriggerRef.current;
    if (trigger && typeof trigger.focus === 'function') {
      requestAnimationFrame(() => trigger.focus());
    }
  }, []);

  const handleWebGLFallback = useCallback((reason: string) => {
    setFallbackReason(reason);
    setViewMode('2d');
    setLiveAnnouncement(
      'Tampilan 3D dialihkan ke galeri poster 2D agar penelusuran tetap stabil.',
    );
  }, []);

  const canRetry3D =
    fallbackReason !== 'webgl_unavailable' &&
    fallbackReason !== 'webgl_disabled';

  return (
    <div className="space-y-10">
      <div className="sr-only" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      {/* Dark Showcase Stage Band */}
      <section
        data-theme="dark"
        aria-label="Ruang Pamer Virtual 3D ARVEN"
        className="space-y-6 rounded-[var(--radius-sm)] border border-[#46494C] bg-[#17191B] p-4 text-[#F8F7F3] sm:p-6 lg:p-8"
      >
        <div className="flex flex-col gap-4 border-b border-[#46494C] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#showroom-catalog-directory"
                className="fixed top-3 left-3 z-[var(--z-toast)] inline-flex min-h-11 -translate-y-[250%] items-center rounded-[var(--radius-xs)] border border-[#82B0DC] bg-[#222528] px-4 py-2 text-xs font-semibold text-[#F8F7F3] shadow-[var(--shadow-raised)] transition-transform duration-[var(--duration-fast)] focus:translate-y-0 focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]"
              >
                Lewati Ruang Pamer 3D
              </a>
              <span className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
                Virtual Showroom
              </span>
              {activeZone ? (
                <span className="border border-[#C5A572] px-2 py-0.5 font-mono text-xs text-[#C5A572]">
                  {activeZone.code}
                </span>
              ) : null}
            </div>
            <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-[#F8F7F3] sm:text-4xl">
              {activeZone ? activeZone.title : 'Ruang Pamer ARVEN'}
            </h1>
            <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-[#E9E4DA]">
              {activeZone?.description ||
                'Jelajahi galeri arsitektural ARVEN per zona dan inspeksi produk langsung menuju detail koleksi.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              role="group"
              aria-label="Mode tampilan ruang pamer"
              className="inline-flex items-center gap-2"
            >
              <button
                type="button"
                aria-pressed={viewMode === '3d'}
                onClick={() => {
                  setFallbackReason(null);
                  setViewMode('3d');
                }}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border px-3.5 py-2 text-xs font-medium cursor-pointer',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]',
                  viewMode === '3d'
                    ? 'border-2 border-[#C5A572] bg-[#35383A] font-semibold text-[#F8F7F3]'
                    : 'border-[#9E9C92] bg-[#222528] text-[#E9E4DA] hover:border-[#F8F7F3]',
                )}
              >
                Mode 3D
              </button>
              <button
                type="button"
                aria-pressed={viewMode === '2d'}
                onClick={() => setViewMode('2d')}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border px-3.5 py-2 text-xs font-medium cursor-pointer',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]',
                  viewMode === '2d'
                    ? 'border-2 border-[#C5A572] bg-[#35383A] font-semibold text-[#F8F7F3]'
                    : 'border-[#9E9C92] bg-[#222528] text-[#E9E4DA] hover:border-[#F8F7F3]',
                )}
              >
                Poster 2D
              </button>
            </div>

            <Link
              href="/outfit-studio"
              className={buttonClassName({ variant: 'secondary', size: 'md' })}
            >
              Buka Outfit Studio
            </Link>
          </div>
        </div>

        {loadError ? (
          <ErrorState
            title="Gagal memuat ruang pamer"
            message={loadError}
            onRetry={() => void fetchScenes()}
          />
        ) : loading ? (
          <div
            role="status"
            aria-busy="true"
            className="flex aspect-[16/10] w-full items-center justify-center border border-[#46494C] bg-[#222528] p-6"
          >
            <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
              Memuat Zona Ruang Pamer...
            </p>
          </div>
        ) : !activeZone || zones.length === 0 ? (
          <ShowroomFallback zone={null} />
        ) : (
          <>
            {/* Zone Switcher Bar */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#B2B0A6]">
                Pilih Zona Ruang Pamer
              </p>
              <div
                role="radiogroup"
                aria-label="Pilih Zona Ruang Pamer"
                className="flex flex-wrap items-center gap-2"
              >
                {zones.map((zone, idx) => {
                  const selected = zone.code === activeZone.code;
                  return (
                    <button
                      key={zone.id}
                      ref={(el) => {
                        zoneRadioRefs.current[idx] = el;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => handleZoneChange(zone.code)}
                      onKeyDown={(event) => handleZoneRadioKeyDown(event, idx)}
                      className={cn(
                        'inline-flex min-h-11 min-w-11 items-center gap-2 rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium cursor-pointer',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]',
                        selected
                          ? 'border-2 border-[#C5A572] bg-[#35383A] font-semibold text-[#F8F7F3]'
                          : 'border-[#9E9C92] bg-[#17191B] text-[#E9E4DA] hover:border-[#F8F7F3] hover:bg-[#35383A]',
                      )}
                    >
                      {selected ? (
                        <span
                          aria-hidden="true"
                          className="inline-block h-1.5 w-1.5 shrink-0 bg-[#C5A572]"
                        />
                      ) : null}
                      <span>{zone.title}</span>
                      <span className="font-mono text-xs tabular-nums text-[#B2B0A6]">
                        ({zone.hotspots.length})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stage Viewport */}
            {viewMode === '3d' ? (
              <div className="space-y-4">
                <Showroom3DIsland
                  zones={zones}
                  activeZoneCode={activeZone.code}
                  zoneTitle={activeZone.title}
                  selectedHotspotId={selectedHotspot?.id ?? null}
                  reducedMotion={reducedMotion}
                  onHotspotSelect={(hotspot) => handleOpenHotspot(hotspot)}
                  onZoneRequest={handleZoneChange}
                  onWebGLFallback={handleWebGLFallback}
                  onControlsReady={(handle) => {
                    controlsRef.current = handle;
                  }}
                />

                {/* Accessible Camera & Portal Control Dock */}
                <div className="flex flex-wrap items-center justify-between gap-3 border border-[#46494C] bg-[#222528] p-3">
                  <div
                    role="group"
                    aria-label="Kontrol kamera ruang pamer"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        controlsRef.current?.rotateBy(-Math.PI / 4);
                        setLiveAnnouncement('Kamera diputar 45 derajat ke kiri.');
                      }}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[#9E9C92] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] hover:border-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
                    >
                      Putar Kiri 45°
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        controlsRef.current?.rotateBy(Math.PI / 4);
                        setLiveAnnouncement('Kamera diputar 45 derajat ke kanan.');
                      }}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[#9E9C92] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] hover:border-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
                    >
                      Putar Kanan 45°
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        controlsRef.current?.moveForward(1.0);
                        setLiveAnnouncement('Kamera bergerak maju.');
                      }}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[#9E9C92] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] hover:border-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
                    >
                      Maju
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        controlsRef.current?.moveForward(-1.0);
                        setLiveAnnouncement('Kamera bergerak mundur.');
                      }}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[#9E9C92] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] hover:border-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
                    >
                      Mundur
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        controlsRef.current?.resetView();
                        setLiveAnnouncement('Tampilan kamera direset.');
                      }}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[#9E9C92] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] hover:border-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
                    >
                      Reset Tampilan
                    </button>
                  </div>

                  {activeZone.portals.length > 0 ? (
                    <div
                      role="group"
                      aria-label="Portal antar zona"
                      className="flex flex-wrap items-center gap-2"
                    >
                      {activeZone.portals.map((portal) => (
                        <button
                          key={portal.targetZoneCode}
                          type="button"
                          onClick={() => handleZoneChange(portal.targetZoneCode)}
                          className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[#C5A572] bg-[#17191B] px-3 py-2 text-xs font-medium text-[#F8F7F3] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
                        >
                          <span>Portal: {portal.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <ShowroomFallback
                zone={activeZone}
                reason={fallbackReason}
                canRetry3D={canRetry3D}
                onRetry3D={() => {
                  setFallbackReason(null);
                  setViewMode('3d');
                }}
                onSelectHotspot={(hotspot) => handleOpenHotspot(hotspot)}
              />
            )}

            {/* DOM Hotspot Strip (Keyboard & SR mirror of 3D markers) */}
            <div className="space-y-2 border-t border-[#46494C] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#B2B0A6]">
                  Penanda Produk Zona Aktif ({activeZone.hotspots.length})
                </p>
                <span className="font-mono text-xs tabular-nums text-[#B2B0A6]">
                  {(activeZone.sceneBytes / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>

              {activeZone.hotspots.length === 0 ? (
                <p className="text-sm text-[#B2B0A6]">
                  Zona arsitektural ini tidak memiliki penanda produk aktif.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {activeZone.hotspots.map((hotspot, index) => {
                    const isOpen = selectedHotspot?.id === hotspot.id;
                    return (
                      <button
                        key={hotspot.id}
                        type="button"
                        aria-label={`Produk: ${hotspot.productName}, mulai ${formatIDR(hotspot.fromPriceIdr)}`}
                        aria-pressed={isOpen}
                        onClick={(event) =>
                          handleOpenHotspot(hotspot, event.currentTarget)
                        }
                        onFocus={() => {
                          controlsRef.current?.focusHotspot(hotspot.id);
                          setLiveAnnouncement(`Fokus ke ${hotspot.productName}`);
                        }}
                        className={cn(
                          'inline-flex min-h-11 min-w-11 items-center gap-2.5 rounded-[var(--radius-sm)] border px-3.5 py-2 text-left text-xs cursor-pointer',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]',
                          isOpen
                            ? 'border-2 border-[#C5A572] bg-[#35383A] text-[#F8F7F3]'
                            : 'border-[#9E9C92] bg-[#222528] text-[#F8F7F3] hover:border-[#C5A572] hover:bg-[#35383A]',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] font-mono text-xs font-semibold tabular-nums',
                            isOpen
                              ? 'bg-[#C5A572] text-[#17191B]'
                              : 'border border-[#9E9C92] bg-[#17191B] text-[#F8F7F3]',
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="font-medium">{hotspot.productName}</span>
                        <span className="font-mono text-xs tabular-nums text-[#B2B0A6]">
                          Mulai {formatIDR(hotspot.fromPriceIdr)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Editorial Light SSR Catalog Directory (Always rendered in HTML) */}
      <section
        id="showroom-catalog-directory"
        tabIndex={-1}
        aria-labelledby="showroom-directory-heading"
        className="space-y-8 border-t border-hairline pt-8 focus:outline-none"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
              Direktori Kurasi Zona
            </p>
            <h2
              id="showroom-directory-heading"
              className="font-display text-3xl font-normal tracking-[-0.015em] text-ink"
            >
              Katalog Zona Ruang Pamer
            </h2>
          </div>
          <Link
            href="/shop"
            className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
          >
            Lihat Semua Produk
          </Link>
        </div>

        {zones.length === 0 ? (
          <EmptyState
            title="Belum ada zona ruang pamer aktif"
            description="Katalog produk tetap dapat ditelusuri melalui halaman Shop dan Collections."
            action={
              <Link
                href="/shop"
                className={buttonClassName({ variant: 'primary', size: 'md' })}
              >
                Jelajahi Katalog
              </Link>
            }
          />
        ) : (
          <div className="space-y-10">
            {zones.map((zone) => (
              <Surface
                key={zone.id}
                variant="elevated"
                border="hairline"
                padding="lg"
                className={cn(
                  'space-y-6',
                  activeZone?.code === zone.code ? 'border-strong-border' : undefined,
                )}
              >
                <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
                  <div className="overflow-hidden border border-hairline bg-subtle lg:col-span-4">
                    <img
                      src={zone.posterUrl}
                      alt={`Poster zona ${zone.title}`}
                      decoding="async"
                      className="aspect-[16/10] w-full object-cover"
                    />
                  </div>
                  <div className="space-y-2 lg:col-span-8">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={activeZone?.code === zone.code ? 'info' : 'neutral'}>
                        {zone.code}
                      </Badge>
                      <span className="font-mono text-xs tabular-nums text-ink-muted">
                        {zone.hotspots.length} Produk
                      </span>
                    </div>
                    <h3 className="font-display text-2xl font-normal text-ink">
                      {zone.title}
                    </h3>
                    {zone.description ? (
                      <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-ink-secondary">
                        {zone.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                {zone.hotspots.length > 0 ? (
                  <div className="grid grid-cols-1 gap-5 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                    {zone.hotspots.map((hotspot) => (
                      <article
                        key={hotspot.id}
                        className="flex flex-col justify-between border border-hairline bg-canvas"
                      >
                        <div className="space-y-3">
                          <Link
                            href={`/products/${encodeURIComponent(hotspot.productSlug)}`}
                            className="block aspect-[3/4] w-full overflow-hidden border-b border-hairline bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                          >
                            {hotspot.primaryImageUrl ? (
                              <img
                                src={hotspot.primaryImageUrl}
                                alt={hotspot.primaryImageAlt || hotspot.productName}
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center p-4 text-center">
                                <span className="font-display text-lg text-ink">
                                  {hotspot.productName}
                                </span>
                              </div>
                            )}
                          </Link>

                          <div className="space-y-1.5 px-4">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span className="text-xs font-medium text-ink-muted">
                                {hotspot.label}
                              </span>
                              {hotspot.has3dEnabled ? <Badge tone="info">3D</Badge> : null}
                            </div>
                            <h4 className="font-display text-lg font-medium text-ink">
                              <Link
                                href={`/products/${encodeURIComponent(hotspot.productSlug)}`}
                                className="inline-flex min-h-11 items-center text-ink hover:text-link"
                              >
                                {hotspot.productName}
                              </Link>
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-3">
                          <span className="font-mono text-sm font-medium tabular-nums text-ink">
                            Mulai {formatIDR(hotspot.fromPriceIdr)}
                          </span>
                          <Link
                            href={`/products/${encodeURIComponent(hotspot.productSlug)}`}
                            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                          >
                            Detail
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <StatusBanner
                    tone="info"
                    description="Zona arsitektural ini tidak memiliki produk terhubung saat ini."
                  />
                )}
              </Surface>
            ))}
          </div>
        )}
      </section>

      <HotspotQuickCard
        hotspot={selectedHotspot}
        zoneTitle={activeZone?.title}
        onClose={handleCloseHotspot}
      />
    </div>
  );
}
