import { Inject, Injectable } from '@nestjs/common';
import { OUTFIT_STUDIO_POLICY } from '@arven/config';
import type {
  AddOutfitToCartResultDto,
  AdminOutfitGarmentDiagnosticDto,
  OutfitCompatibilityViolationDto,
  OutfitSceneDto,
  OutfitScenePersistedItemDto,
  OutfitStudioCatalogDto,
  OutfitStudioGarmentDto,
  ValidateOutfitResultDto,
} from '@arven/contracts';
import type { Prisma, PrismaTransactionClient } from '@arven/database';
import {
  buildArvenMannequinGlbBuffer,
  buildStudioPosterSvg,
} from '@arven/three-engine/glb';
import type {
  AddOutfitToCartRequest,
  CreateOutfitSceneRequest,
  CreatePublicOutfitPresetRequest,
  OutfitSlotInput,
  SetAssetOutfitCompatibilityRequest,
  UpdateOutfitSceneRequest,
  UpdatePublicOutfitPresetRequest,
  ValidateOutfitRequest,
} from '@arven/validators';
import type {
  AuthenticatedActor,
  HttpRequestLike,
  HttpResponseLike,
} from '../../../../common/security/index.js';
import {
  STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from '../../../../shared/adapters/storage.provider.js';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../../../audit-notifications/audit-log.service.js';
import { CartService } from '../../../cart/cart.service.js';
import {
  ExperiencesDomainError,
  IncompatibleOutfitSlotError,
} from '../../domain/errors/experiences-domain.error.js';
import {
  evaluateOutfitCompatibility,
  parseOutfitCompatibilityConfig,
  type OutfitCompatibilityCandidateInput,
} from '../../domain/policies/outfit-compatibility.policy.js';
import type {
  OutfitResolvedVariantLookup,
  OutfitSceneRecord,
} from '../../domain/ports/experiences.ports.js';
import { buildMannequinRigKeys } from '../../domain/value-objects/storage-keys.js';
import {
  buildPinnedRigContractDto,
  hydrateOutfitSceneDto,
  mapAdminOutfitGarmentDiagnosticDto,
  mapOutfitStudioGarmentDto,
  parsePersistedOutfitItems,
  sanitizePersistedOutfitItems,
  toDomainHttpException,
} from '../../infrastructure/mappers/experiences.mapper.js';
import { PrismaOutfitStudioRepository } from '../../infrastructure/repositories/prisma-outfit-studio.repository.js';

interface RequestedSlotEntry {
  readonly slot: OutfitSlotInput;
  readonly productId?: string | undefined;
  readonly variantId: string;
  readonly assetId?: string | undefined;
  readonly presetId?: string | null | undefined;
}

@Injectable()
export class OutfitStudioService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrismaOutfitStudioRepository)
    private readonly outfitRepo: PrismaOutfitStudioRepository,
    @Inject(CartService) private readonly cartService: CartService,
    @Inject(STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
  ) {}

  // ===========================================================================
  // Public Catalog, Rig Binaries, Stateless Validation & Cart Batch Add
  // ===========================================================================

  async getCatalog(): Promise<OutfitStudioCatalogDto> {
    const [assets, publicPresetRows] = await Promise.all([
      this.outfitRepo.findActiveReadyGarmentAssets(),
      this.outfitRepo.findPublicPresets(),
    ]);

    const garments: OutfitStudioGarmentDto[] = [];
    for (const asset of assets) {
      const mapped = mapOutfitStudioGarmentDto(asset);
      if (mapped) {
        garments.push(mapped);
      }
    }

    const publicPresets = await this.hydrateOutfitScenes(publicPresetRows);

    return {
      rig: buildPinnedRigContractDto(),
      garments,
      publicPresets,
    };
  }

  async readRigBinary(
    rigId: string,
    kind: 'default' | 'lite' | 'poster',
  ): Promise<{ readonly buffer: Buffer; readonly contentType: string }> {
    let keys;
    try {
      keys = buildMannequinRigKeys(rigId);
    } catch (error) {
      toDomainHttpException(error);
    }

    if (kind === 'poster') {
      try {
        const buf = await this.storage.readBuffer({
          scope: 'public',
          key: keys.posterKey,
        });
        const isWebp =
          buf.length >= 12 &&
          buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
          buf.subarray(8, 12).toString('ascii') === 'WEBP';
        return {
          buffer: buf,
          contentType: isWebp ? 'image/webp' : 'image/svg+xml; charset=utf-8',
        };
      } catch {
        const svg = buildStudioPosterSvg({
          title: 'ARVEN Unisex Studio Mannequin',
          subtitle: `${OUTFIT_STUDIO_POLICY.RIG_ID} · v${OUTFIT_STUDIO_POLICY.SKELETON_VERSION}`,
        });
        return {
          buffer: Buffer.from(svg, 'utf8'),
          contentType: 'image/svg+xml; charset=utf-8',
        };
      }
    }

    const key = kind === 'lite' ? keys.liteModelKey : keys.modelKey;
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
      const generated = buildArvenMannequinGlbBuffer({
        profile: kind === 'lite' ? 'lite' : 'default',
      });
      return {
        buffer: generated,
        contentType: 'model/gltf-binary',
      };
    }
  }

  async validateOutfitStateless(
    input: ValidateOutfitRequest,
  ): Promise<ValidateOutfitResultDto> {
    await this.resolveAndValidateOutfitSlots({
      rigId: input.rigId,
      slots: input.slots,
      requireActiveVariant: true,
    });

    return {
      valid: true,
      rigId: input.rigId,
      skeletonVersion: OUTFIT_STUDIO_POLICY.SKELETON_VERSION,
      slotCount: input.slots.length,
    };
  }

  async addOutfitToCart(
    req: HttpRequestLike,
    res: HttpResponseLike,
    input: AddOutfitToCartRequest,
  ): Promise<AddOutfitToCartResultDto> {
    const resolvedItems = await this.resolveAndValidateOutfitSlots({
      rigId: input.rigId,
      slots: input.slots,
      requireActiveVariant: false,
    });

    return this.cartService.addOutfitItemsBatch(
      req,
      res,
      resolvedItems.map((item) => ({
        slot: item.slot,
        variantId: item.variantId,
        productId: item.productId,
        presetId: item.presetId,
      })),
    );
  }

  // ===========================================================================
  // Customer Saved Outfit Scenes (/outfit-scenes)
  // ===========================================================================

  async listCustomerOutfits(actor: AuthenticatedActor): Promise<OutfitSceneDto[]> {
    const scenes = await this.outfitRepo.findCustomerOutfits(actor.userId);
    return this.hydrateOutfitScenes(scenes);
  }

  async getCustomerOutfit(
    actor: AuthenticatedActor,
    id: string,
  ): Promise<OutfitSceneDto> {
    const scene = await this.outfitRepo.findCustomerOutfitById(id, actor.userId);
    if (!scene) {
      toDomainHttpException(
        new ExperiencesDomainError(
          404,
          'RESOURCE_NOT_FOUND',
          'Outfit scene was not found',
        ),
      );
    }
    const hydrated = await this.hydrateOutfitScenes([scene]);
    return hydrated[0]!;
  }

  async createCustomerOutfit(
    actor: AuthenticatedActor,
    input: CreateOutfitSceneRequest,
  ): Promise<OutfitSceneDto> {
    const created = await this.prisma.withTransaction(async (tx) => {
      const existingCount = await this.outfitRepo.countCustomerOutfits(
        actor.userId,
        tx,
      );
      if (existingCount >= OUTFIT_STUDIO_POLICY.MAX_SAVED_OUTFITS_PER_USER) {
        toDomainHttpException(
          new ExperiencesDomainError(
            422,
            'OUTFIT_LIMIT_REACHED',
            `Maximum of ${OUTFIT_STUDIO_POLICY.MAX_SAVED_OUTFITS_PER_USER} saved outfits reached per customer.`,
          ),
        );
      }

      const resolvedItems = await this.resolveAndValidateOutfitSlots(
        {
          rigId: input.rigId,
          slots: input.slots,
          requireActiveVariant: true,
        },
        tx,
      );

      const persistedItems = sanitizePersistedOutfitItems(resolvedItems);

      const scene = await tx.outfitScene.create({
        data: {
          userId: actor.userId,
          title: input.title,
          mannequinRigVersion: input.rigId,
          items: persistedItems as unknown as Prisma.InputJsonValue,
          isPublicPreset: false,
        },
      });

      const hydrated = await this.hydrateOutfitScenes([scene], tx);
      return hydrated[0]!;
    });

    return created;
  }

  async updateCustomerOutfit(
    actor: AuthenticatedActor,
    id: string,
    input: UpdateOutfitSceneRequest,
  ): Promise<OutfitSceneDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await this.outfitRepo.findCustomerOutfitById(
        id,
        actor.userId,
        tx,
      );
      if (!existing) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Outfit scene was not found',
          ),
        );
      }

      const nextRigId = input.rigId ?? existing.mannequinRigVersion;
      let nextPersistedItems: OutfitScenePersistedItemDto[] | undefined;

      if (input.slots !== undefined || input.rigId !== undefined) {
        const slotsToValidate: RequestedSlotEntry[] =
          input.slots ??
          parsePersistedOutfitItems(existing.items).map((item) => ({
            slot: item.slot,
            productId: item.productId,
            variantId: item.variantId,
            assetId: item.assetId,
            presetId: item.presetId,
          }));

        const resolvedItems = await this.resolveAndValidateOutfitSlots(
          {
            rigId: nextRigId,
            slots: slotsToValidate,
            requireActiveVariant: true,
          },
          tx,
        );
        nextPersistedItems = sanitizePersistedOutfitItems(resolvedItems);
      }

      const updateCount = await tx.outfitScene.updateMany({
        where: {
          id: existing.id,
          userId: actor.userId,
          isPublicPreset: false,
        },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.rigId !== undefined ? { mannequinRigVersion: input.rigId } : {}),
          ...(nextPersistedItems !== undefined
            ? { items: nextPersistedItems as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });

      if (updateCount.count === 0) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Outfit scene was not found',
          ),
        );
      }

      const reloaded = await this.outfitRepo.findCustomerOutfitById(
        existing.id,
        actor.userId,
        tx,
      );
      if (!reloaded) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Outfit scene was not found',
          ),
        );
      }

      const hydrated = await this.hydrateOutfitScenes([reloaded], tx);
      return hydrated[0]!;
    });
  }

  async deleteCustomerOutfit(actor: AuthenticatedActor, id: string): Promise<void> {
    const deleted = await this.prisma.client.outfitScene.deleteMany({
      where: {
        id,
        userId: actor.userId,
        isPublicPreset: false,
      },
    });
    if (deleted.count === 0) {
      toDomainHttpException(
        new ExperiencesDomainError(
          404,
          'RESOURCE_NOT_FOUND',
          'Outfit scene was not found',
        ),
      );
    }
  }

  // ===========================================================================
  // Admin Compatibility & Public Outfit Presets
  // ===========================================================================

  async listAdminGarments(): Promise<AdminOutfitGarmentDiagnosticDto[]> {
    const assets = await this.outfitRepo.findActiveReadyGarmentAssets();
    return assets.map(mapAdminOutfitGarmentDiagnosticDto);
  }

  async setAssetOutfitCompatibility(
    actor: AuthenticatedActor,
    assetId: string,
    input: SetAssetOutfitCompatibilityRequest,
    ipAddress?: string | null,
  ): Promise<AdminOutfitGarmentDiagnosticDto> {
    const violations: OutfitCompatibilityViolationDto[] = [];

    if (input.rigId !== OUTFIT_STUDIO_POLICY.RIG_ID) {
      violations.push({
        slot: input.slot,
        productId: null,
        reason: 'RIG_MISMATCH',
        message: `rigId must be "${OUTFIT_STUDIO_POLICY.RIG_ID}"`,
      });
    }
    if (input.skeletonVersion !== OUTFIT_STUDIO_POLICY.SKELETON_VERSION) {
      violations.push({
        slot: input.slot,
        productId: null,
        reason: 'SKELETON_VERSION_MISMATCH',
        message: `skeletonVersion must be "${OUTFIT_STUDIO_POLICY.SKELETON_VERSION}"`,
      });
    }
    if (
      !(OUTFIT_STUDIO_POLICY.ANCHORS[input.slot] as readonly string[]).includes(
        input.anchor,
      )
    ) {
      violations.push({
        slot: input.slot,
        productId: null,
        reason: 'ANCHOR_INVALID',
        message: `anchor "${input.anchor}" is not valid for slot "${input.slot}"`,
      });
    }
    if (input.incompatibleSlots.includes(input.slot)) {
      violations.push({
        slot: input.slot,
        productId: null,
        reason: 'LAYER_CONFLICT',
        message: `Slot "${input.slot}" cannot declare itself in incompatibleSlots`,
      });
    }

    if (violations.length > 0) {
      toDomainHttpException(new IncompatibleOutfitSlotError(violations));
    }

    const dedupedIncompatibleSlots = Array.from(new Set(input.incompatibleSlots));
    const compatPayload = {
      rigId: input.rigId,
      skeletonVersion: input.skeletonVersion,
      slot: input.slot,
      anchor: input.anchor,
      incompatibleSlots: dedupedIncompatibleSlots,
    };

    const updatedAsset = await this.prisma.withTransaction(async (tx) => {
      const existing = await this.outfitRepo.findAssetByIdWithProduct(assetId, tx);
      if (!existing || existing.product.deletedAt !== null) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            '3D asset was not found',
          ),
        );
      }

      const existingConfig =
        existing.config &&
        typeof existing.config === 'object' &&
        !Array.isArray(existing.config)
          ? { ...(existing.config as Record<string, unknown>) }
          : {};

      const nextConfig: Record<string, unknown> = {
        ...existingConfig,
        outfitCompatibility: compatPayload,
      };

      await tx.product3DAsset.update({
        where: { id: existing.id },
        data: {
          config: nextConfig as unknown as Prisma.InputJsonValue,
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'asset.outfit_compatibility.updated',
          resource: 'Product3DAsset',
          resourceId: existing.id,
          ipAddress: ipAddress ?? null,
          beforeState: {
            outfitCompatibility: parseOutfitCompatibilityConfig(existing.config),
          },
          afterState: {
            outfitCompatibility: compatPayload,
          },
        },
        tx,
      );

      const reloaded = await this.outfitRepo.findAssetByIdWithProduct(existing.id, tx);
      return reloaded ?? existing;
    });

    return mapAdminOutfitGarmentDiagnosticDto(updatedAsset);
  }

  async removeAssetOutfitCompatibility(
    actor: AuthenticatedActor,
    assetId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await this.outfitRepo.findAssetByIdWithProduct(assetId, tx);
      if (!existing || existing.product.deletedAt !== null) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            '3D asset was not found',
          ),
        );
      }

      const existingConfig =
        existing.config &&
        typeof existing.config === 'object' &&
        !Array.isArray(existing.config)
          ? { ...(existing.config as Record<string, unknown>) }
          : {};

      const previousCompat = parseOutfitCompatibilityConfig(existing.config);
      delete existingConfig['outfitCompatibility'];

      await tx.product3DAsset.update({
        where: { id: existing.id },
        data: {
          config: existingConfig as unknown as Prisma.InputJsonValue,
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'asset.outfit_compatibility.removed',
          resource: 'Product3DAsset',
          resourceId: existing.id,
          ipAddress: ipAddress ?? null,
          beforeState: {
            outfitCompatibility: previousCompat,
          },
          afterState: {
            outfitCompatibility: null,
          },
        },
        tx,
      );
    });
  }

  async listAdminPublicPresets(): Promise<OutfitSceneDto[]> {
    const presets = await this.outfitRepo.findPublicPresets();
    return this.hydrateOutfitScenes(presets);
  }

  async createAdminPublicPreset(
    actor: AuthenticatedActor,
    input: CreatePublicOutfitPresetRequest,
    ipAddress?: string | null,
  ): Promise<OutfitSceneDto> {
    return this.prisma.withTransaction(async (tx) => {
      const resolvedItems = await this.resolveAndValidateOutfitSlots(
        {
          rigId: input.rigId,
          slots: input.slots,
          requireActiveVariant: true,
        },
        tx,
      );

      const persistedItems = sanitizePersistedOutfitItems(resolvedItems);

      const created = await tx.outfitScene.create({
        data: {
          userId: null,
          title: input.title,
          mannequinRigVersion: input.rigId,
          items: persistedItems as unknown as Prisma.InputJsonValue,
          isPublicPreset: true,
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'outfit.preset.created',
          resource: 'OutfitScene',
          resourceId: created.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            title: created.title,
            rigId: created.mannequinRigVersion,
            slotCount: persistedItems.length,
          },
        },
        tx,
      );

      const hydrated = await this.hydrateOutfitScenes([created], tx);
      return hydrated[0]!;
    });
  }

  async updateAdminPublicPreset(
    actor: AuthenticatedActor,
    id: string,
    input: UpdatePublicOutfitPresetRequest,
    ipAddress?: string | null,
  ): Promise<OutfitSceneDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await this.outfitRepo.findPublicPresetById(id, tx);
      if (!existing) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Public outfit preset was not found',
          ),
        );
      }

      const nextRigId = input.rigId ?? existing.mannequinRigVersion;
      let nextPersistedItems: OutfitScenePersistedItemDto[] | undefined;

      if (input.slots !== undefined || input.rigId !== undefined) {
        const slotsToValidate: RequestedSlotEntry[] =
          input.slots ??
          parsePersistedOutfitItems(existing.items).map((item) => ({
            slot: item.slot,
            productId: item.productId,
            variantId: item.variantId,
            assetId: item.assetId,
            presetId: item.presetId,
          }));

        const resolvedItems = await this.resolveAndValidateOutfitSlots(
          {
            rigId: nextRigId,
            slots: slotsToValidate,
            requireActiveVariant: true,
          },
          tx,
        );
        nextPersistedItems = sanitizePersistedOutfitItems(resolvedItems);
      }

      const updated = await tx.outfitScene.update({
        where: { id: existing.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.rigId !== undefined ? { mannequinRigVersion: input.rigId } : {}),
          ...(nextPersistedItems !== undefined
            ? { items: nextPersistedItems as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'outfit.preset.updated',
          resource: 'OutfitScene',
          resourceId: updated.id,
          ipAddress: ipAddress ?? null,
          beforeState: {
            title: existing.title,
            rigId: existing.mannequinRigVersion,
          },
          afterState: {
            title: updated.title,
            rigId: updated.mannequinRigVersion,
          },
        },
        tx,
      );

      const hydrated = await this.hydrateOutfitScenes([updated], tx);
      return hydrated[0]!;
    });
  }

  async deleteAdminPublicPreset(
    actor: AuthenticatedActor,
    id: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await this.outfitRepo.findPublicPresetById(id, tx);
      if (!existing) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Public outfit preset was not found',
          ),
        );
      }

      await tx.outfitScene.delete({
        where: { id: existing.id },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'outfit.preset.deleted',
          resource: 'OutfitScene',
          resourceId: existing.id,
          ipAddress: ipAddress ?? null,
          beforeState: {
            title: existing.title,
            rigId: existing.mannequinRigVersion,
          },
        },
        tx,
      );
    });
  }

  // ===========================================================================
  // Internal Compatibility Resolution & Live Hydration Helpers
  // ===========================================================================

  private async resolveAndValidateOutfitSlots(
    params: {
      readonly rigId: string;
      readonly slots: ReadonlyArray<RequestedSlotEntry>;
      readonly requireActiveVariant: boolean;
    },
    tx?: PrismaTransactionClient,
  ): Promise<OutfitScenePersistedItemDto[]> {
    const variantIds = Array.from(new Set(params.slots.map((s) => s.variantId)));
    const variants = await this.outfitRepo.findVariantsForResolution(variantIds, tx);
    const variantsById = new Map<string, OutfitResolvedVariantLookup>(
      variants.map((v) => [v.id, v]),
    );

    const candidates: OutfitCompatibilityCandidateInput[] = [];
    const resolvedPersistedItems: OutfitScenePersistedItemDto[] = [];

    for (const entry of params.slots) {
      const variant = variantsById.get(entry.variantId);
      if (!variant || variant.deletedAt !== null) {
        candidates.push({
          requestedSlot: entry.slot,
          productId: entry.productId ?? null,
          variantId: entry.variantId,
          assetId: entry.assetId ?? null,
          presetId: entry.presetId ?? null,
          variantMatchesProduct: false,
          compatibility: null,
        });
        continue;
      }

      if (params.requireActiveVariant && !variant.isActive) {
        candidates.push({
          requestedSlot: entry.slot,
          productId: variant.productId,
          variantId: variant.id,
          assetId: entry.assetId ?? null,
          presetId: entry.presetId ?? null,
          variantMatchesProduct: false,
          compatibility: null,
        });
        continue;
      }

      if (entry.productId && entry.productId !== variant.productId) {
        candidates.push({
          requestedSlot: entry.slot,
          productId: entry.productId,
          variantId: variant.id,
          assetId: entry.assetId ?? null,
          presetId: entry.presetId ?? null,
          variantMatchesProduct: false,
          compatibility: null,
        });
        continue;
      }

      const product = variant.product;
      const activeAsset = product.assets3d.find(
        (a) => a.status === 'READY' && a.isActiveVersion,
      );

      const isProductAvailable =
        product.deletedAt === null &&
        product.status === 'PUBLISHED' &&
        product.isVisible &&
        Boolean(activeAsset) &&
        (!entry.assetId || activeAsset?.id === entry.assetId);

      const compat = activeAsset
        ? parseOutfitCompatibilityConfig(activeAsset.config)
        : null;

      let presetMatchesAsset = true;
      if (entry.presetId && activeAsset) {
        const preset = activeAsset.customizationPresets.find(
          (p) => p.id === entry.presetId,
        );
        if (
          !preset ||
          !preset.isActive ||
          preset.assetId !== activeAsset.id ||
          preset.productId !== product.id
        ) {
          presetMatchesAsset = false;
        }
      } else if (entry.presetId && !activeAsset) {
        presetMatchesAsset = false;
      }

      candidates.push({
        requestedSlot: entry.slot,
        productId: product.id,
        variantId: variant.id,
        assetId: activeAsset?.id ?? null,
        presetId: entry.presetId ?? null,
        available: isProductAvailable,
        variantMatchesProduct: true,
        presetMatchesAsset,
        compatibility: compat,
      });

      if (activeAsset) {
        resolvedPersistedItems.push({
          slot: entry.slot,
          productId: product.id,
          variantId: variant.id,
          assetId: activeAsset.id,
          presetId: entry.presetId ?? null,
        });
      }
    }

    const evaluation = evaluateOutfitCompatibility({
      rigId: params.rigId,
      items: candidates,
    });

    if (!evaluation.valid) {
      toDomainHttpException(new IncompatibleOutfitSlotError(evaluation.violations));
    }

    return resolvedPersistedItems;
  }

  private async hydrateOutfitScenes(
    scenes: ReadonlyArray<OutfitSceneRecord>,
    tx?: PrismaTransactionClient,
  ): Promise<OutfitSceneDto[]> {
    if (scenes.length === 0) {
      return [];
    }

    const variantIds = new Set<string>();
    const presetIds = new Set<string>();

    for (const scene of scenes) {
      for (const item of parsePersistedOutfitItems(scene.items)) {
        variantIds.add(item.variantId);
        if (item.presetId) {
          presetIds.add(item.presetId);
        }
      }
    }

    const [variants, presets] = await Promise.all([
      this.outfitRepo.findVariantsForResolution(Array.from(variantIds), tx),
      this.outfitRepo.findPresetsForHydration(Array.from(presetIds), tx),
    ]);

    const variantsById = new Map(variants.map((v) => [v.id, v]));
    const presetsById = new Map(presets.map((p) => [p.id, p]));

    return scenes.map((scene) =>
      hydrateOutfitSceneDto({
        scene,
        variantsById,
        presetsById,
      }),
    );
  }
}
