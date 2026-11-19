'use client';

import { useMemo, useRef, type KeyboardEvent } from 'react';
import type {
  OutfitSlotInput,
  OutfitStudioCatalogDto,
  OutfitStudioGarmentDto,
} from '@arven/contracts';
import { Badge, Button, StatusBanner, cn, formatIDR } from '@arven/ui';
import {
  OUTFIT_SLOT_LABELS,
  OUTFIT_STUDIO_RIG_CONTRACT,
  findConflictForCandidate,
  findGarmentByVariantId,
  type ClientConflictResolution,
  type OutfitDraftMap,
} from '@/lib/outfit-helpers';

export interface OutfitSlotPickerProps {
  readonly catalog: OutfitStudioCatalogDto;
  readonly activeSlot: OutfitSlotInput;
  readonly draftSlots: OutfitDraftMap;
  readonly conflictAlert: {
    readonly message: string;
    readonly candidateGarment: OutfitStudioGarmentDto | null;
    readonly resolution: ClientConflictResolution | null;
  } | null;
  readonly onActiveSlotChange: (slot: OutfitSlotInput) => void;
  readonly onSelectGarment: (garment: OutfitStudioGarmentDto) => void;
  readonly onResolveConflict: () => void;
  readonly onDismissConflict: () => void;
  readonly onSelectVariant: (slot: OutfitSlotInput, variantId: string) => void;
  readonly onSelectPreset: (slot: OutfitSlotInput, presetId: string | null) => void;
  readonly onClearSlot: (slot: OutfitSlotInput) => void;
  readonly onApplyPublicPreset: (presetId: string) => void;
  readonly activePublicPresetId: string | null;
}

function handleRovingKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  total: number,
  onMove: (nextIdx: number) => void,
) {
  if (total <= 1) return;
  let nextIdx: number | null = null;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIdx = (index + 1) % total;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIdx = (index - 1 + total) % total;
  } else if (event.key === 'Home') {
    nextIdx = 0;
  } else if (event.key === 'End') {
    nextIdx = total - 1;
  }
  if (nextIdx === null) return;
  event.preventDefault();
  onMove(nextIdx);
}

export function OutfitSlotPicker({
  catalog,
  activeSlot,
  draftSlots,
  conflictAlert,
  onActiveSlotChange,
  onSelectGarment,
  onResolveConflict,
  onDismissConflict,
  onSelectVariant,
  onSelectPreset,
  onClearSlot,
  onApplyPublicPreset,
  activePublicPresetId,
}: OutfitSlotPickerProps) {
  const slotTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const garmentRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const variantRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const presetRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const garmentsForActiveSlot = useMemo(
    () => catalog.garments.filter((g) => g.compatibility.slot === activeSlot),
    [activeSlot, catalog.garments],
  );

  const activeSelection = draftSlots[activeSlot] ?? null;
  const activeMatch = useMemo(() => {
    if (!activeSelection) return null;
    return findGarmentByVariantId(catalog, activeSelection.variantId);
  }, [activeSelection, catalog]);

  const activeGarment = activeMatch?.garment ?? null;
  const activeVariant = activeMatch?.variant ?? null;
  const activePresets = useMemo(
    () => (activeGarment ? activeGarment.customizationPresets.filter((p) => p.isActive) : []),
    [activeGarment],
  );

  return (
    <div className="space-y-6">
      {/* Public Curated Presets */}
      {catalog.publicPresets.length > 0 ? (
        <div className="space-y-2.5 border border-hairline bg-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Paduan Kurasi Studio
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {catalog.publicPresets.map((preset) => {
              const isSelected = activePublicPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onApplyPublicPreset(preset.id)}
                  className={cn(
                    'inline-flex min-h-11 min-w-11 items-center gap-2 rounded-[var(--radius-sm)] border px-3.5 py-2 text-xs font-medium cursor-pointer',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    isSelected
                      ? 'border-2 border-strong-border bg-panel font-semibold text-ink'
                      : 'border-control-border bg-elevated text-ink-secondary hover:border-strong-border hover:text-ink',
                  )}
                >
                  <span>{preset.title}</span>
                  <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                    ({formatIDR(preset.liveTotalIdr)})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Slot Switcher Radiogroup */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
            Pilih Slot Pakaian
          </p>
          {activeSelection ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onClearSlot(activeSlot)}
              className="min-h-11"
            >
              Bersihkan Slot
            </Button>
          ) : null}
        </div>

        <div
          role="radiogroup"
          aria-label="Slot pakaian Outfit Studio"
          className="flex flex-wrap items-center gap-2"
        >
          {OUTFIT_STUDIO_RIG_CONTRACT.SLOTS.map((slot, idx) => {
            const selected = activeSlot === slot;
            const populated = Boolean(draftSlots[slot]);
            return (
              <button
                key={slot}
                ref={(el) => {
                  slotTabRefs.current[idx] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onActiveSlotChange(slot)}
                onKeyDown={(event) =>
                  handleRovingKeyDown(
                    event,
                    idx,
                    OUTFIT_STUDIO_RIG_CONTRACT.SLOTS.length,
                    (nextIdx) => {
                      const nextSlot = OUTFIT_STUDIO_RIG_CONTRACT.SLOTS[nextIdx];
                      if (nextSlot) {
                        onActiveSlotChange(nextSlot);
                        slotTabRefs.current[nextIdx]?.focus();
                      }
                    },
                  )
                }
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center gap-2 rounded-[var(--radius-sm)] border px-3.5 py-2 text-xs font-medium cursor-pointer',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  selected
                    ? 'border-2 border-strong-border bg-inverse font-semibold text-ink-inverse'
                    : populated
                      ? 'border-control-border bg-panel text-ink hover:border-strong-border'
                      : 'border-control-border bg-elevated text-ink-secondary hover:border-strong-border hover:text-ink',
                )}
              >
                <span>{OUTFIT_SLOT_LABELS[slot]}</span>
                {populated ? (
                  <span
                    className={cn(
                      'font-mono text-[11px]',
                      selected ? 'text-ink-inverse' : 'text-ink-muted',
                    )}
                  >
                    (Terisi)
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline Compatibility Rejection Alert */}
      {conflictAlert ? (
        <StatusBanner
          tone="danger"
          title="Kombinasi Layer Tidak Kompatibel"
          description={conflictAlert.message}
          onDismiss={onDismissConflict}
          action={
            conflictAlert.resolution && conflictAlert.candidateGarment ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onResolveConflict}
                className="min-h-11"
              >
                Lepas {OUTFIT_SLOT_LABELS[conflictAlert.resolution.conflictingSlot]} &amp; Pasang
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {/* Garment Options Radiogroup for Active Slot */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink">
            Koleksi Slot {OUTFIT_SLOT_LABELS[activeSlot]}
          </h2>
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {garmentsForActiveSlot.length} item kompatibel
          </span>
        </div>

        {garmentsForActiveSlot.length === 0 ? (
          <div className="border border-hairline bg-subtle p-5 text-sm text-ink-muted">
            Belum ada produk yang tersedia untuk slot {OUTFIT_SLOT_LABELS[activeSlot]}.
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label={`Pilihan produk untuk slot ${OUTFIT_SLOT_LABELS[activeSlot]}`}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {garmentsForActiveSlot.map((garment, idx) => {
              const isSelected = activeGarment?.productId === garment.productId;
              const conflict = findConflictForCandidate(draftSlots, garment, catalog);
              const defaultVariant =
                garment.variants.find((v) => v.inStock) ?? garment.variants[0] ?? null;
              const hasAnyStock = garment.variants.some((v) => v.inStock);

              return (
                <button
                  key={garment.assetId}
                  ref={(el) => {
                    garmentRadioRefs.current[idx] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-disabled={Boolean(conflict)}
                  tabIndex={
                    isSelected || (!activeGarment && idx === 0) ? 0 : -1
                  }
                  onClick={() => onSelectGarment(garment)}
                  onKeyDown={(event) =>
                    handleRovingKeyDown(
                      event,
                      idx,
                      garmentsForActiveSlot.length,
                      (nextIdx) => {
                        const nextGarment = garmentsForActiveSlot[nextIdx];
                        if (nextGarment) {
                          garmentRadioRefs.current[nextIdx]?.focus();
                          onSelectGarment(nextGarment);
                        }
                      },
                    )
                  }
                  className={cn(
                    'flex min-h-11 items-start gap-3 rounded-[var(--radius-sm)] border p-3 text-left transition-colors cursor-pointer',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    isSelected
                      ? 'border-2 border-strong-border bg-panel'
                      : conflict
                        ? 'border-hairline bg-subtle text-ink-muted hover:border-danger-fg'
                        : 'border-control-border bg-elevated hover:border-strong-border hover:bg-subtle',
                  )}
                >
                  <img
                    src={garment.posterUrl}
                    alt={garment.productName}
                    decoding="async"
                    className="aspect-[3/4] w-16 shrink-0 border border-hairline bg-subtle object-cover"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isSelected ? <Badge tone="success">Dipilih</Badge> : null}
                      {conflict ? <Badge tone="danger">Konflik Layer</Badge> : null}
                      {!hasAnyStock ? <Badge tone="warning">Stok Habis</Badge> : null}
                    </div>
                    <p className="font-display text-lg font-medium leading-snug text-ink">
                      {garment.productName}
                    </p>
                    <p className="text-xs text-ink-secondary">
                      {garment.material} / {garment.fit}
                    </p>
                    {defaultVariant ? (
                      <p className="font-mono text-xs font-medium tabular-nums text-ink">
                        {formatIDR(defaultVariant.priceIdr)}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Garment Variant & Colorway Preset Controls */}
      {activeGarment ? (
        <div className="space-y-4 border-t border-hairline pt-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                Varian Ukuran &amp; Warna ({activeGarment.productName})
              </p>
              {activeVariant ? (
                <span className="font-mono text-xs tabular-nums text-ink-muted">
                  SKU: {activeVariant.sku} ({activeVariant.inStock ? 'Tersedia' : 'Stok Habis'})
                </span>
              ) : null}
            </div>
            <div
              role="radiogroup"
              aria-label={`Pilih varian untuk ${activeGarment.productName}`}
              className="flex flex-wrap items-center gap-2"
            >
              {activeGarment.variants.map((variant, idx) => {
                const isSelected = activeVariant?.id === variant.id;
                return (
                  <button
                    key={variant.id}
                    ref={(el) => {
                      variantRadioRefs.current[idx] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => onSelectVariant(activeSlot, variant.id)}
                    onKeyDown={(event) =>
                      handleRovingKeyDown(
                        event,
                        idx,
                        activeGarment.variants.length,
                        (nextIdx) => {
                          const nextVariant = activeGarment.variants[nextIdx];
                          if (nextVariant) {
                            onSelectVariant(activeSlot, nextVariant.id);
                            variantRadioRefs.current[nextIdx]?.focus();
                          }
                        },
                      )
                    }
                    className={cn(
                      'inline-flex min-h-11 min-w-11 items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-xs font-medium cursor-pointer',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                      isSelected
                        ? 'border-2 border-strong-border bg-inverse font-semibold text-ink-inverse'
                        : variant.inStock
                          ? 'border-control-border bg-elevated text-ink hover:border-strong-border'
                          : 'border-hairline bg-subtle text-ink-muted line-through',
                    )}
                  >
                    <span>
                      {variant.color} / {variant.size}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums">
                      {formatIDR(variant.priceIdr)}
                    </span>
                    {!variant.inStock ? (
                      <span className="text-[11px] no-underline">(Habis)</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {activePresets.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                Preset Material &amp; Warna 3D
              </p>
              <div
                role="radiogroup"
                aria-label={`Pilih preset material untuk ${activeGarment.productName}`}
                className="flex flex-wrap items-center gap-2"
              >
                {activePresets.map((preset, idx) => {
                  const isSelected = activeSelection?.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      ref={(el) => {
                        presetRadioRefs.current[idx] = el;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isSelected || (!activeSelection?.presetId && idx === 0) ? 0 : -1}
                      onClick={() => onSelectPreset(activeSlot, preset.id)}
                      onKeyDown={(event) =>
                        handleRovingKeyDown(
                          event,
                          idx,
                          activePresets.length,
                          (nextIdx) => {
                            const nextPreset = activePresets[nextIdx];
                            if (nextPreset) {
                              onSelectPreset(activeSlot, nextPreset.id);
                              presetRadioRefs.current[nextIdx]?.focus();
                            }
                          },
                        )
                      }
                      className={cn(
                        'inline-flex min-h-11 min-w-11 items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-xs font-medium cursor-pointer',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                        isSelected
                          ? 'border-2 border-strong-border bg-panel font-semibold text-ink'
                          : 'border-control-border bg-elevated text-ink-secondary hover:border-strong-border hover:text-ink',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-4 w-4 shrink-0 rounded-full border border-control-border"
                        style={{ backgroundColor: preset.swatchHex }}
                      />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
