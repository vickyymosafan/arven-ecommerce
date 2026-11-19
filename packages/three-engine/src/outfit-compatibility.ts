import type {
  OutfitAnchorInput,
  OutfitCompatibilityConfigDto,
  OutfitCompatibilityViolationDto,
  OutfitSlotInput,
} from '@arven/contracts';

export const OUTFIT_STUDIO_RIG_ID = 'arven_mannequin_unisex_v1';
export const OUTFIT_STUDIO_SKELETON_VERSION = '1.0.0';

export const OUTFIT_SLOTS = [
  'top',
  'bottom',
  'outerwear',
  'footwear',
  'accessory',
] as const satisfies readonly OutfitSlotInput[];

export const OUTFIT_ANCHORS_BY_SLOT: Readonly<
  Record<OutfitSlotInput, readonly OutfitAnchorInput[]>
> = {
  top: ['spine_upper'],
  outerwear: ['spine_upper'],
  bottom: ['pelvis'],
  footwear: ['feet'],
  accessory: ['shoulder_left', 'shoulder_right', 'wrist_left'],
} as const;

export interface OutfitCompatibilityCandidateInput {
  readonly requestedSlot: OutfitSlotInput;
  readonly productId?: string | null;
  readonly variantId?: string | null;
  readonly assetId?: string | null;
  readonly presetId?: string | null;
  readonly available?: boolean;
  readonly variantMatchesProduct?: boolean;
  readonly presetMatchesAsset?: boolean;
  readonly compatibility: OutfitCompatibilityConfigDto | null | undefined;
}

export interface OutfitCompatibilityEvaluationInput {
  readonly rigId: string;
  readonly expectedRigId?: string;
  readonly expectedSkeletonVersion?: string;
  readonly items: ReadonlyArray<OutfitCompatibilityCandidateInput>;
}

export interface OutfitCompatibilityEvaluationResult {
  readonly valid: boolean;
  readonly rigId: string;
  readonly skeletonVersion: string;
  readonly violations: OutfitCompatibilityViolationDto[];
}

/**
 * Pure Outfit Studio compatibility policy shared across client preview and unit verification.
 * Enforces rig identity, skeleton version, slot/anchor binding, availability, and symmetric
 * `incompatibleSlots` layer conflict rules.
 */
export function evaluateOutfitCompatibility(
  input: OutfitCompatibilityEvaluationInput,
): OutfitCompatibilityEvaluationResult {
  const expectedRigId = input.expectedRigId ?? OUTFIT_STUDIO_RIG_ID;
  const expectedSkeletonVersion =
    input.expectedSkeletonVersion ?? OUTFIT_STUDIO_SKELETON_VERSION;
  const violations: OutfitCompatibilityViolationDto[] = [];

  if (input.rigId !== expectedRigId) {
    violations.push({
      slot: 'rig',
      productId: null,
      reason: 'RIG_MISMATCH',
      message: `Mannequin rig "${input.rigId}" tidak sesuai dengan kontrak aktif "${expectedRigId}".`,
    });
  }

  if (input.items.length === 0) {
    violations.push({
      slot: 'rig',
      productId: null,
      reason: 'SLOT_MISMATCH',
      message: 'Minimal satu slot pakaian harus dipilih.',
    });
    return {
      valid: false,
      rigId: input.rigId,
      skeletonVersion: expectedSkeletonVersion,
      violations,
    };
  }

  const seenSlots = new Set<OutfitSlotInput>();
  const validItemsForMatrix: Array<{
    readonly item: OutfitCompatibilityCandidateInput;
    readonly compat: OutfitCompatibilityConfigDto;
  }> = [];

  for (const item of input.items) {
    const productId = item.productId ?? null;

    if (seenSlots.has(item.requestedSlot)) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'DUPLICATE_SLOT',
        message: `Slot "${item.requestedSlot}" hanya dapat diisi oleh satu item.`,
      });
      continue;
    }
    seenSlots.add(item.requestedSlot);

    if (item.available === false) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'GARMENT_UNAVAILABLE',
        message: `Produk pada slot "${item.requestedSlot}" tidak tersedia atau belum siap 3D.`,
      });
      continue;
    }

    if (item.variantMatchesProduct === false) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'VARIANT_PRODUCT_MISMATCH',
        message: `Varian yang dipilih tidak cocok dengan produk pada slot "${item.requestedSlot}".`,
      });
      continue;
    }

    if (item.presetId && item.presetMatchesAsset === false) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'PRESET_ASSET_MISMATCH',
        message: `Preset warna tidak cocok dengan aset 3D pada slot "${item.requestedSlot}".`,
      });
      continue;
    }

    const compat = item.compatibility;
    if (!compat) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'GARMENT_UNAVAILABLE',
        message: `Aset 3D pada slot "${item.requestedSlot}" belum memiliki konfigurasi Outfit Studio.`,
      });
      continue;
    }

    if (compat.rigId !== input.rigId || compat.rigId !== expectedRigId) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'RIG_MISMATCH',
        message: `Aset pada slot "${item.requestedSlot}" tidak kompatibel dengan manekin standar ${expectedRigId}.`,
      });
      continue;
    }

    if (compat.skeletonVersion !== expectedSkeletonVersion) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'SKELETON_VERSION_MISMATCH',
        message: `Versi kerangka manekin (${compat.skeletonVersion}) tidak cocok dengan versi aktif ${expectedSkeletonVersion}.`,
      });
      continue;
    }

    if (compat.slot !== item.requestedSlot) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'SLOT_MISMATCH',
        message: `Aset untuk slot "${compat.slot}" tidak dapat dipasang ke slot "${item.requestedSlot}".`,
      });
      continue;
    }

    const allowedAnchors = OUTFIT_ANCHORS_BY_SLOT[compat.slot];
    if (!allowedAnchors.includes(compat.anchor)) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'ANCHOR_INVALID',
        message: `Anchor "${compat.anchor}" tidak valid untuk slot "${compat.slot}".`,
      });
      continue;
    }

    validItemsForMatrix.push({ item, compat });
  }

  // Symmetric layer conflict check across every unordered pair
  const emittedPairs = new Set<string>();
  for (let i = 0; i < validItemsForMatrix.length; i += 1) {
    const a = validItemsForMatrix[i]!;
    for (let j = i + 1; j < validItemsForMatrix.length; j += 1) {
      const b = validItemsForMatrix[j]!;
      const aBlocksB = a.compat.incompatibleSlots.includes(b.item.requestedSlot);
      const bBlocksA = b.compat.incompatibleSlots.includes(a.item.requestedSlot);
      if (aBlocksB || bBlocksA) {
        const pairKey = [a.item.requestedSlot, b.item.requestedSlot].sort().join('+');
        if (emittedPairs.has(pairKey)) continue;
        emittedPairs.add(pairKey);

        const blocker = aBlocksB ? a : b;
        const blocked = aBlocksB ? b : a;
        violations.push({
          slot: blocker.item.requestedSlot,
          productId: blocker.item.productId ?? null,
          reason: 'LAYER_CONFLICT',
          message: `Item pada slot "${blocker.item.requestedSlot}" tidak kompatibel dengan "${blocked.item.requestedSlot}" yang sedang aktif.`,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    rigId: input.rigId,
    skeletonVersion: expectedSkeletonVersion,
    violations,
  };
}
