'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AddOutfitToCartResultDto,
  OutfitSceneDto,
  OutfitSlotInput,
  OutfitStudioCatalogDto,
  OutfitStudioGarmentDto,
} from '@arven/contracts';
import type { OutfitSlotRenderItem } from '@arven/three-engine/outfit-studio';
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
  StatusBanner,
  Surface,
  buttonClassName,
  cn,
  formatIDR,
  useToast,
} from '@arven/ui';
import { OutfitStudio3DIsland } from '@/components/experience/outfit-studio-3d-island';
import { OutfitSlotPicker } from '@/components/experience/outfit-slot-picker';
import { OutfitStudioFallback } from '@/components/experience/outfit-studio-fallback';
import { SavedOutfitsPanel } from '@/components/experience/saved-outfits-panel';
import { ApiClientError, storefrontApi } from '@/lib/api-client';
import {
  OUTFIT_SLOT_LABELS,
  OUTFIT_STUDIO_DISCLOSURE,
  OUTFIT_STUDIO_RIG_CONTRACT,
  computeDraftLiveTotalIdr,
  countDraftSlots,
  evaluateClientOutfitSelection,
  findConflictForCandidate,
  findGarmentByVariantId,
  formatSlotConflictSummary,
  parseOutfitDraftSearchParams,
  serializeOutfitDraftSearchParams,
  type ClientConflictResolution,
  type OutfitDraftMap,
} from '@/lib/outfit-helpers';

export interface OutfitStudioViewProps {
  readonly initialCatalog: OutfitStudioCatalogDto | null;
  readonly initialSearchParams?: Record<string, string | string[] | undefined>;
  readonly initialError?: string | null;
}

export function OutfitStudioView({
  initialCatalog,
  initialSearchParams = {},
  initialError = null,
}: OutfitStudioViewProps) {
  const { toast } = useToast();

  const [catalog, setCatalog] = useState<OutfitStudioCatalogDto | null>(initialCatalog);
  const [loadingCatalog, setLoadingCatalog] = useState(
    initialCatalog === null && !initialError,
  );
  const [catalogError, setCatalogError] = useState<string | null>(initialError);

  const initialDraft = useMemo(() => {
    if (!initialCatalog) {
      return { slots: {} as OutfitDraftMap, presetId: null, discardedCount: 0 };
    }
    return parseOutfitDraftSearchParams(initialSearchParams, initialCatalog);
  }, [initialCatalog, initialSearchParams]);

  const [draftSlots, setDraftSlots] = useState<OutfitDraftMap>(initialDraft.slots);
  const [activePublicPresetId, setActivePublicPresetId] = useState<string | null>(
    initialDraft.presetId,
  );
  const [activeSlot, setActiveSlot] = useState<OutfitSlotInput>('top');
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const [conflictAlert, setConflictAlert] = useState<{
    message: string;
    candidateGarment: OutfitStudioGarmentDto | null;
    resolution: ClientConflictResolution | null;
  } | null>(null);

  // Validation & Bag state
  const [validating, setValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    tone: 'success' | 'danger';
    message: string;
  } | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartResult, setCartResult] = useState<AddOutfitToCartResultDto | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);

  // Customer auth & saved scenes
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [scenes, setScenes] = useState<OutfitSceneDto[]>([]);
  const [loadingScenes, setLoadingScenes] = useState(true);
  const [scenesError, setScenesError] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [savingScene, setSavingScene] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);

  const controlsAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const applyFetchedCatalog = useCallback(
    (nextCatalog: OutfitStudioCatalogDto) => {
      setCatalog(nextCatalog);
      const parsed = parseOutfitDraftSearchParams(
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : initialSearchParams,
        nextCatalog,
      );
      setDraftSlots(parsed.slots);
      setActivePublicPresetId(parsed.presetId);
    },
    [initialSearchParams],
  );

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const nextCatalog = await storefrontApi.outfitStudio.getCatalog();
      applyFetchedCatalog(nextCatalog);
    } catch (err) {
      setCatalogError(
        err instanceof ApiClientError
          ? err.message
          : 'Gagal memuat katalog Outfit Studio.',
      );
    } finally {
      setLoadingCatalog(false);
    }
  }, [applyFetchedCatalog]);

  useEffect(() => {
    if (initialCatalog !== null) {
      return;
    }
    let active = true;
    storefrontApi.outfitStudio
      .getCatalog()
      .then((nextCatalog) => {
        if (!active) return;
        applyFetchedCatalog(nextCatalog);
        setCatalogError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setCatalogError(
          err instanceof ApiClientError
            ? err.message
            : 'Gagal memuat katalog Outfit Studio.',
        );
      })
      .finally(() => {
        if (active) {
          setLoadingCatalog(false);
        }
      });

    return () => {
      active = false;
    };
  }, [applyFetchedCatalog, initialCatalog]);

  const loadSavedScenes = useCallback(async () => {
    setLoadingScenes(true);
    setScenesError(null);
    try {
      const me = await storefrontApi.getCurrentUser();
      if (!me?.user) {
        setIsAuthenticated(false);
        setScenes([]);
        return;
      }
      setIsAuthenticated(true);
      const list = await storefrontApi.outfitScenes.list();
      setScenes(list);
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        setIsAuthenticated(false);
        setScenes([]);
      } else {
        setScenesError(
          err instanceof ApiClientError
            ? err.message
            : 'Gagal memuat daftar paduan tersimpan.',
        );
      }
    } finally {
      setAuthChecked(true);
      setLoadingScenes(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getCurrentUser()
      .then(async (me) => {
        if (!active) return;
        if (!me?.user) {
          setIsAuthenticated(false);
          setScenes([]);
          return;
        }
        setIsAuthenticated(true);
        const list = await storefrontApi.outfitScenes.list();
        if (!active) return;
        setScenes(list);
        setScenesError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          setIsAuthenticated(false);
          setScenes([]);
        } else {
          setScenesError(
            err instanceof ApiClientError
              ? err.message
              : 'Gagal memuat daftar paduan tersimpan.',
          );
        }
      })
      .finally(() => {
        if (active) {
          setAuthChecked(true);
          setLoadingScenes(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Keep URL search params synchronized with current draft
  useEffect(() => {
    if (typeof window === 'undefined' || !catalog) return;
    const qs = serializeOutfitDraftSearchParams(draftSlots, activePublicPresetId);
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  }, [activePublicPresetId, catalog, draftSlots]);

  const slotCount = useMemo(() => countDraftSlots(draftSlots), [draftSlots]);
  const liveTotalIdr = useMemo(
    () => (catalog ? computeDraftLiveTotalIdr(catalog, draftSlots) : 0),
    [catalog, draftSlots],
  );

  const clientEvaluation = useMemo(() => {
    if (!catalog || slotCount === 0) {
      return { valid: true, violations: [] };
    }
    return evaluateClientOutfitSelection(catalog, draftSlots);
  }, [catalog, draftSlots, slotCount]);

  const islandSlots = useMemo(() => {
    const result: Partial<Record<OutfitSlotInput, OutfitSlotRenderItem>> = {};
    if (!catalog) return result;
    for (const slot of OUTFIT_STUDIO_RIG_CONTRACT.SLOTS) {
      const selection = draftSlots[slot];
      if (!selection) continue;
      const match = findGarmentByVariantId(catalog, selection.variantId);
      if (!match) continue;
      const preset = selection.presetId
        ? match.garment.customizationPresets.find((p) => p.id === selection.presetId) ?? null
        : null;
      result[slot] = {
        slot,
        productId: match.garment.productId,
        variantId: match.variant.id,
        assetId: match.garment.assetId,
        modelUrl: match.garment.modelUrl,
        mobileModelUrl: match.garment.mobileModelUrl,
        anchor: match.garment.compatibility.anchor,
        materialSlots: match.garment.materialSlots,
        presetId: preset?.id ?? null,
        materialOverrides: preset?.materialOverrides ?? null,
      };
    }
    return result;
  }, [catalog, draftSlots]);

  const applyGarmentSelection = useCallback(
    (garment: OutfitStudioGarmentDto, clearSlot?: OutfitSlotInput) => {
      const targetSlot = garment.compatibility.slot;
      const defaultVariant =
        garment.variants.find((v) => v.inStock) ?? garment.variants[0];
      if (!defaultVariant) return;

      const matchedPreset =
        garment.customizationPresets.find(
          (p) =>
            p.isActive &&
            (p.variantId === defaultVariant.id ||
              p.variantColor?.toLowerCase() === defaultVariant.color.toLowerCase()),
        ) ??
        garment.customizationPresets.find((p) => p.isActive) ??
        null;

      setDraftSlots((prev) => {
        const next: OutfitDraftMap = { ...prev };
        if (clearSlot) {
          delete next[clearSlot];
        }
        next[targetSlot] = {
          slot: targetSlot,
          variantId: defaultVariant.id,
          presetId: matchedPreset?.id ?? null,
        };
        return next;
      });
      setActivePublicPresetId(null);
      setActiveSceneId(null);
      setConflictAlert(null);
      setValidationStatus(null);
      setCartResult(null);
      setCartError(null);
      setLiveAnnouncement(
        `${garment.productName} dipasang pada slot ${OUTFIT_SLOT_LABELS[targetSlot]}.`,
      );
    },
    [],
  );

  const handleSelectGarment = useCallback(
    (garment: OutfitStudioGarmentDto) => {
      if (!catalog) return;
      const conflict = findConflictForCandidate(draftSlots, garment, catalog);
      if (conflict) {
        setConflictAlert({
          message: conflict.message,
          candidateGarment: garment,
          resolution: conflict,
        });
        setLiveAnnouncement(conflict.message);
        return;
      }
      applyGarmentSelection(garment);
    },
    [applyGarmentSelection, catalog, draftSlots],
  );

  const handleResolveConflict = useCallback(() => {
    if (!conflictAlert?.candidateGarment || !conflictAlert.resolution) return;
    applyGarmentSelection(
      conflictAlert.candidateGarment,
      conflictAlert.resolution.conflictingSlot,
    );
  }, [applyGarmentSelection, conflictAlert]);

  const handleSelectVariant = useCallback(
    (slot: OutfitSlotInput, variantId: string) => {
      if (!catalog) return;
      const match = findGarmentByVariantId(catalog, variantId);
      if (!match) return;

      setDraftSlots((prev) => {
        const current = prev[slot];
        const matchingPreset =
          match.garment.customizationPresets.find(
            (p) =>
              p.isActive &&
              (p.variantId === variantId ||
                p.variantColor?.toLowerCase() === match.variant.color.toLowerCase()),
          ) ?? null;

        return {
          ...prev,
          [slot]: {
            slot,
            variantId,
            presetId: matchingPreset?.id ?? current?.presetId ?? null,
          },
        };
      });
      setActivePublicPresetId(null);
      setValidationStatus(null);
      setCartResult(null);
      setCartError(null);
    },
    [catalog],
  );

  const handleSelectPreset = useCallback(
    (slot: OutfitSlotInput, presetId: string | null) => {
      if (!catalog) return;
      setDraftSlots((prev) => {
        const current = prev[slot];
        if (!current) return prev;
        const match = findGarmentByVariantId(catalog, current.variantId);
        let nextVariantId = current.variantId;
        if (match && presetId) {
          const preset = match.garment.customizationPresets.find((p) => p.id === presetId);
          if (preset?.variantColor) {
            const matchingVariant =
              match.garment.variants.find(
                (v) =>
                  v.color.toLowerCase() === preset.variantColor?.toLowerCase() &&
                  v.size === match.variant.size,
              ) ??
              match.garment.variants.find(
                (v) => v.color.toLowerCase() === preset.variantColor?.toLowerCase(),
              );
            if (matchingVariant) {
              nextVariantId = matchingVariant.id;
            }
          }
        }
        return {
          ...prev,
          [slot]: {
            slot,
            variantId: nextVariantId,
            presetId,
          },
        };
      });
      setValidationStatus(null);
    },
    [catalog],
  );

  const handleClearSlot = useCallback((slot: OutfitSlotInput) => {
    setDraftSlots((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    setActivePublicPresetId(null);
    setConflictAlert(null);
    setValidationStatus(null);
    setCartResult(null);
    setCartError(null);
    setLiveAnnouncement(`Slot ${OUTFIT_SLOT_LABELS[slot]} dibersihkan.`);
  }, []);

  const handleApplyPublicPreset = useCallback(
    (presetId: string) => {
      if (!catalog) return;
      const preset = catalog.publicPresets.find((p) => p.id === presetId);
      if (!preset) return;
      const next: OutfitDraftMap = {};
      for (const slotItem of preset.slots) {
        const match = findGarmentByVariantId(catalog, slotItem.variantId);
        if (match && match.garment.compatibility.slot === slotItem.slot) {
          next[slotItem.slot] = {
            slot: slotItem.slot,
            variantId: match.variant.id,
            presetId: slotItem.presetId ?? null,
          };
        }
      }
      setDraftSlots(next);
      setActivePublicPresetId(preset.id);
      setActiveSceneId(null);
      setConflictAlert(null);
      setValidationStatus(null);
      setCartResult(null);
      setCartError(null);
      setLiveAnnouncement(`Paduan kurasi ${preset.title} diterapkan.`);
    },
    [catalog],
  );

  const buildPayloadSlots = useCallback(() => {
    if (!catalog) return [];
    const items: Array<{
      slot: OutfitSlotInput;
      productId: string;
      variantId: string;
      assetId: string;
      presetId: string | null;
    }> = [];
    for (const slot of OUTFIT_STUDIO_RIG_CONTRACT.SLOTS) {
      const sel = draftSlots[slot];
      if (!sel) continue;
      const match = findGarmentByVariantId(catalog, sel.variantId);
      if (!match) continue;
      items.push({
        slot,
        productId: match.garment.productId,
        variantId: match.variant.id,
        assetId: match.garment.assetId,
        presetId: sel.presetId,
      });
    }
    return items;
  }, [catalog, draftSlots]);

  const handleValidateServer = useCallback(async () => {
    if (!catalog || slotCount === 0) return;
    setValidating(true);
    setValidationStatus(null);
    try {
      const payloadSlots = buildPayloadSlots();
      const result = await storefrontApi.outfitStudio.validate({
        rigId: catalog.rig.rigId,
        slots: payloadSlots,
      });
      setValidationStatus({
        tone: 'success',
        message: `Validasi server berhasil untuk ${result.slotCount} item pada manekin ${result.rigId}.`,
      });
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? formatSlotConflictSummary(err.details, err.message, catalog)
          : 'Validasi kompatibilitas gagal.';
      setValidationStatus({
        tone: 'danger',
        message: msg,
      });
    } finally {
      setValidating(false);
    }
  }, [buildPayloadSlots, catalog, slotCount]);

  const handleAddOutfitToCart = useCallback(async () => {
    if (!catalog || slotCount === 0) return;
    setAddingToCart(true);
    setCartError(null);
    setCartResult(null);
    try {
      const payloadSlots = buildPayloadSlots().map((item) => ({
        slot: item.slot,
        variantId: item.variantId,
        presetId: item.presetId,
      }));
      const result = await storefrontApi.outfitStudio.addToCart({
        rigId: catalog.rig.rigId,
        slots: payloadSlots,
      });
      setCartResult(result);
      const addedCount = result.results.filter((r) => r.status === 'ADDED').length;
      const message = `${addedCount} item kompatibel ditambahkan ke tas.`;
      setLiveAnnouncement(message);
      toast({
        tone: addedCount > 0 ? 'success' : 'warning',
        title: addedCount > 0 ? 'Ditambahkan ke Tas' : 'Periksa Ketersediaan Stok',
        description: message,
      });
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? formatSlotConflictSummary(err.details, err.message, catalog)
          : 'Gagal menambahkan item ke tas belanja.';
      setCartError(msg);
      setLiveAnnouncement(msg);
    } finally {
      setAddingToCart(false);
    }
  }, [buildPayloadSlots, catalog, slotCount, toast]);

  const handleSaveOutfit = useCallback(
    async (title: string): Promise<boolean> => {
      if (!catalog || slotCount === 0) return false;
      setSavingScene(true);
      setSaveError(null);
      try {
        const created = await storefrontApi.outfitScenes.create({
          title,
          rigId: catalog.rig.rigId,
          slots: buildPayloadSlots(),
        });
        setScenes((prev) => [created, ...prev]);
        setActiveSceneId(created.id);
        toast({
          tone: 'success',
          title: 'Paduan Tersimpan',
          description: `${created.title} berhasil disimpan ke akun Anda.`,
        });
        return true;
      } catch (err) {
        const msg =
          err instanceof ApiClientError
            ? formatSlotConflictSummary(err.details, err.message, catalog)
            : 'Gagal menyimpan paduan pakaian.';
        setSaveError(msg);
        return false;
      } finally {
        setSavingScene(false);
      }
    },
    [buildPayloadSlots, catalog, slotCount, toast],
  );

  const handleLoadScene = useCallback(
    (scene: OutfitSceneDto) => {
      if (!catalog) return;
      const next: OutfitDraftMap = {};
      for (const item of scene.slots) {
        if (item.stale) continue;
        const match = findGarmentByVariantId(catalog, item.variantId);
        if (match && match.garment.compatibility.slot === item.slot) {
          next[item.slot] = {
            slot: item.slot,
            variantId: match.variant.id,
            presetId: item.presetId ?? null,
          };
        }
      }
      setDraftSlots(next);
      setActiveSceneId(scene.id);
      setActivePublicPresetId(null);
      setConflictAlert(null);
      setValidationStatus(null);
      setLiveAnnouncement(`Paduan ${scene.title} dimuat ke Studio.`);
    },
    [catalog],
  );

  const handleDeleteScene = useCallback(
    async (sceneId: string) => {
      setDeletingSceneId(sceneId);
      try {
        await storefrontApi.outfitScenes.remove(sceneId);
        setScenes((prev) => prev.filter((s) => s.id !== sceneId));
        if (activeSceneId === sceneId) {
          setActiveSceneId(null);
        }
        toast({
          tone: 'success',
          title: 'Paduan Dihapus',
        });
      } catch (err) {
        toast({
          tone: 'danger',
          title: 'Gagal Menghapus Paduan',
          description:
            err instanceof ApiClientError ? err.message : 'Silakan coba beberapa saat lagi.',
        });
      } finally {
        setDeletingSceneId(null);
      }
    },
    [activeSceneId, toast],
  );

  const handleWebGLFallback = useCallback((reason: string) => {
    setFallbackReason(reason);
    setViewMode('2d');
    setLiveAnnouncement(
      'Tampilan 3D dialihkan ke mode poster 2D agar penelusuran tetap stabil.',
    );
  }, []);

  const loginRedirectHref = useMemo(() => {
    const qs = serializeOutfitDraftSearchParams(draftSlots, activePublicPresetId);
    const nextPath = qs ? `/outfit-studio?${qs}` : '/outfit-studio';
    return `/auth/login?next=${encodeURIComponent(nextPath)}`;
  }, [activePublicPresetId, draftSlots]);

  if (loadingCatalog) {
    return (
      <LoadingState
        label="Memuat Studio Padu Padan ARVEN"
        rows={6}
        className="min-h-[75dvh]"
      />
    );
  }

  if (catalogError || !catalog) {
    return (
      <ErrorState
        title="Gagal memuat Outfit Studio"
        message={catalogError ?? 'Katalog Outfit Studio tidak tersedia saat ini.'}
        onRetry={() => void loadCatalog()}
      />
    );
  }

  const canRetry3D =
    fallbackReason !== 'webgl_unavailable' &&
    fallbackReason !== 'webgl_disabled';

  return (
    <div className="space-y-8">
      <div className="sr-only" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      {/* Editorial Header & Permanent Disclosure Banner */}
      <header className="space-y-4 border-b border-hairline pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#outfit-studio-controls"
                className="fixed top-3 left-3 z-[var(--z-toast)] inline-flex min-h-11 -translate-y-[250%] items-center rounded-[var(--radius-xs)] border border-strong-border bg-inverse px-4 py-2 text-xs font-semibold text-ink-inverse shadow-[var(--shadow-raised)] transition-transform duration-[var(--duration-fast)] focus:translate-y-0 focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Lewati Studio 3D
              </a>
              <span className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                Outfit Studio
              </span>
              <span className="border border-hairline bg-subtle px-2 py-0.5 font-mono text-xs text-ink">
                {catalog.rig.rigId}
              </span>
              <span className="font-mono text-xs tabular-nums text-ink-muted">
                Slot Terisi: {slotCount} / 5
              </span>
            </div>
            <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
              Studio Padu Padan ARVEN
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Mode tampilan Outfit Studio"
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
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  viewMode === '3d'
                    ? 'border-2 border-strong-border bg-inverse font-semibold text-ink-inverse'
                    : 'border-control-border bg-elevated text-ink-secondary hover:border-strong-border hover:text-ink',
                )}
              >
                Manekin 3D
              </button>
              <button
                type="button"
                aria-pressed={viewMode === '2d'}
                onClick={() => setViewMode('2d')}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border px-3.5 py-2 text-xs font-medium cursor-pointer',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  viewMode === '2d'
                    ? 'border-2 border-strong-border bg-inverse font-semibold text-ink-inverse'
                    : 'border-control-border bg-elevated text-ink-secondary hover:border-strong-border hover:text-ink',
                )}
              >
                Poster 2D
              </button>
            </div>

            <Link
              href="/showroom"
              className={buttonClassName({ variant: 'secondary', size: 'md' })}
            >
              Kembali ke Showroom
            </Link>
          </div>
        </div>

        {/* Permanent Mandatory Disclosure (outside Canvas, always visible) */}
        <StatusBanner
          tone="info"
          title="Catatan Pratinjau Manekin Standar"
          description={OUTFIT_STUDIO_DISCLOSURE}
          action={
            <Link
              href="/shop"
              className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            >
              Panduan Ukuran di Katalog
            </Link>
          }
        />
      </header>

      {/* Split Editorial Workspace */}
      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        {/* Left/Top: Dark Showcase Mannequin Stage */}
        <section
          aria-label="Panggung Manekin Outfit Studio"
          className="space-y-4 lg:sticky lg:top-20 lg:col-span-5"
        >
          {viewMode === '3d' ? (
            <div
              data-theme="dark"
              className="overflow-hidden rounded-[var(--radius-sm)] border border-[#46494C] bg-[#17191B] text-[#F8F7F3]"
            >
              <OutfitStudio3DIsland
                rigId={catalog.rig.rigId}
                rigModelUrl={catalog.rig.modelUrl}
                rigMobileModelUrl={catalog.rig.mobileModelUrl}
                rigPosterUrl={catalog.rig.posterUrl}
                slots={islandSlots}
                activeSlotCount={slotCount}
                reducedMotion={reducedMotion}
                onWebGLFallback={handleWebGLFallback}
                onSlotError={(slot, reason) => {
                  setLiveAnnouncement(
                    `Gagal memuat model 3D untuk slot ${OUTFIT_SLOT_LABELS[slot]} (${reason}).`,
                  );
                }}
              />
            </div>
          ) : (
            <OutfitStudioFallback
              catalog={catalog}
              draftSlots={draftSlots}
              reason={fallbackReason}
              canRetry3D={canRetry3D}
              onRetry3D={() => {
                setFallbackReason(null);
                setViewMode('3d');
              }}
              onSelectSlot={(slot) => {
                setActiveSlot(slot);
                controlsAnchorRef.current?.focus();
              }}
              onClearSlot={handleClearSlot}
            />
          )}

          {/* Selected Composition Quick Summary */}
          <Surface variant="panel" border="control" padding="md" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Estimasi Harga Langsung
              </span>
              <span className="font-mono text-xl font-medium tabular-nums text-ink">
                {formatIDR(liveTotalIdr)}
              </span>
            </div>

            {!clientEvaluation.valid ? (
              <StatusBanner
                tone="danger"
                description={clientEvaluation.violations[0]?.message ?? 'Konflik kompatibilitas terdeteksi.'}
              />
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="primary"
                size="lg"
                fullWidth
                disabled={slotCount === 0 || !clientEvaluation.valid}
                isLoading={addingToCart}
                loadingLabel="Menambahkan..."
                onClick={() => void handleAddOutfitToCart()}
                className="min-h-11"
              >
                Tambah Item ke Tas
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                disabled={slotCount === 0}
                isLoading={validating}
                loadingLabel="Memeriksa..."
                onClick={() => void handleValidateServer()}
                className="min-h-11 shrink-0"
              >
                Validasi
              </Button>
            </div>

            {validationStatus ? (
              <StatusBanner
                tone={validationStatus.tone}
                description={validationStatus.message}
              />
            ) : null}

            {cartError ? (
              <StatusBanner
                tone="danger"
                title="Gagal Menambahkan ke Tas"
                description={cartError}
              />
            ) : null}

            {cartResult ? (
              <div className="space-y-2 border-t border-hairline pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                  Hasil Penambahan ke Tas
                </p>
                <ul className="space-y-1.5">
                  {cartResult.results.map((item) => (
                    <li
                      key={`${item.slot}-${item.variantId}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-ink-secondary">
                        {OUTFIT_SLOT_LABELS[item.slot]}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            item.status === 'ADDED'
                              ? 'success'
                              : item.status === 'OUT_OF_STOCK'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {item.status}
                        </Badge>
                        {item.reason ? (
                          <span className="text-ink-muted">{item.reason}</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/cart"
                  className={buttonClassName({ variant: 'secondary', size: 'sm', fullWidth: true })}
                >
                  Buka Tas Belanja
                </Link>
              </div>
            ) : null}
          </Surface>
        </section>

        {/* Right/Bottom: Editorial Light Controls & Saved Outfits */}
        <section
          id="outfit-studio-controls"
          ref={controlsAnchorRef}
          tabIndex={-1}
          aria-label="Pemilih slot dan paduan pakaian"
          className="space-y-8 focus:outline-none lg:col-span-7"
        >
          <OutfitSlotPicker
            catalog={catalog}
            activeSlot={activeSlot}
            draftSlots={draftSlots}
            conflictAlert={conflictAlert}
            onActiveSlotChange={setActiveSlot}
            onSelectGarment={handleSelectGarment}
            onResolveConflict={handleResolveConflict}
            onDismissConflict={() => setConflictAlert(null)}
            onSelectVariant={handleSelectVariant}
            onSelectPreset={handleSelectPreset}
            onClearSlot={handleClearSlot}
            onApplyPublicPreset={handleApplyPublicPreset}
            activePublicPresetId={activePublicPresetId}
          />

          <SavedOutfitsPanel
            isAuthenticated={isAuthenticated}
            authChecked={authChecked}
            scenes={scenes}
            loadingScenes={loadingScenes}
            scenesError={scenesError}
            activeSceneId={activeSceneId}
            savingScene={savingScene}
            saveError={saveError}
            deletingSceneId={deletingSceneId}
            hasDraftItems={slotCount > 0}
            loginRedirectHref={loginRedirectHref}
            onSaveOutfit={handleSaveOutfit}
            onLoadScene={handleLoadScene}
            onDeleteScene={(id) => void handleDeleteScene(id)}
            onRetryLoad={() => void loadSavedScenes()}
          />
        </section>
      </div>
    </div>
  );
}
