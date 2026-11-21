'use client';

import type { OutfitSlotInput, OutfitStudioCatalogDto } from '@arven/contracts';
import { Badge, Button, StatusBanner, formatIDR } from '@arven/ui';
import {
  OUTFIT_SLOT_LABELS,
  OUTFIT_STUDIO_RIG_CONTRACT,
  findGarmentByVariantId,
  type OutfitDraftMap,
} from '@/lib/outfit-helpers';

export interface OutfitStudioFallbackProps {
  readonly catalog: OutfitStudioCatalogDto;
  readonly draftSlots: OutfitDraftMap;
  readonly reason?: string | null;
  readonly canRetry3D?: boolean;
  readonly onRetry3D?: () => void;
  readonly onSelectSlot: (slot: OutfitSlotInput) => void;
  readonly onClearSlot: (slot: OutfitSlotInput) => void;
}

export function OutfitStudioFallback({
  catalog,
  draftSlots,
  reason,
  canRetry3D = false,
  onRetry3D,
  onSelectSlot,
  onClearSlot,
}: OutfitStudioFallbackProps) {
  return (
    <div
      data-theme="dark"
      data-testid="outfit-studio-2d-fallback"
      className="space-y-4 rounded-[var(--radius-sm)] border border-[#46494C] bg-[#17191B] p-4 text-[#F8F7F3] sm:p-5"
    >
      <StatusBanner
        tone="info"
        title="Mode Studio 2D Aktif"
        description={
          reason
            ? 'Tampilan 3D tidak tersedia pada perangkat ini. Mode poster 2D aktif dan seluruh pemilihan slot, validasi, simpan paduan, serta tambah ke tas tetap berfungsi penuh.'
            : 'Pratinjau 2D manekin standar beserta kartu slot aktif.'
        }
        action={
          canRetry3D && onRetry3D ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetry3D}
              className="min-h-11"
            >
              Muat Ulang 3D
            </Button>
          ) : undefined
        }
      />

      <div className="overflow-hidden border border-[#46494C] bg-[#222528]">
        <div className="relative aspect-[3/4] w-full overflow-hidden">
          <img
            src={catalog.rig.posterUrl}
            alt={`Poster manekin standar ${catalog.rig.rigId}`}
            decoding="async"
            className="h-full w-full object-cover"
          />
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Manekin 2D</Badge>
            <span className="border border-[#46494C] bg-[#17191B] px-2 py-0.5 font-mono text-xs text-[#E9E4DA]">
              {catalog.rig.rigId}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#B2B0A6]">
          Komposisi Slot 2D
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {OUTFIT_STUDIO_RIG_CONTRACT.SLOTS.map((slot) => {
            const selection = draftSlots[slot];
            const matched = selection
              ? findGarmentByVariantId(catalog, selection.variantId)
              : null;
            const preset =
              matched && selection?.presetId
                ? matched.garment.customizationPresets.find(
                    (p) => p.id === selection.presetId,
                  ) ?? null
                : null;

            return (
              <div
                key={slot}
                className="flex items-center justify-between gap-3 border border-[#46494C] bg-[#222528] p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {matched ? (
                    <img
                      src={matched.garment.posterUrl}
                      alt={matched.garment.productName}
                      decoding="async"
                      className="h-14 w-11 shrink-0 border border-[#46494C] bg-[#17191B] object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-11 shrink-0 items-center justify-center border border-[#46494C] bg-[#17191B] font-mono text-xs text-[#B2B0A6]">
                      --
                    </div>
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
                      {OUTFIT_SLOT_LABELS[slot]}
                    </p>
                    {matched ? (
                      <>
                        <p className="truncate text-xs font-medium text-[#F8F7F3]">
                          {matched.garment.productName}
                        </p>
                        <p className="font-mono text-xs tabular-nums text-[#E9E4DA]">
                          {formatIDR(matched.variant.priceIdr)}
                          {preset ? ` / ${preset.label}` : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-[#B2B0A6]">Belum dipilih</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectSlot(slot)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[#9E9C92] bg-[#17191B] px-2.5 py-1.5 text-xs font-medium text-[#F8F7F3] hover:border-[#F8F7F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
                  >
                    {matched ? 'Ubah' : 'Pilih'}
                  </button>
                  {matched ? (
                    <button
                      type="button"
                      aria-label={`Hapus ${OUTFIT_SLOT_LABELS[slot]}`}
                      onClick={() => onClearSlot(slot)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[#9E9C92] bg-[#17191B] px-2.5 py-1.5 text-xs font-medium text-[#E48966] hover:border-[#E48966] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
                    >
                      Hapus
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
