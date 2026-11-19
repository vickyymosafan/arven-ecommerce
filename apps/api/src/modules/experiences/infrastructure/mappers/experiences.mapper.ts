import { HttpStatus } from '@nestjs/common';
import { OUTFIT_STUDIO_POLICY } from '@arven/config';
import type {
  AdminOutfitGarmentDiagnosticDto,
  AdminShowroomHotspotDto,
  AdminShowroomZoneDto,
  CustomizationPresetDto,
  MaterialSlotSpecDto,
  OutfitRigContractDto,
  OutfitSceneDto,
  OutfitScenePersistedItemDto,
  OutfitSceneSlotHydratedDto,
  OutfitStudioGarmentDto,
  OutfitStudioGarmentVariantDto,
  ShowroomHotspotPublicDto,
  ShowroomZonePublicDto,
} from '@arven/contracts';
import type {
  AssetStatusInput,
  LightingPresetInput,
  MaterialOverrideEntryInput,
  OutfitSlotInput,
  ProductStatusInput,
  ShowroomCameraBaselineInput,
  ShowroomPortalInput,
} from '@arven/validators';
import { DomainHttpException } from '../../../../common/http/index.js';
import { ExperiencesDomainError } from '../../domain/errors/experiences-domain.error.js';
import {
  evaluateAssetCompatibilityDiagnostic,
  parseOutfitCompatibilityConfig,
} from '../../domain/policies/outfit-compatibility.policy.js';
import type {
  OutfitResolvedVariantLookup,
  OutfitSceneRecord,
  OutfitStudioAssetRecord,
  OutfitStudioPresetRecord,
  ShowroomHotspotRecord,
  ShowroomZoneRecord,
} from '../../domain/ports/experiences.ports.js';

export const DEFAULT_SHOWROOM_CAMERA_BASELINE: ShowroomCameraBaselineInput = {
  fovDeg: 45,
  position: [0, 2.2, 6.2],
  target: [0, 1.0, -1.2],
  minDistance: 1.2,
  maxDistance: 12,
};

export function toDomainHttpException(error: unknown): never {
  if (error instanceof ExperiencesDomainError) {
    throw new DomainHttpException(
      error.statusCode,
      error.code,
      error.message,
      error.details
        ? error.details.map((detail) => ({
            ...(detail.field !== undefined ? { field: detail.field } : {}),
            issue: detail.issue,
          }))
        : undefined,
    );
  }
  if (error instanceof DomainHttpException) {
    throw error;
  }
  throw new DomainHttpException(
    HttpStatus.INTERNAL_SERVER_ERROR,
    'INTERNAL_ERROR',
    'An unexpected experiences domain error occurred',
  );
}

export function normalizeCameraBaseline(raw: unknown): ShowroomCameraBaselineInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_SHOWROOM_CAMERA_BASELINE;
  }
  const rec = raw as Record<string, unknown>;
  const isVec3 = (v: unknown): v is [number, number, number] =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n));

  return {
    fovDeg:
      typeof rec['fovDeg'] === 'number' && Number.isFinite(rec['fovDeg'])
        ? rec['fovDeg']
        : DEFAULT_SHOWROOM_CAMERA_BASELINE.fovDeg,
    position: isVec3(rec['position'])
      ? rec['position']
      : DEFAULT_SHOWROOM_CAMERA_BASELINE.position,
    target: isVec3(rec['target'])
      ? rec['target']
      : DEFAULT_SHOWROOM_CAMERA_BASELINE.target,
    minDistance:
      typeof rec['minDistance'] === 'number' && Number.isFinite(rec['minDistance'])
        ? rec['minDistance']
        : DEFAULT_SHOWROOM_CAMERA_BASELINE.minDistance,
    maxDistance:
      typeof rec['maxDistance'] === 'number' && Number.isFinite(rec['maxDistance'])
        ? rec['maxDistance']
        : DEFAULT_SHOWROOM_CAMERA_BASELINE.maxDistance,
  };
}

export function normalizePortals(raw: unknown): ShowroomPortalInput[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const portals: ShowroomPortalInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const rec = item as Record<string, unknown>;
    if (
      typeof rec['targetZoneCode'] === 'string' &&
      typeof rec['label'] === 'string' &&
      Array.isArray(rec['position']) &&
      rec['position'].length === 3 &&
      rec['position'].every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      portals.push({
        targetZoneCode: rec['targetZoneCode'],
        label: rec['label'],
        position: rec['position'] as [number, number, number],
      });
    }
  }
  return portals;
}

export function normalizeZoneConfig(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { lightingPreset: 'arven_studio_neutral_v1', bakedLighting: true };
  }
  return { ...(raw as Record<string, unknown>) };
}

export function extractLightingPreset(config: Record<string, unknown>): LightingPresetInput {
  return config['lightingPreset'] === 'arven_warm_editorial_v1'
    ? 'arven_warm_editorial_v1'
    : 'arven_studio_neutral_v1';
}

export function mapPublicShowroomZoneDto(zone: ShowroomZoneRecord): ShowroomZonePublicDto {
  const config = normalizeZoneConfig(zone.config);
  const lightingPreset = extractLightingPreset(config);

  const hotspots: ShowroomHotspotPublicDto[] = [];
  for (const hotspot of zone.hotspots) {
    if (!hotspot.isActive) {
      continue;
    }
    const product = hotspot.product;
    if (
      product.deletedAt !== null ||
      product.status !== 'PUBLISHED' ||
      !product.isVisible
    ) {
      continue;
    }

    const activeVariants = product.variants.filter(
      (v) => v.isActive && v.deletedAt === null,
    );
    const fromPriceIdr =
      activeVariants.length > 0
        ? Math.min(...activeVariants.map((v) => Number(v.priceIdr)))
        : 0;

    const primaryMedia =
      product.media.find((m) => m.isPrimary) ?? product.media[0] ?? null;

    hotspots.push({
      id: hotspot.id,
      zoneId: hotspot.zoneId,
      productId: hotspot.productId,
      productSlug: product.slug,
      productName: product.name,
      variantId: hotspot.variantId,
      label: hotspot.label,
      fromPriceIdr,
      primaryImageUrl: primaryMedia?.url ?? null,
      primaryImageAlt: primaryMedia?.altText ?? null,
      has3dEnabled: product.has3dEnabled,
      position: [hotspot.positionX, hotspot.positionY, hotspot.positionZ],
      sortOrder: hotspot.sortOrder,
    });
  }

  return {
    id: zone.id,
    code: zone.code,
    title: zone.title,
    description: zone.description,
    sortOrder: zone.sortOrder,
    sceneUrl: `/api/v1/showroom/zones/${zone.code}/scene`,
    liteSceneUrl: zone.liteSceneObjectKey
      ? `/api/v1/showroom/zones/${zone.code}/scene-lite`
      : null,
    posterUrl: `/api/v1/showroom/zones/${zone.code}/poster`,
    sceneBytes: Number(zone.sceneBytes),
    liteSceneBytes: zone.liteSceneBytes !== null ? Number(zone.liteSceneBytes) : null,
    cameraBaseline: normalizeCameraBaseline(zone.cameraBaseline),
    portals: normalizePortals(zone.portals),
    lightingPreset,
    hotspots,
  };
}

export function mapAdminHotspotDto(
  hotspot: ShowroomHotspotRecord,
): AdminShowroomHotspotDto {
  return {
    id: hotspot.id,
    zoneId: hotspot.zoneId,
    productId: hotspot.productId,
    productSlug: hotspot.product.slug,
    productName: hotspot.product.name,
    productStatus: hotspot.product.status as ProductStatusInput,
    variantId: hotspot.variantId,
    label: hotspot.label,
    positionX: hotspot.positionX,
    positionY: hotspot.positionY,
    positionZ: hotspot.positionZ,
    sortOrder: hotspot.sortOrder,
    isActive: hotspot.isActive,
    createdAt: hotspot.createdAt.toISOString(),
    updatedAt: hotspot.updatedAt.toISOString(),
  };
}

export function mapAdminZoneDto(zone: ShowroomZoneRecord): AdminShowroomZoneDto {
  return {
    id: zone.id,
    code: zone.code,
    title: zone.title,
    description: zone.description,
    status: zone.status,
    sortOrder: zone.sortOrder,
    sceneObjectKey: zone.sceneObjectKey,
    liteSceneObjectKey: zone.liteSceneObjectKey,
    posterKey: zone.posterKey,
    sceneUrl: `/api/v1/showroom/zones/${zone.code}/scene`,
    liteSceneUrl: zone.liteSceneObjectKey
      ? `/api/v1/showroom/zones/${zone.code}/scene-lite`
      : null,
    posterUrl: `/api/v1/showroom/zones/${zone.code}/poster`,
    sceneBytes: Number(zone.sceneBytes),
    liteSceneBytes: zone.liteSceneBytes !== null ? Number(zone.liteSceneBytes) : null,
    cameraBaseline: normalizeCameraBaseline(zone.cameraBaseline),
    portals: normalizePortals(zone.portals),
    config: normalizeZoneConfig(zone.config),
    publishedAt: zone.publishedAt ? zone.publishedAt.toISOString() : null,
    createdBy: zone.createdBy,
    hotspots: zone.hotspots.map(mapAdminHotspotDto),
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString(),
  };
}

export function buildPinnedRigContractDto(): OutfitRigContractDto {
  return {
    rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
    skeletonVersion: OUTFIT_STUDIO_POLICY.SKELETON_VERSION,
    slots: OUTFIT_STUDIO_POLICY.SLOTS,
    anchors: OUTFIT_STUDIO_POLICY.ANCHORS,
    modelUrl: `/api/v1/outfit-studio/rigs/${OUTFIT_STUDIO_POLICY.RIG_ID}/model`,
    mobileModelUrl: `/api/v1/outfit-studio/rigs/${OUTFIT_STUDIO_POLICY.RIG_ID}/model-lite`,
    posterUrl: `/api/v1/outfit-studio/rigs/${OUTFIT_STUDIO_POLICY.RIG_ID}/poster`,
  };
}

export function mapOutfitPresetDto(
  row: OutfitStudioPresetRecord,
): CustomizationPresetDto {
  const materialOverrides =
    row.materialOverrides &&
    typeof row.materialOverrides === 'object' &&
    !Array.isArray(row.materialOverrides)
      ? (row.materialOverrides as Record<string, MaterialOverrideEntryInput>)
      : {};

  return {
    id: row.id,
    productId: row.productId,
    assetId: row.assetId,
    code: row.code,
    label: row.label,
    swatchHex: row.swatchHex,
    materialOverrides,
    variantId: row.variantId,
    variantSku: row.variant?.sku ?? null,
    variantColor: row.variant?.color ?? null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapOutfitStudioGarmentDto(
  asset: OutfitStudioAssetRecord,
): OutfitStudioGarmentDto | null {
  const product = asset.product;
  if (
    product.deletedAt !== null ||
    product.status !== 'PUBLISHED' ||
    !product.isVisible ||
    asset.status !== 'READY' ||
    !asset.isActiveVersion
  ) {
    return null;
  }

  const compat = parseOutfitCompatibilityConfig(asset.config);
  const diag = evaluateAssetCompatibilityDiagnostic(compat);
  if (!compat || !diag.compatible) {
    return null;
  }

  const activeVariants = product.variants.filter(
    (v) => v.deletedAt === null && v.isActive,
  );
  if (activeVariants.length === 0) {
    return null;
  }

  const variants: OutfitStudioGarmentVariantDto[] = activeVariants.map((v) => {
    const availableQty = Math.max(
      0,
      v.inventoryLevels.reduce(
        (sum, level) => sum + (level.quantityOnHand - level.quantityReserved),
        0,
      ),
    );
    return {
      id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      priceIdr: Number(v.priceIdr),
      compareAtPriceIdr:
        v.compareAtPriceIdr !== null ? Number(v.compareAtPriceIdr) : null,
      availableQty,
      inStock: availableQty > 0,
    };
  });

  const rawCfg =
    asset.config && typeof asset.config === 'object' && !Array.isArray(asset.config)
      ? (asset.config as Record<string, unknown>)
      : {};
  const materialSlots = Array.isArray(rawCfg['materialSlots'])
    ? (rawCfg['materialSlots'] as MaterialSlotSpecDto[])
    : [];

  return {
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
    material: product.material,
    fit: product.fit,
    assetId: asset.id,
    assetVersion: asset.version,
    modelUrl: `/api/v1/3d-assets/${asset.id}/model`,
    mobileModelUrl: asset.mobileObjectKey
      ? `/api/v1/3d-assets/${asset.id}/model-lite`
      : null,
    posterUrl: `/api/v1/3d-assets/${asset.id}/poster`,
    compatibility: compat,
    materialSlots,
    variants,
    customizationPresets: asset.customizationPresets
      .filter((p) => p.isActive)
      .map(mapOutfitPresetDto),
  };
}

export function mapAdminOutfitGarmentDiagnosticDto(
  asset: OutfitStudioAssetRecord,
): AdminOutfitGarmentDiagnosticDto {
  const compat = parseOutfitCompatibilityConfig(asset.config);
  const diag = evaluateAssetCompatibilityDiagnostic(compat);

  return {
    assetId: asset.id,
    productId: asset.product.id,
    productSlug: asset.product.slug,
    productName: asset.product.name,
    productStatus: asset.product.status as ProductStatusInput,
    assetStatus: asset.status as AssetStatusInput,
    isActiveVersion: asset.isActiveVersion,
    version: asset.version,
    posterUrl: `/api/v1/3d-assets/${asset.id}/poster`,
    compatibility: compat,
    compatibleWithCurrentRig: diag.compatible,
    diagnosticMessage: diag.diagnosticMessage,
  };
}

export function sanitizePersistedOutfitItems(
  items: ReadonlyArray<OutfitScenePersistedItemDto>,
): OutfitScenePersistedItemDto[] {
  return items.map((item) => ({
    slot: item.slot,
    productId: item.productId,
    variantId: item.variantId,
    assetId: item.assetId,
    presetId: item.presetId ?? null,
  }));
}

export function parsePersistedOutfitItems(
  rawItems: unknown,
): OutfitScenePersistedItemDto[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  const items: OutfitScenePersistedItemDto[] = [];
  for (const entry of rawItems) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const rec = entry as Record<string, unknown>;
    if (
      typeof rec['slot'] === 'string' &&
      typeof rec['productId'] === 'string' &&
      typeof rec['variantId'] === 'string' &&
      typeof rec['assetId'] === 'string'
    ) {
      items.push({
        slot: rec['slot'] as OutfitSlotInput,
        productId: rec['productId'],
        variantId: rec['variantId'],
        assetId: rec['assetId'],
        presetId: typeof rec['presetId'] === 'string' ? rec['presetId'] : null,
      });
    }
  }
  return items;
}

export function hydrateOutfitSceneDto(params: {
  readonly scene: OutfitSceneRecord;
  readonly variantsById: ReadonlyMap<string, OutfitResolvedVariantLookup>;
  readonly presetsById: ReadonlyMap<
    string,
    {
      readonly id: string;
      readonly assetId: string;
      readonly productId: string;
      readonly code: string;
      readonly label: string;
      readonly swatchHex: string;
      readonly isActive: boolean;
    }
  >;
}): OutfitSceneDto {
  const persistedItems = parsePersistedOutfitItems(params.scene.items);
  const slots: OutfitSceneSlotHydratedDto[] = [];
  let liveTotalIdr = 0;
  let hasStaleItems = false;

  for (const item of persistedItems) {
    const staleReasons: string[] = [];
    const variant = params.variantsById.get(item.variantId);
    const preset = item.presetId ? params.presetsById.get(item.presetId) : undefined;

    if (!variant || variant.deletedAt !== null) {
      staleReasons.push('VARIANT_REMOVED');
    } else {
      if (!variant.isActive) {
        staleReasons.push('VARIANT_INACTIVE');
      }
      if (variant.productId !== item.productId) {
        staleReasons.push('VARIANT_PRODUCT_MISMATCH');
      }
      if (
        variant.product.deletedAt !== null ||
        variant.product.status !== 'PUBLISHED' ||
        !variant.product.isVisible
      ) {
        staleReasons.push('PRODUCT_UNAVAILABLE');
      }

      const activeAsset = variant.product.assets3d.find(
        (a) => a.status === 'READY' && a.isActiveVersion,
      );
      if (!activeAsset) {
        staleReasons.push('ASSET_UNAVAILABLE');
      } else {
        if (activeAsset.id !== item.assetId) {
          staleReasons.push('ASSET_VERSION_CHANGED');
        }
        const compat = parseOutfitCompatibilityConfig(activeAsset.config);
        const diag = evaluateAssetCompatibilityDiagnostic(compat);
        if (!compat || !diag.compatible || compat.slot !== item.slot) {
          staleReasons.push('COMPATIBILITY_CHANGED');
        }
      }
    }

    if (item.presetId) {
      if (
        !preset ||
        !preset.isActive ||
        preset.assetId !== item.assetId ||
        preset.productId !== item.productId
      ) {
        staleReasons.push('PRESET_UNAVAILABLE');
      }
    }

    const stale = staleReasons.length > 0;
    if (stale) {
      hasStaleItems = true;
    }

    const availableQty = variant
      ? Math.max(
          0,
          variant.inventoryLevels.reduce(
            (sum, level) => sum + (level.quantityOnHand - level.quantityReserved),
            0,
          ),
        )
      : 0;
    const unitPriceIdr = variant ? Number(variant.priceIdr) : 0;

    if (!stale) {
      liveTotalIdr += unitPriceIdr;
    }

    slots.push({
      slot: item.slot,
      productId: item.productId,
      productSlug: variant?.product.slug ?? null,
      productName: variant?.product.name ?? 'Unavailable Garment',
      variantId: item.variantId,
      sku: variant?.sku ?? null,
      size: variant?.size ?? null,
      color: variant?.color ?? null,
      assetId: item.assetId,
      presetId: item.presetId,
      presetCode: preset?.code ?? null,
      presetLabel: preset?.label ?? null,
      swatchHex: preset?.swatchHex ?? null,
      unitPriceIdr,
      availableQty,
      inStock: !stale && availableQty > 0,
      posterUrl: `/api/v1/3d-assets/${item.assetId}/poster`,
      stale,
      staleReasons,
    });
  }

  return {
    id: params.scene.id,
    title: params.scene.title,
    rigId: params.scene.mannequinRigVersion,
    skeletonVersion: OUTFIT_STUDIO_POLICY.SKELETON_VERSION,
    isPublicPreset: params.scene.isPublicPreset,
    slots,
    liveTotalIdr,
    hasStaleItems,
    createdAt: params.scene.createdAt.toISOString(),
    updatedAt: params.scene.updatedAt.toISOString(),
  };
}
