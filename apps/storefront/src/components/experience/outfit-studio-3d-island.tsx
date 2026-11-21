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
} from 'react';
import type { OutfitSlotInput } from '@arven/contracts';
import type { OutfitStudioExperienceProps } from '@arven/three-engine/outfit-studio';

const DynamicOutfitStudioExperience = dynamic(
  () =>
    import('@arven/three-engine/outfit-studio').then(
      (m) => m.OutfitStudioExperience,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        data-theme="dark"
        className="flex aspect-[3/4] min-h-[360px] w-full flex-col items-center justify-center gap-3 bg-[#17191B] p-6 text-center"
        data-testid="outfit-studio-3d-loading"
      >
        <span className="border border-[#46494C] bg-[#35383A] px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] text-[#C5A572]">
          Outfit Studio 3D
        </span>
        <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
          Memuat Manekin Studio 3D...
        </p>
      </div>
    ),
  },
);

const SLOT_LABELS: Record<OutfitSlotInput, string> = {
  top: 'Atasan',
  bottom: 'Bawahan',
  outerwear: 'Outerwear',
  footwear: 'Alas Kaki',
  accessory: 'Aksesori',
};

const OUTFIT_SLOT_KEYS: readonly OutfitSlotInput[] = [
  'top',
  'bottom',
  'outerwear',
  'footwear',
  'accessory',
];

export interface OutfitStudio3DIslandProps extends OutfitStudioExperienceProps {
  readonly className?: string;
  readonly activeSlotCount?: number;
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
 * Client-only Outfit Studio 3D stage boundary loaded via `next/dynamic(..., { ssr: false })`.
 * Scoped to Dark Showcase tokens (`#17191B` / `#35383A`), enforces `aspect-[3/4]`,
 * mobile `touch-action: pan-y` scroll isolation, tabular slot count, and polite announcements.
 */
export function OutfitStudio3DIsland({
  rigId,
  rigModelUrl,
  rigMobileModelUrl,
  rigPosterUrl,
  slots,
  tierOverride,
  reducedMotion,
  interactionEnabled,
  dracoDecoderPath = '/decoders/draco/',
  ktx2TranscoderPath = '/decoders/basis/',
  onSlotLoaded,
  onSlotError,
  onWebGLFallback,
  className,
  activeSlotCount,
}: OutfitStudio3DIslandProps) {
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

  const onWebGLFallbackRef = useRef(onWebGLFallback);
  const onSlotLoadedRef = useRef(onSlotLoaded);
  const onSlotErrorRef = useRef(onSlotError);
  const prevSlotsSnapshotRef = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    onWebGLFallbackRef.current = onWebGLFallback;
  }, [onWebGLFallback]);

  useEffect(() => {
    onSlotLoadedRef.current = onSlotLoaded;
  }, [onSlotLoaded]);

  useEffect(() => {
    onSlotErrorRef.current = onSlotError;
  }, [onSlotError]);

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

  const resolvedSlotCount = useMemo(() => {
    if (typeof activeSlotCount === 'number') {
      return activeSlotCount;
    }
    return OUTFIT_SLOT_KEYS.reduce(
      (count, slotKey) => (slots[slotKey] ? count + 1 : count),
      0,
    );
  }, [activeSlotCount, slots]);

  const resolvedReducedMotion = reducedMotion ?? systemReducedMotion;
  const effectiveInteractionEnabled =
    interactionEnabled ?? (!isMobileViewport || touchOrbitActive);

  useEffect(() => {
    const currentSnapshot: Record<string, string> = {};
    for (const slotKey of OUTFIT_SLOT_KEYS) {
      const item = slots[slotKey];
      if (item) {
        currentSnapshot[slotKey] = `${item.assetId}:${item.presetId ?? ''}`;
      }
    }

    const prevSnapshot = prevSlotsSnapshotRef.current;
    prevSlotsSnapshotRef.current = currentSnapshot;
    if (!prevSnapshot) {
      return;
    }

    let nextMessage: string | null = null;
    for (const slotKey of OUTFIT_SLOT_KEYS) {
      const prevToken = prevSnapshot[slotKey];
      const nextToken = currentSnapshot[slotKey];
      if (prevToken === nextToken) {
        continue;
      }

      const slotLabel = SLOT_LABELS[slotKey];
      if (nextToken && !prevToken) {
        nextMessage = `Item dipasang pada slot ${slotLabel}. ${resolvedSlotCount} dari 5 slot terisi.`;
        break;
      }
      if (!nextToken && prevToken) {
        nextMessage = `Slot ${slotLabel} dibersihkan. ${resolvedSlotCount} dari 5 slot terisi.`;
        break;
      }
      if (nextToken && prevToken) {
        const [prevAssetId] = prevToken.split(':');
        const [nextAssetId] = nextToken.split(':');
        if (prevAssetId !== nextAssetId) {
          nextMessage = `Item pada slot ${slotLabel} diganti. ${resolvedSlotCount} dari 5 slot terisi.`;
        } else {
          nextMessage = `Variasi tampilan pada slot ${slotLabel} diperbarui.`;
        }
        break;
      }
    }

    if (!nextMessage) {
      return;
    }

    let active = true;
    const messageToAnnounce = nextMessage;
    queueMicrotask(() => {
      if (active) {
        setLiveAnnouncement(messageToAnnounce);
      }
    });
    return () => {
      active = false;
    };
  }, [resolvedSlotCount, slots]);

  const handleSlotLoaded = useCallback(
    (slot: OutfitSlotInput, assetId: string) => {
      setLiveAnnouncement(
        `Model slot ${SLOT_LABELS[slot]} selesai dimuat ke manekin. ${resolvedSlotCount} dari 5 slot terisi.`,
      );
      onSlotLoadedRef.current?.(slot, assetId);
    },
    [resolvedSlotCount],
  );

  const handleSlotError = useCallback(
    (slot: OutfitSlotInput, reason: string) => {
      setLiveAnnouncement(
        `Gagal memuat model slot ${SLOT_LABELS[slot]} (${reason}).`,
      );
      onSlotErrorRef.current?.(slot, reason);
    },
    [],
  );

  const handleRuntimeWebGLFallback = useCallback((reason: string) => {
    setRuntimeFallbackReason(reason);
    setLiveAnnouncement(
      'Tampilan 3D dialihkan ke mode poster 2D agar penelusuran tetap stabil.',
    );
    onWebGLFallbackRef.current?.(reason);
  }, []);

  const handleToggleTouchOrbit = useCallback(() => {
    setTouchOrbitActive((prev) => {
      const next = !prev;
      setLiveAnnouncement(
        next
          ? 'Mode putar 3D diaktifkan. Sentuh dan seret untuk memutar manekin.'
          : 'Gulir halaman dikunci ke mode gulir normal.',
      );
      return next;
    });
  }, []);

  const isFallbackActive =
    webglSupported === false || runtimeFallbackReason !== null;

  return (
    <section
      data-theme="dark"
      data-reduced-motion={resolvedReducedMotion ? 'true' : 'false'}
      data-interaction-enabled={effectiveInteractionEnabled ? 'true' : 'false'}
      aria-label={`Panggung Manekin Studio 3D ${rigId}`}
      data-testid="outfit-studio-3d-island"
      className={[
        'overflow-hidden border border-[#35383A] bg-[#17191B] text-[#F8F7F3]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#46494C] bg-[#17191B] px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="border border-[#46494C] bg-[#35383A] px-2 py-0.5 font-mono text-xs uppercase tracking-[0.08em] text-[#E2C9A4]">
            Manekin Standar
          </span>
          <span className="font-mono text-xs text-[#B2B0A6]">{rigId}</span>
        </div>

        <span
          className="font-mono text-xs tabular-nums text-[#F8F7F3]"
          data-testid="outfit-studio-slot-count"
        >
          Slot Terisi: {resolvedSlotCount} / 5
        </span>
      </div>

      <div
        data-testid="outfit-studio-stage"
        style={{
          touchAction: touchOrbitActive ? 'none' : 'pan-y',
        }}
        className="relative aspect-[3/4] max-h-[65dvh] min-h-[360px] w-full overflow-hidden bg-[#17191B] sm:max-h-[calc(100dvh-10rem)]"
      >
        {isFallbackActive ? (
          <div
            data-testid="arven-outfit-studio-fallback"
            className="relative h-full w-full overflow-hidden bg-[#17191B]"
          >
            {rigPosterUrl ? (
              <Image
                src={rigPosterUrl}
                alt={`Poster manekin standar ${rigId}`}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#222528] p-6">
                <span className="font-mono text-sm text-[#F8F7F3]">
                  {rigId}
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
          <DynamicOutfitStudioExperience
            rigId={rigId}
            rigModelUrl={rigModelUrl}
            rigMobileModelUrl={rigMobileModelUrl}
            rigPosterUrl={rigPosterUrl}
            slots={slots}
            tierOverride={tierOverride}
            reducedMotion={resolvedReducedMotion}
            interactionEnabled={effectiveInteractionEnabled}
            dracoDecoderPath={dracoDecoderPath}
            ktx2TranscoderPath={ktx2TranscoderPath}
            onSlotLoaded={handleSlotLoaded}
            onSlotError={handleSlotError}
            onWebGLFallback={handleRuntimeWebGLFallback}
          />
        ) : (
          <div
            data-testid="outfit-studio-3d-loading"
            className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#17191B] p-6 text-center"
          >
            <span className="border border-[#46494C] bg-[#35383A] px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] text-[#C5A572]">
              Outfit Studio 3D
            </span>
            <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
              Memuat Manekin Studio 3D...
            </p>
          </div>
        )}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t border-[#46494C] bg-[#17191B] px-3 py-2.5 sm:px-4"
        data-testid="outfit-studio-3d-controls"
      >
        <span className="font-mono text-xs text-[#B2B0A6]">
          {resolvedReducedMotion
            ? 'Mode gerak dikurangi aktif'
            : 'Render sesuai kebutuhan (demand)'}
        </span>

        <button
          type="button"
          aria-pressed={touchOrbitActive}
          onClick={handleToggleTouchOrbit}
          data-testid="outfit-studio-touch-toggle"
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

        <p
          className="sr-only"
          aria-live="polite"
          data-testid="outfit-studio-live-region"
        >
          {liveAnnouncement}
        </p>
      </div>
    </section>
  );
}
