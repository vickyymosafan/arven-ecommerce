import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { RuntimeConfig } from '@arven/config';
import type {
  AdminProduct3DAssetDto,
  AssetFormatInput,
  AssetProvenanceDto,
  AssetStatusInput,
  AssetValidationRunDto,
  AssetValidationStatusInput,
  CustomizationPresetDto,
  MaterialSlotSpecDto,
  Presign3DAssetResponseDto,
  Product3DAssetConfigDto,
  Product3DAssetMetadataDto,
  Product3DAssetPublicDto,
  Telemetry3DReceiptDto,
} from '@arven/contracts';
import {
  AssetFormat,
  AssetStatus,
  AssetValidationStatus,
  ProductStatus,
  type Prisma,
} from '@arven/database';
import { createLogger, type ArvenLogger } from '@arven/observability';
import {
  DEFAULT_ARVEN_MATERIAL_SLOTS,
  DEFAULT_ARVEN_PROVENANCE,
  buildArvenGarmentGlbBuffer,
  buildDefaultAssetConfig,
  buildStudioPosterSvg,
  inferSilhouetteFromSlug,
  inspectAndValidateGlbBuffer,
} from '@arven/three-engine/glb';
import type {
  Confirm3DAssetRequest,
  CreateCustomizationPresetRequest,
  MaterialOverrideEntryInput,
  Presign3DAssetRequest,
  Publish3DAssetRequest,
  Record3DTelemetryRequest,
  UpdateCustomizationPresetRequest,
  UploadStaging3DAssetRequest,
} from '@arven/validators';
import type { Redis } from 'ioredis';
import { DomainHttpException } from '../../common/http/index.js';
import type { AuthenticatedActor } from '../../common/security/index.js';
import {
  STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from '../../shared/adapters/storage.provider.js';
import { RUNTIME_CONFIG } from '../../shared/config/config.module.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../shared/redis/redis.module.js';
import { AuditLogService } from '../audit-notifications/audit-log.service.js';

const VALIDATOR_VERSION = 'arven-glb-validator-1.0.0';
const MAX_STAGING_UPLOAD_BYTES = 15_728_640;
export const TELEMETRY_3D_REDIS_KEY = 'arven:telemetry:3d:counts';

const ASSET_WITH_RELATIONS_INCLUDE = {
  product: {
    select: {
      id: true,
      slug: true,
      name: true,
      material: true,
      fit: true,
      status: true,
      isVisible: true,
      has3dEnabled: true,
      deletedAt: true,
    },
  },
  validationRuns: {
    orderBy: [{ createdAt: 'desc' as const }],
    take: 10,
  },
  customizationPresets: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      variant: {
        select: {
          id: true,
          sku: true,
          color: true,
        },
      },
    },
  },
} satisfies Prisma.Product3DAssetInclude;

type LoadedAsset3D = Prisma.Product3DAssetGetPayload<{
  include: typeof ASSET_WITH_RELATIONS_INCLUDE;
}>;

function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    val,
  );
}

function normalizeAssetConfig(
  raw: unknown,
  productSlug: string,
): Product3DAssetConfigDto {
  const silhouette = inferSilhouetteFromSlug(productSlug);
  const fallback = buildDefaultAssetConfig({
    silhouette,
    defaultProfile: { triangles: 0, vertices: 0, bytes: 0 },
  });

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }

  const rec = raw as Record<string, unknown>;
  const materialSlots = Array.isArray(rec['materialSlots'])
    ? (rec['materialSlots'] as MaterialSlotSpecDto[])
    : fallback.materialSlots;
  const lightingPreset =
    rec['lightingPreset'] === 'arven_warm_editorial_v1'
      ? 'arven_warm_editorial_v1'
      : 'arven_studio_neutral_v1';
  const coordinateSystem =
    rec['coordinateSystem'] && typeof rec['coordinateSystem'] === 'object'
      ? (rec['coordinateSystem'] as Product3DAssetConfigDto['coordinateSystem'])
      : fallback.coordinateSystem;
  const qualityProfiles =
    rec['qualityProfiles'] && typeof rec['qualityProfiles'] === 'object'
      ? (rec['qualityProfiles'] as Product3DAssetConfigDto['qualityProfiles'])
      : fallback.qualityProfiles;
  const provenance =
    rec['provenance'] && typeof rec['provenance'] === 'object'
      ? (rec['provenance'] as AssetProvenanceDto)
      : fallback.provenance;

  return {
    schemaVersion:
      typeof rec['schemaVersion'] === 'string' ? rec['schemaVersion'] : '1.0',
    coordinateSystem,
    silhouette,
    lightingPreset,
    materialSlots,
    qualityProfiles,
    provenance,
  };
}

function mapPresetDto(
  row: LoadedAsset3D['customizationPresets'][number],
): CustomizationPresetDto {
  const overrides =
    row.materialOverrides && typeof row.materialOverrides === 'object'
      ? (row.materialOverrides as Record<string, MaterialOverrideEntryInput>)
      : {};
  return {
    id: row.id,
    productId: row.productId,
    assetId: row.assetId,
    code: row.code,
    label: row.label,
    swatchHex: row.swatchHex,
    materialOverrides: overrides,
    variantId: row.variantId,
    variantSku: row.variant?.sku ?? null,
    variantColor: row.variant?.color ?? null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapValidationRunDto(
  run: LoadedAsset3D['validationRuns'][number],
): AssetValidationRunDto {
  return {
    id: run.id,
    assetId: run.assetId,
    status: run.status as AssetValidationStatusInput,
    validatorVersion: run.validatorVersion,
    report:
      run.report && typeof run.report === 'object' && !Array.isArray(run.report)
        ? (run.report as Record<string, unknown>)
        : {},
    errorSummary: run.errorSummary,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    createdAt: run.createdAt.toISOString(),
  };
}

function mapAdminAssetDto(asset: LoadedAsset3D): AdminProduct3DAssetDto {
  const config = normalizeAssetConfig(asset.config, asset.product.slug);
  const isReady = asset.status === AssetStatus.READY;
  return {
    id: asset.id,
    productId: asset.productId,
    variantId: asset.variantId,
    version: asset.version,
    format: asset.format as AssetFormatInput,
    objectKey: asset.objectKey,
    mobileObjectKey: asset.mobileObjectKey,
    posterKey: asset.posterKey,
    bytes: Number(asset.bytes),
    status: asset.status as AssetStatusInput,
    isActiveVersion: asset.isActiveVersion,
    config,
    modelUrl: isReady ? `/api/v1/3d-assets/${asset.id}/model` : null,
    mobileModelUrl:
      isReady && asset.mobileObjectKey
        ? `/api/v1/3d-assets/${asset.id}/model-lite`
        : null,
    posterUrl: `/api/v1/3d-assets/${asset.id}/poster`,
    previewModelUrl: `/api/v1/admin/3d-assets/${asset.id}/preview-model`,
    validationRuns: asset.validationRuns.map(mapValidationRunDto),
    customizationPresets: asset.customizationPresets.map(mapPresetDto),
    publishedAt: asset.publishedAt ? asset.publishedAt.toISOString() : null,
    createdBy: asset.createdBy,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function validateOverridesAgainstSlots(
  materialOverrides: Readonly<Record<string, MaterialOverrideEntryInput>>,
  slots: ReadonlyArray<MaterialSlotSpecDto>,
): void {
  const slotMap = new Map<string, MaterialSlotSpecDto>();
  for (const slot of slots) {
    slotMap.set(slot.slotId, slot);
  }

  for (const [slotId, override] of Object.entries(materialOverrides)) {
    const slot = slotMap.get(slotId);
    if (!slot) {
      throw new DomainHttpException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_ERROR',
        `Material override references unknown slot "${slotId}" not declared on the 3D asset`,
      );
    }
    if (!slot.customizable) {
      throw new DomainHttpException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_ERROR',
        `Material slot "${slotId}" is marked non-customizable on this 3D asset`,
      );
    }
    if (
      override.roughness !== undefined &&
      (override.roughness < slot.roughnessRange[0] ||
        override.roughness > slot.roughnessRange[1])
    ) {
      throw new DomainHttpException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_ERROR',
        `Roughness ${override.roughness} for slot "${slotId}" falls outside allowed range [${slot.roughnessRange[0]}, ${slot.roughnessRange[1]}]`,
      );
    }
    if (
      override.metalness !== undefined &&
      (override.metalness < slot.metalnessRange[0] ||
        override.metalness > slot.metalnessRange[1])
    ) {
      throw new DomainHttpException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_ERROR',
        `Metalness ${override.metalness} for slot "${slotId}" falls outside allowed range [${slot.metalnessRange[0]}, ${slot.metalnessRange[1]}]`,
      );
    }
  }
}

@Injectable()
export class Assets3DService {
  private readonly logger: ArvenLogger;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
    @Inject(STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(RUNTIME_CONFIG) config: RuntimeConfig,
  ) {
    this.logger = createLogger({
      service: '@arven/api:assets3d',
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
    });
  }

  // ===========================================================================
  // Public Catalog 3D Read & Anonymized Telemetry
  // ===========================================================================

  async getPublicProduct3DAssets(idOrSlug: string): Promise<Product3DAssetPublicDto> {
    const productWhere: Prisma.ProductWhereInput = isUuid(idOrSlug)
      ? { id: idOrSlug }
      : { slug: idOrSlug };

    const product = await this.prisma.client.product.findFirst({
      where: {
        ...productWhere,
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        deletedAt: null,
        has3dEnabled: true,
      },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!product) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        `Published 3D product "${idOrSlug}" was not found`,
      );
    }

    const activeAsset = await this.prisma.client.product3DAsset.findFirst({
      where: {
        productId: product.id,
        status: AssetStatus.READY,
        isActiveVersion: true,
      },
      include: {
        ...ASSET_WITH_RELATIONS_INCLUDE,
        customizationPresets: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            variant: {
              select: { id: true, sku: true, color: true },
            },
          },
        },
      },
    });

    if (!activeAsset) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        `No active READY 3D asset exists for "${product.slug}"`,
      );
    }

    const config = normalizeAssetConfig(activeAsset.config, product.slug);
    return {
      id: activeAsset.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      variantId: activeAsset.variantId,
      version: activeAsset.version,
      format: activeAsset.format as AssetFormatInput,
      bytes: Number(activeAsset.bytes),
      modelUrl: `/api/v1/3d-assets/${activeAsset.id}/model`,
      mobileModelUrl: activeAsset.mobileObjectKey
        ? `/api/v1/3d-assets/${activeAsset.id}/model-lite`
        : null,
      posterUrl: `/api/v1/3d-assets/${activeAsset.id}/poster`,
      config,
      customizationPresets: activeAsset.customizationPresets.map(mapPresetDto),
      publishedAt: activeAsset.publishedAt
        ? activeAsset.publishedAt.toISOString()
        : null,
    };
  }

  async getPublic3DAssetMetadata(assetId: string): Promise<Product3DAssetMetadataDto> {
    const asset = await this.prisma.client.product3DAsset.findUnique({
      where: { id: assetId },
      include: ASSET_WITH_RELATIONS_INCLUDE,
    });

    if (
      !asset ||
      asset.status !== AssetStatus.READY ||
      asset.product.status !== ProductStatus.PUBLISHED ||
      !asset.product.isVisible ||
      asset.product.deletedAt !== null
    ) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Published 3D asset metadata was not found',
      );
    }

    const config = normalizeAssetConfig(asset.config, asset.product.slug);
    return {
      id: asset.id,
      productId: asset.productId,
      version: asset.version,
      format: asset.format as AssetFormatInput,
      bytes: Number(asset.bytes),
      posterUrl: `/api/v1/3d-assets/${asset.id}/poster`,
      modelUrl: `/api/v1/3d-assets/${asset.id}/model`,
      mobileModelUrl: asset.mobileObjectKey
        ? `/api/v1/3d-assets/${asset.id}/model-lite`
        : null,
      coordinateSystem: config.coordinateSystem,
      lightingPreset: config.lightingPreset,
      materialSlots: config.materialSlots,
      qualityProfiles: config.qualityProfiles,
      provenance: config.provenance,
    };
  }

  async readPublic3DAssetBinary(
    assetId: string,
    kind: 'default' | 'lite' | 'poster',
  ): Promise<{ readonly buffer: Buffer; readonly contentType: string }> {
    const asset = await this.prisma.client.product3DAsset.findUnique({
      where: { id: assetId },
      include: {
        product: {
          select: {
            slug: true,
            name: true,
            material: true,
            fit: true,
            status: true,
            isVisible: true,
            deletedAt: true,
          },
        },
      },
    });

    if (
      !asset ||
      asset.status !== AssetStatus.READY ||
      asset.product.status !== ProductStatus.PUBLISHED ||
      !asset.product.isVisible ||
      asset.product.deletedAt !== null
    ) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Requested 3D asset binary was not found',
      );
    }

    if (kind === 'poster') {
      try {
        const posterBuf = await this.storage.readBuffer({
          scope: 'public',
          key: asset.posterKey,
        });
        const isWebp =
          posterBuf.length >= 12 &&
          posterBuf.subarray(0, 4).toString('ascii') === 'RIFF' &&
          posterBuf.subarray(8, 12).toString('ascii') === 'WEBP';
        return {
          buffer: posterBuf,
          contentType: isWebp ? 'image/webp' : 'image/svg+xml; charset=utf-8',
        };
      } catch {
        const svg = buildStudioPosterSvg({
          title: asset.product.name,
          subtitle: `${asset.product.material} · ${asset.product.fit}`,
        });
        return {
          buffer: Buffer.from(svg, 'utf8'),
          contentType: 'image/svg+xml; charset=utf-8',
        };
      }
    }

    const key =
      kind === 'lite' && asset.mobileObjectKey
        ? asset.mobileObjectKey
        : asset.objectKey;

    try {
      const glbBuffer = await this.storage.readBuffer({
        scope: 'public',
        key,
      });
      return {
        buffer: glbBuffer,
        contentType: 'model/gltf-binary',
      };
    } catch {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        '3D binary asset file missing from storage',
      );
    }
  }

  async record3DTelemetry(
    input: Record3DTelemetryRequest,
  ): Promise<Telemetry3DReceiptDto> {
    const fieldMap: Record<Record3DTelemetryRequest['eventType'], string> = {
      viewer_opened: 'viewer_opened',
      preset_selected: 'preset_selected',
      camera_preset: 'camera_preset',
      fallback_triggered: 'fallback_triggered',
      load_error: 'load_error',
      context_lost: 'context_lost',
    };
    const field = fieldMap[input.eventType];

    try {
      await this.redis.hincrby(TELEMETRY_3D_REDIS_KEY, field, 1);
    } catch {
      // Telemetry degradation must never fail user actions
    }

    // Strictly zero PII (never log email, phone, name, IP, or cookies)
    this.logger.info(
      {
        eventType: input.eventType,
        productId: input.productId,
        assetId: input.assetId ?? null,
        version: input.version ?? null,
        deviceTier: input.deviceTier ?? null,
        presetCode: input.presetCode ?? null,
        cameraPreset: input.cameraPreset ?? null,
        errorCode: input.errorCode ?? null,
        durationMs: input.durationMs ?? null,
      },
      'Recorded anonymized 3D engagement telemetry',
    );

    return {
      recorded: true,
      eventType: input.eventType,
      recordedAtUtc: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // Admin 3D Asset Lifecycle (Quarantine -> Validate -> Preview -> Publish)
  // ===========================================================================

  async listAdminProduct3DAssets(productId: string): Promise<AdminProduct3DAssetDto[]> {
    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Product was not found',
      );
    }

    const rows = await this.prisma.client.product3DAsset.findMany({
      where: { productId },
      include: ASSET_WITH_RELATIONS_INCLUDE,
      orderBy: [{ version: 'desc' }],
    });
    return rows.map(mapAdminAssetDto);
  }

  async presignAdmin3DAssetUpload(
    actor: AuthenticatedActor,
    productId: string,
    input: Presign3DAssetRequest,
    ipAddress?: string | null,
  ): Promise<Presign3DAssetResponseDto> {
    if (input.bytes > MAX_STAGING_UPLOAD_BYTES) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        `Upload exceeds max allowed staging cap of ${MAX_STAGING_UPLOAD_BYTES} bytes`,
      );
    }

    return this.prisma.withTransaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, deletedAt: null },
        include: {
          variants: {
            where: { deletedAt: null },
            select: { id: true },
          },
        },
      });
      if (!product) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Product was not found',
        );
      }

      if (input.variantId) {
        const ownsVariant = product.variants.some((v) => v.id === input.variantId);
        if (!ownsVariant) {
          throw new DomainHttpException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'variantId does not belong to this product',
          );
        }
      }

      const maxVer = await tx.product3DAsset.aggregate({
        where: { productId },
        _max: { version: true },
      });
      const nextVersion = (maxVer._max.version ?? 0) + 1;
      const versionStr = `v${String(nextVersion).padStart(4, '0')}`;
      const assetId = randomUUID();

      // Always server-generate immutable keys and quarantine keys; ignore client filename paths
      const stagingKey = `staging/3d/${assetId}/${randomUUID()}.glb`;
      const publicObjectKey = `products/${product.slug}/${versionStr}/model.glb`;
      const publicLiteKey = `products/${product.slug}/${versionStr}/model-lite.glb`;
      const publicPosterKey = `products/${product.slug}/${versionStr}/poster.svg`;

      const presigned = await this.storage.createPresignedUpload({
        key: stagingKey,
        contentType: 'model/gltf-binary',
        contentLength: input.bytes,
        expiresInSeconds: 600,
        scope: 'staging',
      });

      const silhouette = input.silhouette ?? inferSilhouetteFromSlug(product.slug);
      const baseConfig = buildDefaultAssetConfig({
        silhouette,
        lightingPreset: input.lightingPreset,
        materialSlots: input.materialSlots,
        provenance: input.provenance ?? DEFAULT_ARVEN_PROVENANCE,
        defaultProfile: {
          triangles: 0,
          vertices: 0,
          bytes: input.bytes,
        },
      });

      const configPayload = {
        ...baseConfig,
        stagingKey,
      };

      const created = await tx.product3DAsset.create({
        data: {
          id: assetId,
          productId,
          variantId: input.variantId ?? null,
          version: nextVersion,
          format: AssetFormat.GLB,
          objectKey: publicObjectKey,
          mobileObjectKey: publicLiteKey,
          posterKey: publicPosterKey,
          bytes: BigInt(input.bytes),
          status: AssetStatus.UPLOADED,
          isActiveVersion: false,
          config: configPayload as unknown as Prisma.InputJsonValue,
          createdBy: actor.userId,
        },
        include: ASSET_WITH_RELATIONS_INCLUDE,
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'asset3d.presigned',
          resource: 'Product3DAsset',
          resourceId: created.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            productId,
            version: nextVersion,
            bytes: input.bytes,
            stagingKey,
            objectKey: publicObjectKey,
          },
        },
        tx,
      );

      // Same-origin PUT endpoint when using LocalFsStorageAdapter so browser uploads seamlessly
      const isLocalFsUpload = presigned.uploadUrl.includes('/_local-staging/');
      const uploadUrl = isLocalFsUpload
        ? `/api/v1/admin/3d-assets/${created.id}/upload-staging`
        : presigned.uploadUrl;

      return {
        asset: mapAdminAssetDto(created),
        stagingKey,
        uploadUrl,
        uploadMethod: 'PUT',
        uploadHeaders: presigned.headers,
        expiresAtUtc: presigned.expiresAtUtc,
      };
    });
  }

  async uploadStagingBytes(
    actor: AuthenticatedActor,
    assetId: string,
    input: UploadStaging3DAssetRequest,
    ipAddress?: string | null,
  ): Promise<AdminProduct3DAssetDto> {
    const glbBuffer = this.decodeBase64Payload(input.glbBase64);
    if (glbBuffer.byteLength > MAX_STAGING_UPLOAD_BYTES) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        `Staged GLB exceeds max limit of ${MAX_STAGING_UPLOAD_BYTES} bytes`,
      );
    }

    const liteBuffer = input.liteGlbBase64
      ? this.decodeBase64Payload(input.liteGlbBase64)
      : null;

    const existing = await this.loadAssetOrThrow(assetId);
    if (existing.status === AssetStatus.ARCHIVED) {
      throw new DomainHttpException(
        HttpStatus.CONFLICT,
        'INVALID_STATE_TRANSITION',
        'Archived 3D asset cannot accept new staging uploads',
      );
    }

    const rawCfg = (existing.config && typeof existing.config === 'object'
      ? existing.config
      : {}) as Record<string, unknown>;
    const stagingKey =
      typeof rawCfg['stagingKey'] === 'string' && rawCfg['stagingKey'].length > 0
        ? rawCfg['stagingKey']
        : `staging/3d/${existing.id}/${randomUUID()}.glb`;
    const mobileStagingKey = `${stagingKey}.lite.glb`;

    await this.storage.putBuffer({
      key: stagingKey,
      body: glbBuffer,
      contentType: 'model/gltf-binary',
      scope: 'staging',
    });
    if (liteBuffer) {
      await this.storage.putBuffer({
        key: mobileStagingKey,
        body: liteBuffer,
        contentType: 'model/gltf-binary',
        scope: 'staging',
      });
    }

    const updatedCfg = {
      ...rawCfg,
      stagingKey,
      ...(liteBuffer ? { mobileStagingKey } : {}),
    };

    const updated = await this.prisma.withTransaction(async (tx) => {
      const saved = await tx.product3DAsset.update({
        where: { id: assetId },
        data: {
          bytes: BigInt(glbBuffer.byteLength),
          status: AssetStatus.UPLOADED,
          config: updatedCfg as unknown as Prisma.InputJsonValue,
        },
        include: ASSET_WITH_RELATIONS_INCLUDE,
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'asset3d.staged',
          resource: 'Product3DAsset',
          resourceId: saved.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            bytes: glbBuffer.byteLength,
            hasLiteVariant: Boolean(liteBuffer),
          },
        },
        tx,
      );

      return saved;
    });

    return mapAdminAssetDto(updated);
  }

  async confirmAdmin3DAssetUpload(
    actor: AuthenticatedActor,
    assetId: string,
    input: Confirm3DAssetRequest,
    ipAddress?: string | null,
    expectedProductId?: string,
  ): Promise<AdminProduct3DAssetDto> {
    const asset = await this.loadAssetOrThrow(assetId);
    if (expectedProductId && asset.productId !== expectedProductId) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        '3D asset does not belong to specified product',
      );
    }

    const rawCfg = (asset.config && typeof asset.config === 'object'
      ? asset.config
      : {}) as Record<string, unknown>;
    const stagingKey =
      typeof rawCfg['stagingKey'] === 'string' && rawCfg['stagingKey'].length > 0
        ? rawCfg['stagingKey']
        : `staging/3d/${asset.id}/${randomUUID()}.glb`;
    const mobileStagingKey =
      typeof rawCfg['mobileStagingKey'] === 'string'
        ? rawCfg['mobileStagingKey']
        : `${stagingKey}.lite.glb`;

    let glbBuffer: Buffer;
    let liteBuffer: Buffer | null = null;

    if (input.glbBase64) {
      glbBuffer = this.decodeBase64Payload(input.glbBase64);
      if (glbBuffer.byteLength > MAX_STAGING_UPLOAD_BYTES) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          `GLB upload exceeds max allowed size of ${MAX_STAGING_UPLOAD_BYTES} bytes`,
        );
      }
      await this.storage.putBuffer({
        key: stagingKey,
        body: glbBuffer,
        contentType: 'model/gltf-binary',
        scope: 'staging',
      });
    } else {
      try {
        glbBuffer = await this.storage.readBuffer({
          key: stagingKey,
          scope: 'staging',
        });
      } catch {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'No staged GLB upload found for this asset version; upload binary to staging URL first',
        );
      }
    }

    if (input.liteGlbBase64) {
      liteBuffer = this.decodeBase64Payload(input.liteGlbBase64);
      await this.storage.putBuffer({
        key: mobileStagingKey,
        body: liteBuffer,
        contentType: 'model/gltf-binary',
        scope: 'staging',
      });
    } else if (rawCfg['mobileStagingKey']) {
      try {
        liteBuffer = await this.storage.readBuffer({
          key: mobileStagingKey,
          scope: 'staging',
        });
      } catch {
        liteBuffer = null;
      }
    }

    const normalizedConfig = normalizeAssetConfig(asset.config, asset.product.slug);
    const startedAt = new Date();

    const defaultReport = inspectAndValidateGlbBuffer(glbBuffer, {
      profile: 'default',
      expectedMaterialSlots:
        normalizedConfig.materialSlots.length > 0
          ? normalizedConfig.materialSlots
          : DEFAULT_ARVEN_MATERIAL_SLOTS,
    });

    const liteReport = liteBuffer
      ? inspectAndValidateGlbBuffer(liteBuffer, {
          profile: 'lite',
          expectedMaterialSlots:
            normalizedConfig.materialSlots.length > 0
              ? normalizedConfig.materialSlots
              : DEFAULT_ARVEN_MATERIAL_SLOTS,
        })
      : null;

    const allErrors = [
      ...defaultReport.errors,
      ...(liteReport && !liteReport.valid
        ? liteReport.errors.map((e) => `lite: ${e}`)
        : []),
    ];

    const isValid = allErrors.length === 0;
    const nextAssetStatus = isValid ? AssetStatus.READY : AssetStatus.FAILED;
    const nextRunStatus = isValid
      ? AssetValidationStatus.PASSED
      : AssetValidationStatus.FAILED;

    let finalMobileObjectKey: string | null = asset.mobileObjectKey;

    if (isValid) {
      // Promote validated default GLB from quarantine to immutable versioned public path
      await this.storage.publishAsset({
        stagingKey,
        publicKey: asset.objectKey,
        contentType: 'model/gltf-binary',
      });

      // Ensure mobile lite profile exists in public prefix
      if (liteBuffer) {
        const targetMobileKey =
          asset.mobileObjectKey ??
          `products/${asset.product.slug}/v${String(asset.version).padStart(4, '0')}/model-lite.glb`;
        await this.storage.putBuffer({
          scope: 'public',
          key: targetMobileKey,
          body: liteBuffer,
          contentType: 'model/gltf-binary',
        });
        finalMobileObjectKey = targetMobileKey;
      } else {
        // Generate or mirror deterministic lite GLB only if default model is within lite cap, or build slim studio silhouette
        const targetMobileKey =
          asset.mobileObjectKey ??
          `products/${asset.product.slug}/v${String(asset.version).padStart(4, '0')}/model-lite.glb`;
        const fallbackLite = buildArvenGarmentGlbBuffer({
          silhouette: inferSilhouetteFromSlug(asset.product.slug),
          profile: 'lite',
        });
        const mobileBytesToStore =
          defaultReport.bytes <= 3_500_000 && defaultReport.triangleCount <= 25_000
            ? glbBuffer
            : Buffer.from(fallbackLite);
        await this.storage.putBuffer({
          scope: 'public',
          key: targetMobileKey,
          body: mobileBytesToStore,
          contentType: 'model/gltf-binary',
        });
        finalMobileObjectKey = targetMobileKey;
      }

      // Generate deterministic studio fallback poster
      const posterSvg = buildStudioPosterSvg({
        title: asset.product.name,
        subtitle: `${asset.product.material} · ${asset.product.fit}`,
      });
      await this.storage.putBuffer({
        scope: 'public',
        key: asset.posterKey,
        body: Buffer.from(posterSvg, 'utf8'),
        contentType: 'image/svg+xml; charset=utf-8',
      });
    }

    const updatedConfigDto: Product3DAssetConfigDto = {
      ...normalizedConfig,
      qualityProfiles: {
        default: {
          triangles: defaultReport.triangleCount,
          vertices: defaultReport.vertexCount,
          bytes: defaultReport.bytes,
        },
        lite: liteReport
          ? {
              triangles: liteReport.triangleCount,
              vertices: liteReport.vertexCount,
              bytes: liteReport.bytes,
            }
          : {
              triangles: defaultReport.triangleCount,
              vertices: defaultReport.vertexCount,
              bytes: defaultReport.bytes,
            },
      },
    };

    const persisted = await this.prisma.withTransaction(async (tx) => {
      await tx.assetValidationRun.create({
        data: {
          assetId: asset.id,
          status: nextRunStatus,
          validatorVersion: VALIDATOR_VERSION,
          report: {
            bytes: defaultReport.bytes,
            triangleCount: defaultReport.triangleCount,
            vertexCount: defaultReport.vertexCount,
            meshNames: defaultReport.meshNames,
            materialNames: defaultReport.materialNames,
            boundsMin: defaultReport.boundsMin,
            boundsMax: defaultReport.boundsMax,
            errors: allErrors,
          } as unknown as Prisma.InputJsonValue,
          errorSummary: isValid ? null : allErrors.join('; '),
          startedAt,
          completedAt: new Date(),
        },
      });

      const saved = await tx.product3DAsset.update({
        where: { id: asset.id },
        data: {
          status: nextAssetStatus,
          bytes: BigInt(defaultReport.bytes),
          mobileObjectKey: finalMobileObjectKey,
          config: {
            ...updatedConfigDto,
            stagingKey,
          } as unknown as Prisma.InputJsonValue,
        },
        include: ASSET_WITH_RELATIONS_INCLUDE,
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'asset3d',
          aggregateId: saved.id,
          eventType: 'asset.validation.completed',
          schemaVersion: 1,
          payload: {
            assetId: saved.id,
            productId: saved.productId,
            status: nextAssetStatus,
            valid: isValid,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'asset3d.validated',
          resource: 'Product3DAsset',
          resourceId: saved.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            status: nextAssetStatus,
            valid: isValid,
            bytes: defaultReport.bytes,
            triangleCount: defaultReport.triangleCount,
            errors: allErrors,
          },
        },
        tx,
      );

      return saved;
    });

    return mapAdminAssetDto(persisted);
  }

  async readAdminPreviewModelBinary(assetId: string): Promise<Buffer> {
    const asset = await this.loadAssetOrThrow(assetId);
    if (asset.status === AssetStatus.READY) {
      try {
        return await this.storage.readBuffer({
          scope: 'public',
          key: asset.objectKey,
        });
      } catch {
        // Fall through to staging key check below
      }
    }

    const rawCfg = (asset.config && typeof asset.config === 'object'
      ? asset.config
      : {}) as Record<string, unknown>;
    const stagingKey =
      typeof rawCfg['stagingKey'] === 'string' ? rawCfg['stagingKey'] : '';
    if (stagingKey && asset.status !== AssetStatus.FAILED) {
      try {
        return await this.storage.readBuffer({
          scope: 'staging',
          key: stagingKey,
        });
      } catch {
        // Ignore missing staging file
      }
    }

    throw new DomainHttpException(
      HttpStatus.NOT_FOUND,
      'RESOURCE_NOT_FOUND',
      'Previewable 3D model binary was not found',
    );
  }

  async publishAdmin3DAsset(
    actor: AuthenticatedActor,
    assetId: string,
    input: Publish3DAssetRequest,
    ipAddress?: string | null,
  ): Promise<AdminProduct3DAssetDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.product3DAsset.findUnique({
        where: { id: assetId },
        include: ASSET_WITH_RELATIONS_INCLUDE,
      });

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          '3D asset version was not found',
        );
      }

      if (existing.status !== AssetStatus.READY) {
        throw new DomainHttpException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVALID_STATE_TRANSITION',
          `Only validated READY 3D assets can be published (current status: ${existing.status})`,
        );
      }

      // Archive previous active version so partial unique index uq_product_3d_assets_active_version holds cleanly
      await tx.product3DAsset.updateMany({
        where: {
          productId: existing.productId,
          isActiveVersion: true,
          id: { not: existing.id },
        },
        data: {
          isActiveVersion: false,
          status: AssetStatus.ARCHIVED,
        },
      });

      const now = new Date();
      const publishedAsset = await tx.product3DAsset.update({
        where: { id: existing.id },
        data: {
          isActiveVersion: true,
          publishedAt: existing.publishedAt ?? now,
        },
        include: ASSET_WITH_RELATIONS_INCLUDE,
      });

      await tx.product.update({
        where: { id: existing.productId },
        data: {
          has3dEnabled: input.enableProduct3d,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'asset3d',
          aggregateId: publishedAsset.id,
          eventType: 'asset.published',
          schemaVersion: 1,
          payload: {
            assetId: publishedAsset.id,
            productId: publishedAsset.productId,
            version: publishedAsset.version,
            enableProduct3d: input.enableProduct3d,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'asset3d.published',
          resource: 'Product3DAsset',
          resourceId: publishedAsset.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            productId: publishedAsset.productId,
            version: publishedAsset.version,
            isActiveVersion: true,
            enableProduct3d: input.enableProduct3d,
          },
        },
        tx,
      );

      return mapAdminAssetDto(publishedAsset);
    });
  }

  // ===========================================================================
  // Admin Customization Presets CRUD
  // ===========================================================================

  async listAssetPresets(assetId: string): Promise<CustomizationPresetDto[]> {
    const asset = await this.loadAssetOrThrow(assetId);
    return asset.customizationPresets.map(mapPresetDto);
  }

  async createAssetPreset(
    actor: AuthenticatedActor,
    assetId: string,
    input: CreateCustomizationPresetRequest,
    ipAddress?: string | null,
  ): Promise<CustomizationPresetDto> {
    const asset = await this.loadAssetOrThrow(assetId);
    const config = normalizeAssetConfig(asset.config, asset.product.slug);
    validateOverridesAgainstSlots(input.materialOverrides, config.materialSlots);

    return this.prisma.withTransaction(async (tx) => {
      if (input.variantId) {
        const ownedVariant = await tx.productVariant.findFirst({
          where: {
            id: input.variantId,
            productId: asset.productId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!ownedVariant) {
          throw new DomainHttpException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'variantId does not belong to this product',
          );
        }
      }

      const duplicate = await tx.customizationPreset.findUnique({
        where: {
          assetId_code: {
            assetId,
            code: input.code,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'DUPLICATE_RESOURCE',
          `Preset code "${input.code}" already exists on this 3D asset`,
        );
      }

      const created = await tx.customizationPreset.create({
        data: {
          productId: asset.productId,
          assetId,
          code: input.code,
          label: input.label,
          swatchHex: input.swatchHex,
          materialOverrides: input.materialOverrides as unknown as Prisma.InputJsonValue,
          variantId: input.variantId ?? null,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
        include: {
          variant: { select: { id: true, sku: true, color: true } },
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'asset3d.preset.created',
          resource: 'CustomizationPreset',
          resourceId: created.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            assetId,
            code: created.code,
            label: created.label,
            swatchHex: created.swatchHex,
          },
        },
        tx,
      );

      return mapPresetDto(created);
    });
  }

  async updateAssetPreset(
    actor: AuthenticatedActor,
    assetId: string,
    presetId: string,
    input: UpdateCustomizationPresetRequest,
    ipAddress?: string | null,
  ): Promise<CustomizationPresetDto> {
    const asset = await this.loadAssetOrThrow(assetId);
    const existing = asset.customizationPresets.find((p) => p.id === presetId);
    if (!existing) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Customization preset was not found on this 3D asset',
      );
    }

    if (input.materialOverrides) {
      const config = normalizeAssetConfig(asset.config, asset.product.slug);
      validateOverridesAgainstSlots(input.materialOverrides, config.materialSlots);
    }

    return this.prisma.withTransaction(async (tx) => {
      if (input.variantId) {
        const ownedVariant = await tx.productVariant.findFirst({
          where: {
            id: input.variantId,
            productId: asset.productId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!ownedVariant) {
          throw new DomainHttpException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'variantId does not belong to this product',
          );
        }
      }

      if (input.code && input.code !== existing.code) {
        const conflict = await tx.customizationPreset.findUnique({
          where: {
            assetId_code: {
              assetId,
              code: input.code,
            },
          },
          select: { id: true },
        });
        if (conflict && conflict.id !== presetId) {
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'DUPLICATE_RESOURCE',
            `Preset code "${input.code}" already exists on this 3D asset`,
          );
        }
      }

      const updated = await tx.customizationPreset.update({
        where: { id: presetId },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.swatchHex !== undefined ? { swatchHex: input.swatchHex } : {}),
          ...(input.materialOverrides !== undefined
            ? {
                materialOverrides:
                  input.materialOverrides as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
        include: {
          variant: { select: { id: true, sku: true, color: true } },
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'asset3d.preset.updated',
          resource: 'CustomizationPreset',
          resourceId: updated.id,
          ipAddress: ipAddress ?? null,
          beforeState: {
            code: existing.code,
            label: existing.label,
            swatchHex: existing.swatchHex,
            isActive: existing.isActive,
          },
          afterState: {
            code: updated.code,
            label: updated.label,
            swatchHex: updated.swatchHex,
            isActive: updated.isActive,
          },
        },
        tx,
      );

      return mapPresetDto(updated);
    });
  }

  async deleteAssetPreset(
    actor: AuthenticatedActor,
    assetId: string,
    presetId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    const asset = await this.loadAssetOrThrow(assetId);
    const existing = asset.customizationPresets.find((p) => p.id === presetId);
    if (!existing) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Customization preset was not found on this 3D asset',
      );
    }

    await this.prisma.withTransaction(async (tx) => {
      await tx.customizationPreset.delete({
        where: { id: presetId },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'asset3d.preset.deleted',
          resource: 'CustomizationPreset',
          resourceId: presetId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            assetId,
            code: existing.code,
            label: existing.label,
          },
        },
        tx,
      );
    });
  }

  private decodeBase64Payload(raw: string): Buffer {
    const cleaned = raw.replace(/^data:[^;]+;base64,/, '').trim();
    if (!cleaned || !/^[A-Za-z0-9+/=]+$/.test(cleaned)) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Invalid base64 GLB payload',
      );
    }
    return Buffer.from(cleaned, 'base64');
  }

  private async loadAssetOrThrow(assetId: string): Promise<LoadedAsset3D> {
    const asset = await this.prisma.client.product3DAsset.findUnique({
      where: { id: assetId },
      include: ASSET_WITH_RELATIONS_INCLUDE,
    });
    if (!asset || asset.product.deletedAt !== null) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        '3D asset was not found',
      );
    }
    return asset;
  }
}
