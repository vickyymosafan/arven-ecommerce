import type {
  OutfitAnchorInput,
  OutfitCompatibilityReason,
  OutfitCompatibilityViolationDto,
  OutfitSceneDto,
  OutfitSlotInput,
  OutfitStudioCatalogDto,
  OutfitStudioGarmentDto,
  OutfitStudioGarmentVariantDto,
} from '@arven/contracts';

export const OUTFIT_STUDIO_DISCLOSURE =
  'Pratinjau gaya visual menggunakan manekin standar. Periksa Panduan Ukuran untuk detail ukuran fisik.';

export const OUTFIT_STUDIO_RIG_CONTRACT = {
  RIG_ID: 'arven_mannequin_unisex_v1',
  SKELETON_VERSION: '1.0.0',
  SLOTS: ['top', 'bottom', 'outerwear', 'footwear', 'accessory'] as const satisfies readonly OutfitSlotInput[],
  ANCHORS: {
    top: ['spine_upper'],
    outerwear: ['spine_upper'],
    bottom: ['pelvis'],
    footwear: ['feet'],
    accessory: ['shoulder_left', 'shoulder_right', 'wrist_left'],
  } as const satisfies Record<OutfitSlotInput, readonly OutfitAnchorInput[]>,
  MAX_SAVED_OUTFITS_PER_USER: 50,
  TITLE_MAX: 160,
} as const;

export const OUTFIT_SLOT_LABELS: Readonly<Record<OutfitSlotInput, string>> = {
  top: 'Atasan',
  bottom: 'Bawahan',
  outerwear: 'Outerwear',
  footwear: 'Alas Kaki',
  accessory: 'Aksesori',
};

export interface OutfitDraftSelection {
  readonly slot: OutfitSlotInput;
  readonly variantId: string;
  readonly presetId: string | null;
}

export type OutfitDraftMap = Partial<Record<OutfitSlotInput, OutfitDraftSelection>>;

export interface ParsedApiIssueToken {
  readonly reason: OutfitCompatibilityReason | string | null;
  readonly productId: string | null;
  readonly message: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KNOWN_COMPAT_REASONS = new Set<string>([
  'RIG_MISMATCH',
  'SKELETON_VERSION_MISMATCH',
  'SLOT_MISMATCH',
  'ANCHOR_INVALID',
  'LAYER_CONFLICT',
  'DUPLICATE_SLOT',
  'GARMENT_UNAVAILABLE',
  'VARIANT_PRODUCT_MISMATCH',
  'PRESET_ASSET_MISMATCH',
]);

export function parseApiIssueToken(issue: string): ParsedApiIssueToken {
  const parts = issue.split('|');
  if (parts.length >= 3 && KNOWN_COMPAT_REASONS.has(parts[0] ?? '')) {
    const reason = parts[0] as OutfitCompatibilityReason;
    const productSegment = parts[1] ?? '';
    const productId = productSegment.startsWith('productId=')
      ? productSegment.slice('productId='.length)
      : null;
    const rawMessage = parts.slice(2).join('|').trim();
    return {
      reason,
      productId: productId && productId !== 'none' ? productId : null,
      message: rawMessage || issue,
    };
  }
  return {
    reason: null,
    productId: null,
    message: issue,
  };
}

export function formatOutfitCompatibilityError(params: {
  reason: OutfitCompatibilityReason | string | null;
  slot?: OutfitSlotInput | 'rig';
  garmentName?: string | null;
  conflictingSlot?: OutfitSlotInput | null;
  fallbackMessage?: string | null;
}): string {
  const slotLabel =
    params.slot && params.slot !== 'rig' ? OUTFIT_SLOT_LABELS[params.slot] : 'slot ini';

  switch (params.reason) {
    case 'LAYER_CONFLICT': {
      const nameLower = (params.garmentName ?? '').toLowerCase();
      if (
        nameLower.includes('oversized') ||
        nameLower.includes('poplin') ||
        params.slot === 'top' ||
        params.conflictingSlot === 'top' ||
        params.slot === 'outerwear' ||
        params.conflictingSlot === 'outerwear'
      ) {
        return 'Kemeja oversized ini tidak kompatibel dengan outerwear yang sedang aktif.';
      }
      const otherLabel = params.conflictingSlot
        ? OUTFIT_SLOT_LABELS[params.conflictingSlot].toLowerCase()
        : 'layer lain';
      return `${params.garmentName ?? 'Item ini'} tidak kompatibel dengan ${otherLabel} yang sedang aktif.`;
    }
    case 'SKELETON_VERSION_MISMATCH':
      return `Versi kerangka manekin tidak cocok. ${params.garmentName ?? 'Aset 3D ini'} tidak kompatibel dengan manekin standar ${OUTFIT_STUDIO_RIG_CONTRACT.RIG_ID} (v${OUTFIT_STUDIO_RIG_CONTRACT.SKELETON_VERSION}).`;
    case 'SLOT_MISMATCH':
      return `Aset 3D ini tidak sesuai untuk ${slotLabel}.`;
    case 'DUPLICATE_SLOT':
      return `Setiap slot pakaian hanya dapat diisi oleh satu item (${slotLabel}).`;
    case 'RIG_MISMATCH':
      return `Aset 3D ini tidak kompatibel dengan manekin standar ${OUTFIT_STUDIO_RIG_CONTRACT.RIG_ID} (v${OUTFIT_STUDIO_RIG_CONTRACT.SKELETON_VERSION}).`;
    case 'ANCHOR_INVALID':
      return `Titik jangkar aset 3D tidak valid untuk ${slotLabel}.`;
    case 'GARMENT_UNAVAILABLE':
      return `Produk atau aset 3D untuk ${slotLabel} sedang tidak tersedia.`;
    case 'VARIANT_PRODUCT_MISMATCH':
      return `Varian yang dipilih tidak cocok dengan produk pada ${slotLabel}.`;
    case 'PRESET_ASSET_MISMATCH':
      return `Preset warna tidak cocok dengan aset 3D pada ${slotLabel}.`;
    default:
      return params.fallbackMessage?.trim() || 'Kombinasi pakaian belum kompatibel dengan manekin standar.';
  }
}

export function findGarmentByVariantId(
  catalog: OutfitStudioCatalogDto,
  variantId: string,
): { garment: OutfitStudioGarmentDto; variant: OutfitStudioGarmentVariantDto } | null {
  for (const garment of catalog.garments) {
    const variant = garment.variants.find((v) => v.id === variantId);
    if (variant) {
      return { garment, variant };
    }
  }
  return null;
}

export function parseOutfitDraftSearchParams(
  searchParams: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>,
  catalog: OutfitStudioCatalogDto,
): {
  slots: OutfitDraftMap;
  presetId: string | null;
  discardedCount: number;
} {
  const getParam = (key: string): string | null => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key);
    }
    const raw = searchParams[key];
    if (Array.isArray(raw)) {
      return raw[0] ?? null;
    }
    return typeof raw === 'string' ? raw : null;
  };

  let discardedCount = 0;
  const slots: OutfitDraftMap = {};

  const rawPreset = getParam('preset')?.trim() ?? null;
  let activePresetId: string | null = null;
  if (rawPreset) {
    const matchedPublicPreset = catalog.publicPresets.find((p) => p.id === rawPreset);
    if (matchedPublicPreset && UUID_REGEX.test(rawPreset)) {
      activePresetId = matchedPublicPreset.id;
      for (const slotItem of matchedPublicPreset.slots) {
        const match = findGarmentByVariantId(catalog, slotItem.variantId);
        if (match && match.garment.compatibility.slot === slotItem.slot) {
          const validPreset =
            slotItem.presetId &&
            match.garment.customizationPresets.some(
              (p) => p.id === slotItem.presetId && p.isActive,
            )
              ? slotItem.presetId
              : null;
          slots[slotItem.slot] = {
            slot: slotItem.slot,
            variantId: match.variant.id,
            presetId: validPreset,
          };
        }
      }
    } else {
      discardedCount += 1;
    }
  }

  for (const slot of OUTFIT_STUDIO_RIG_CONTRACT.SLOTS) {
    const rawValue = getParam(slot);
    if (!rawValue) continue;

    const trimmed = rawValue.trim();
    if (!trimmed) {
      discardedCount += 1;
      continue;
    }

    const segments = trimmed.split(':');
    if (segments.length > 2) {
      discardedCount += 1;
      continue;
    }

    const variantId = segments[0]?.trim() ?? '';
    const presetSegment = segments[1]?.trim() ?? '';

    if (!UUID_REGEX.test(variantId)) {
      discardedCount += 1;
      continue;
    }

    if (presetSegment && !UUID_REGEX.test(presetSegment)) {
      discardedCount += 1;
      continue;
    }

    const match = findGarmentByVariantId(catalog, variantId);
    if (!match || match.garment.compatibility.slot !== slot) {
      discardedCount += 1;
      continue;
    }

    let validPresetId: string | null = null;
    if (presetSegment) {
      const presetExists = match.garment.customizationPresets.some(
        (p) => p.id === presetSegment && p.isActive,
      );
      if (!presetExists) {
        discardedCount += 1;
        continue;
      }
      validPresetId = presetSegment;
    }

    slots[slot] = {
      slot,
      variantId: match.variant.id,
      presetId: validPresetId,
    };
  }

  return {
    slots,
    presetId: activePresetId,
    discardedCount,
  };
}

export function serializeOutfitDraftSearchParams(
  slots: OutfitDraftMap,
  activePresetId?: string | null,
): string {
  const search = new URLSearchParams();
  if (activePresetId && UUID_REGEX.test(activePresetId)) {
    search.set('preset', activePresetId);
  }
  for (const slot of OUTFIT_STUDIO_RIG_CONTRACT.SLOTS) {
    const entry = slots[slot];
    if (!entry) continue;
    search.set(slot, entry.presetId ? `${entry.variantId}:${entry.presetId}` : entry.variantId);
  }
  return search.toString();
}

export function buildOutfitStudioHrefFromScene(scene: OutfitSceneDto): string {
  const search = new URLSearchParams();
  for (const item of scene.slots) {
    if (item.stale) continue;
    if (!UUID_REGEX.test(item.variantId)) continue;
    const value =
      item.presetId && UUID_REGEX.test(item.presetId)
        ? `${item.variantId}:${item.presetId}`
        : item.variantId;
    search.set(item.slot, value);
  }
  const qs = search.toString();
  return qs ? `/outfit-studio?${qs}` : '/outfit-studio';
}

export interface ClientConflictResolution {
  readonly conflictingSlot: OutfitSlotInput;
  readonly conflictingProductName: string;
  readonly message: string;
}

export function findConflictForCandidate(
  draftSlots: OutfitDraftMap,
  candidateGarment: OutfitStudioGarmentDto,
  catalog: OutfitStudioCatalogDto,
): ClientConflictResolution | null {
  const candidateSlot = candidateGarment.compatibility.slot;

  for (const existingSlot of OUTFIT_STUDIO_RIG_CONTRACT.SLOTS) {
    if (existingSlot === candidateSlot) continue;
    const existingSelection = draftSlots[existingSlot];
    if (!existingSelection) continue;

    const existingMatch = findGarmentByVariantId(catalog, existingSelection.variantId);
    if (!existingMatch) continue;

    const candidateBlocksExisting =
      candidateGarment.compatibility.incompatibleSlots.includes(existingSlot);
    const existingBlocksCandidate =
      existingMatch.garment.compatibility.incompatibleSlots.includes(candidateSlot);

    if (candidateBlocksExisting || existingBlocksCandidate) {
      const involvesOversizedShirt =
        candidateGarment.productSlug.includes('oversized') ||
        existingMatch.garment.productSlug.includes('oversized') ||
        candidateSlot === 'top' ||
        existingSlot === 'top';

      return {
        conflictingSlot: existingSlot,
        conflictingProductName: existingMatch.garment.productName,
        message: formatOutfitCompatibilityError({
          reason: 'LAYER_CONFLICT',
          slot: candidateSlot,
          conflictingSlot: existingSlot,
          garmentName: involvesOversizedShirt
            ? 'Kemeja oversized'
            : candidateGarment.productName,
        }),
      };
    }
  }

  return null;
}

export function evaluateClientOutfitSelection(
  catalog: OutfitStudioCatalogDto,
  draftSlots: OutfitDraftMap,
): {
  valid: boolean;
  violations: OutfitCompatibilityViolationDto[];
} {
  const violations: OutfitCompatibilityViolationDto[] = [];

  if (catalog.rig.rigId !== OUTFIT_STUDIO_RIG_CONTRACT.RIG_ID) {
    violations.push({
      slot: 'rig',
      productId: null,
      reason: 'RIG_MISMATCH',
      message: formatOutfitCompatibilityError({ reason: 'RIG_MISMATCH', slot: 'rig' }),
    });
  }

  const activeEntries: Array<{
    slot: OutfitSlotInput;
    garment: OutfitStudioGarmentDto;
    variant: OutfitStudioGarmentVariantDto;
  }> = [];

  for (const slot of OUTFIT_STUDIO_RIG_CONTRACT.SLOTS) {
    const selection = draftSlots[slot];
    if (!selection) continue;

    const match = findGarmentByVariantId(catalog, selection.variantId);
    if (!match) {
      violations.push({
        slot,
        productId: null,
        reason: 'GARMENT_UNAVAILABLE',
        message: formatOutfitCompatibilityError({ reason: 'GARMENT_UNAVAILABLE', slot }),
      });
      continue;
    }

    const { garment, variant } = match;
    if (garment.compatibility.rigId !== OUTFIT_STUDIO_RIG_CONTRACT.RIG_ID) {
      violations.push({
        slot,
        productId: garment.productId,
        reason: 'RIG_MISMATCH',
        message: formatOutfitCompatibilityError({
          reason: 'RIG_MISMATCH',
          slot,
          garmentName: garment.productName,
        }),
      });
      continue;
    }

    if (garment.compatibility.skeletonVersion !== OUTFIT_STUDIO_RIG_CONTRACT.SKELETON_VERSION) {
      violations.push({
        slot,
        productId: garment.productId,
        reason: 'SKELETON_VERSION_MISMATCH',
        message: formatOutfitCompatibilityError({
          reason: 'SKELETON_VERSION_MISMATCH',
          slot,
          garmentName: garment.productName,
        }),
      });
      continue;
    }

    if (garment.compatibility.slot !== slot) {
      violations.push({
        slot,
        productId: garment.productId,
        reason: 'SLOT_MISMATCH',
        message: formatOutfitCompatibilityError({
          reason: 'SLOT_MISMATCH',
          slot,
          garmentName: garment.productName,
        }),
      });
      continue;
    }

    const allowedAnchors = OUTFIT_STUDIO_RIG_CONTRACT.ANCHORS[slot] as readonly string[];
    if (!allowedAnchors.includes(garment.compatibility.anchor)) {
      violations.push({
        slot,
        productId: garment.productId,
        reason: 'ANCHOR_INVALID',
        message: formatOutfitCompatibilityError({
          reason: 'ANCHOR_INVALID',
          slot,
          garmentName: garment.productName,
        }),
      });
      continue;
    }

    activeEntries.push({ slot, garment, variant });
  }

  const emittedPairs = new Set<string>();
  for (let i = 0; i < activeEntries.length; i += 1) {
    const a = activeEntries[i]!;
    for (let j = i + 1; j < activeEntries.length; j += 1) {
      const b = activeEntries[j]!;
      const aBlocksB = a.garment.compatibility.incompatibleSlots.includes(b.slot);
      const bBlocksA = b.garment.compatibility.incompatibleSlots.includes(a.slot);
      if (aBlocksB || bBlocksA) {
        const pairKey = [a.slot, b.slot].sort().join('+');
        if (emittedPairs.has(pairKey)) continue;
        emittedPairs.add(pairKey);

        const blocker = aBlocksB ? a : b;
        const blocked = aBlocksB ? b : a;
        violations.push({
          slot: blocker.slot,
          productId: blocker.garment.productId,
          reason: 'LAYER_CONFLICT',
          message: formatOutfitCompatibilityError({
            reason: 'LAYER_CONFLICT',
            slot: blocker.slot,
            conflictingSlot: blocked.slot,
            garmentName: blocker.garment.productName,
          }),
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function computeDraftLiveTotalIdr(
  catalog: OutfitStudioCatalogDto,
  draftSlots: OutfitDraftMap,
): number {
  let total = 0;
  for (const slot of OUTFIT_STUDIO_RIG_CONTRACT.SLOTS) {
    const selection = draftSlots[slot];
    if (!selection) continue;
    const match = findGarmentByVariantId(catalog, selection.variantId);
    if (match) {
      total += match.variant.priceIdr;
    }
  }
  return total;
}

export function countDraftSlots(draftSlots: OutfitDraftMap): number {
  let count = 0;
  for (const slot of OUTFIT_STUDIO_RIG_CONTRACT.SLOTS) {
    if (draftSlots[slot]) {
      count += 1;
    }
  }
  return count;
}

export function formatSlotConflictSummary(
  details: ReadonlyArray<{ field: string; issue: string }>,
  fallbackMessage: string,
  catalog?: OutfitStudioCatalogDto | null,
): string {
  if (details.length === 0) {
    return fallbackMessage;
  }
  const first = details[0]!;
  const parsed = parseApiIssueToken(first.issue);
  const slotFromField = first.field.startsWith('slots.')
    ? (first.field.slice('slots.'.length) as OutfitSlotInput)
    : undefined;
  const matchedGarment =
    parsed.productId && catalog
      ? catalog.garments.find((g) => g.productId === parsed.productId)
      : undefined;

  return formatOutfitCompatibilityError({
    reason: parsed.reason,
    slot: slotFromField,
    garmentName: matchedGarment?.productName ?? null,
    fallbackMessage: parsed.message || fallbackMessage,
  });
}
