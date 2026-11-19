import { OUTFIT_SLOTS, OUTFIT_STUDIO_POLICY } from '@arven/config';
import type {
  OutfitCompatibilityConfigDto,
  OutfitCompatibilityViolationDto,
} from '@arven/contracts';
import type { OutfitAnchorInput, OutfitSlotInput } from '@arven/validators';

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

function isOutfitSlot(value: unknown): value is OutfitSlotInput {
  return typeof value === 'string' && (OUTFIT_SLOTS as readonly string[]).includes(value);
}

/**
 * Extracts `config.outfitCompatibility` from `Product3DAsset.config` without silently
 * discarding invalid `skeletonVersion` or `anchor` values so compatibility evaluation
 * reports exact reason codes (`SKELETON_VERSION_MISMATCH`, `ANCHOR_INVALID`).
 */
export function parseOutfitCompatibilityConfig(
  rawConfig: unknown,
): OutfitCompatibilityConfigDto | null {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return null;
  }
  const compat = (rawConfig as Record<string, unknown>)['outfitCompatibility'];
  if (!compat || typeof compat !== 'object' || Array.isArray(compat)) {
    return null;
  }
  const rec = compat as Record<string, unknown>;
  if (
    typeof rec['rigId'] !== 'string' ||
    rec['rigId'].trim().length === 0 ||
    typeof rec['skeletonVersion'] !== 'string' ||
    rec['skeletonVersion'].trim().length === 0 ||
    !isOutfitSlot(rec['slot']) ||
    typeof rec['anchor'] !== 'string' ||
    rec['anchor'].trim().length === 0
  ) {
    return null;
  }

  const rawIncompatible = Array.isArray(rec['incompatibleSlots'])
    ? rec['incompatibleSlots']
    : [];
  const incompatibleSlots = rawIncompatible.filter(isOutfitSlot);

  return {
    rigId: rec['rigId'].trim(),
    skeletonVersion: rec['skeletonVersion'].trim(),
    slot: rec['slot'],
    anchor: rec['anchor'].trim() as OutfitAnchorInput,
    incompatibleSlots,
  };
}

/**
 * Validates a single asset's compatibility descriptor against the pinned rig policy.
 */
export function evaluateAssetCompatibilityDiagnostic(
  compat: OutfitCompatibilityConfigDto | null,
): { readonly compatible: boolean; readonly diagnosticMessage: string | null } {
  if (!compat) {
    return {
      compatible: false,
      diagnosticMessage: 'No outfitCompatibility configuration set on active asset.',
    };
  }
  if (compat.rigId !== OUTFIT_STUDIO_POLICY.RIG_ID) {
    return {
      compatible: false,
      diagnosticMessage: `Rig "${compat.rigId}" does not match active rig "${OUTFIT_STUDIO_POLICY.RIG_ID}".`,
    };
  }
  if (compat.skeletonVersion !== OUTFIT_STUDIO_POLICY.SKELETON_VERSION) {
    return {
      compatible: false,
      diagnosticMessage: `Skeleton version "${compat.skeletonVersion}" does not match active version "${OUTFIT_STUDIO_POLICY.SKELETON_VERSION}".`,
    };
  }
  const allowedAnchors: readonly string[] = OUTFIT_STUDIO_POLICY.ANCHORS[compat.slot];
  if (!allowedAnchors.includes(compat.anchor)) {
    return {
      compatible: false,
      diagnosticMessage: `Anchor "${compat.anchor}" is invalid for slot "${compat.slot}".`,
    };
  }
  return { compatible: true, diagnosticMessage: null };
}

/**
 * Pure Outfit Studio compatibility evaluator enforcing rig, skeletonVersion, slot,
 * anchor, product/variant/preset binding, and symmetric layer conflicts.
 */
export function evaluateOutfitCompatibility(
  input: OutfitCompatibilityEvaluationInput,
): OutfitCompatibilityEvaluationResult {
  const expectedRigId = input.expectedRigId ?? OUTFIT_STUDIO_POLICY.RIG_ID;
  const expectedSkeletonVersion =
    input.expectedSkeletonVersion ?? OUTFIT_STUDIO_POLICY.SKELETON_VERSION;
  const violations: OutfitCompatibilityViolationDto[] = [];

  if (input.rigId !== expectedRigId) {
    violations.push({
      slot: 'rig',
      productId: null,
      reason: 'RIG_MISMATCH',
      message: `Mannequin rig "${input.rigId}" does not match active rig "${expectedRigId}".`,
    });
  }

  if (input.items.length === 0) {
    violations.push({
      slot: 'rig',
      productId: null,
      reason: 'SLOT_MISMATCH',
      message: 'At least one outfit slot selection is required.',
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
        message: `Slot "${item.requestedSlot}" cannot contain more than one garment.`,
      });
      continue;
    }
    seenSlots.add(item.requestedSlot);

    if (item.variantMatchesProduct === false) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'VARIANT_PRODUCT_MISMATCH',
        message: `Selected variant does not exist, is inactive, or does not belong to slot "${item.requestedSlot}" product.`,
      });
      continue;
    }

    if (item.available === false) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'GARMENT_UNAVAILABLE',
        message: `Garment for slot "${item.requestedSlot}" is unpublished, unavailable, or lacks an active READY 3D asset.`,
      });
      continue;
    }

    if (item.presetId && item.presetMatchesAsset === false) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'PRESET_ASSET_MISMATCH',
        message: `Customization preset does not belong to the active 3D asset for slot "${item.requestedSlot}".`,
      });
      continue;
    }

    const compat = item.compatibility;
    if (!compat) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'GARMENT_UNAVAILABLE',
        message: `Active 3D asset for slot "${item.requestedSlot}" has no Outfit Studio compatibility config.`,
      });
      continue;
    }

    if (compat.rigId !== input.rigId || compat.rigId !== expectedRigId) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'RIG_MISMATCH',
        message: `Garment asset rig "${compat.rigId}" is incompatible with "${expectedRigId}".`,
      });
      continue;
    }

    if (compat.skeletonVersion !== expectedSkeletonVersion) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'SKELETON_VERSION_MISMATCH',
        message: `Garment skeleton version "${compat.skeletonVersion}" does not match active rig version "${expectedSkeletonVersion}".`,
      });
      continue;
    }

    if (compat.slot !== item.requestedSlot) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'SLOT_MISMATCH',
        message: `Garment declared for slot "${compat.slot}" cannot be assigned to slot "${item.requestedSlot}".`,
      });
      continue;
    }

    const allowedAnchors: readonly string[] = OUTFIT_STUDIO_POLICY.ANCHORS[compat.slot];
    if (!allowedAnchors.includes(compat.anchor)) {
      violations.push({
        slot: item.requestedSlot,
        productId,
        reason: 'ANCHOR_INVALID',
        message: `Anchor "${compat.anchor}" is not valid for slot "${compat.slot}".`,
      });
      continue;
    }

    validItemsForMatrix.push({ item, compat });
  }

  // Symmetric layer conflict check across all unordered pairs
  const emittedPairs = new Set<string>();
  for (let i = 0; i < validItemsForMatrix.length; i += 1) {
    const a = validItemsForMatrix[i]!;
    for (let j = i + 1; j < validItemsForMatrix.length; j += 1) {
      const b = validItemsForMatrix[j]!;
      const aBlocksB = a.compat.incompatibleSlots.includes(b.item.requestedSlot);
      const bBlocksA = b.compat.incompatibleSlots.includes(a.item.requestedSlot);
      if (!aBlocksB && !bBlocksA) {
        continue;
      }

      const pairKey = [a.item.requestedSlot, b.item.requestedSlot].sort().join('+');
      if (emittedPairs.has(pairKey)) {
        continue;
      }
      emittedPairs.add(pairKey);

      const blocker = aBlocksB ? a : b;
      const blocked = aBlocksB ? b : a;
      violations.push({
        slot: blocker.item.requestedSlot,
        productId: blocker.item.productId ?? null,
        reason: 'LAYER_CONFLICT',
        message: `Item in slot "${blocker.item.requestedSlot}" is incompatible with active "${blocked.item.requestedSlot}" garment.`,
      });
    }
  }

  return {
    valid: violations.length === 0,
    rigId: input.rigId,
    skeletonVersion: expectedSkeletonVersion,
    violations,
  };
}
