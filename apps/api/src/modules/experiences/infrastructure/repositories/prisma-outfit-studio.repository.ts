import { Inject, Injectable } from '@nestjs/common';
import type { OutfitScenePersistedItemDto } from '@arven/contracts';
import {
  AssetStatus,
  WarehouseStatus,
  type Prisma,
  type PrismaTransactionClient,
} from '@arven/database';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import type {
  OutfitResolvedVariantLookup,
  OutfitSceneRecord,
  OutfitStudioAssetRecord,
  OutfitStudioRepositoryPort,
} from '../../domain/ports/experiences.ports.js';
import { sanitizePersistedOutfitItems } from '../mappers/experiences.mapper.js';

const OUTFIT_ASSET_INCLUDE = {
  product: {
    select: {
      id: true,
      slug: true,
      name: true,
      material: true,
      fit: true,
      status: true,
      isVisible: true,
      deletedAt: true,
      variants: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' as const }],
        select: {
          id: true,
          productId: true,
          sku: true,
          size: true,
          color: true,
          colorHex: true,
          priceIdr: true,
          compareAtPriceIdr: true,
          isActive: true,
          deletedAt: true,
          inventoryLevels: {
            where: {
              warehouse: { status: WarehouseStatus.ACTIVE },
            },
            select: {
              quantityOnHand: true,
              quantityReserved: true,
            },
          },
        },
      },
    },
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

@Injectable()
export class PrismaOutfitStudioRepository implements OutfitStudioRepositoryPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findActiveReadyGarmentAssets(): Promise<OutfitStudioAssetRecord[]> {
    return this.prisma.client.product3DAsset.findMany({
      where: {
        status: AssetStatus.READY,
        isActiveVersion: true,
        product: {
          deletedAt: null,
        },
      },
      include: OUTFIT_ASSET_INCLUDE,
      orderBy: [{ product: { name: 'asc' } }, { version: 'desc' }],
    });
  }

  async findAssetByIdWithProduct(
    id: string,
    tx?: PrismaTransactionClient,
  ): Promise<OutfitStudioAssetRecord | null> {
    const db = tx ?? this.prisma.client;
    return db.product3DAsset.findUnique({
      where: { id },
      include: OUTFIT_ASSET_INCLUDE,
    });
  }

  async findPublicPresets(tx?: PrismaTransactionClient): Promise<OutfitSceneRecord[]> {
    const db = tx ?? this.prisma.client;
    return db.outfitScene.findMany({
      where: { isPublicPreset: true },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findPublicPresetById(
    id: string,
    tx?: PrismaTransactionClient,
  ): Promise<OutfitSceneRecord | null> {
    const db = tx ?? this.prisma.client;
    return db.outfitScene.findFirst({
      where: { id, isPublicPreset: true },
    });
  }

  async findCustomerOutfits(
    userId: string,
    tx?: PrismaTransactionClient,
  ): Promise<OutfitSceneRecord[]> {
    const db = tx ?? this.prisma.client;
    return db.outfitScene.findMany({
      where: {
        userId,
        isPublicPreset: false,
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async findCustomerOutfitById(
    id: string,
    userId: string,
    tx?: PrismaTransactionClient,
  ): Promise<OutfitSceneRecord | null> {
    const db = tx ?? this.prisma.client;
    return db.outfitScene.findFirst({
      where: {
        id,
        userId,
        isPublicPreset: false,
      },
    });
  }

  async countCustomerOutfits(
    userId: string,
    tx?: PrismaTransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma.client;
    return db.outfitScene.count({
      where: {
        userId,
        isPublicPreset: false,
      },
    });
  }

  async findVariantsForResolution(
    variantIds: ReadonlyArray<string>,
    tx?: PrismaTransactionClient,
  ): Promise<OutfitResolvedVariantLookup[]> {
    if (variantIds.length === 0) {
      return [];
    }
    const db = tx ?? this.prisma.client;
    return db.productVariant.findMany({
      where: {
        id: { in: [...variantIds] },
      },
      select: {
        id: true,
        productId: true,
        sku: true,
        size: true,
        color: true,
        priceIdr: true,
        compareAtPriceIdr: true,
        isActive: true,
        deletedAt: true,
        inventoryLevels: {
          where: {
            warehouse: { status: WarehouseStatus.ACTIVE },
          },
          select: {
            quantityOnHand: true,
            quantityReserved: true,
          },
        },
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            isVisible: true,
            deletedAt: true,
            assets3d: {
              where: {
                isActiveVersion: true,
                status: AssetStatus.READY,
              },
              orderBy: [{ version: 'desc' }],
              select: {
                id: true,
                version: true,
                status: true,
                isActiveVersion: true,
                config: true,
                customizationPresets: {
                  select: {
                    id: true,
                    productId: true,
                    assetId: true,
                    code: true,
                    label: true,
                    swatchHex: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findAssetsForHydration(
    assetIds: ReadonlyArray<string>,
    tx?: PrismaTransactionClient,
  ): Promise<
    Array<{
      readonly id: string;
      readonly productId: string;
      readonly status: string;
      readonly isActiveVersion: boolean;
      readonly config: unknown;
    }>
  > {
    if (assetIds.length === 0) {
      return [];
    }
    const db = tx ?? this.prisma.client;
    return db.product3DAsset.findMany({
      where: { id: { in: [...assetIds] } },
      select: {
        id: true,
        productId: true,
        status: true,
        isActiveVersion: true,
        config: true,
      },
    });
  }

  async findPresetsForHydration(
    presetIds: ReadonlyArray<string>,
    tx?: PrismaTransactionClient,
  ): Promise<
    Array<{
      readonly id: string;
      readonly assetId: string;
      readonly productId: string;
      readonly code: string;
      readonly label: string;
      readonly swatchHex: string;
      readonly isActive: boolean;
    }>
  > {
    if (presetIds.length === 0) {
      return [];
    }
    const db = tx ?? this.prisma.client;
    return db.customizationPreset.findMany({
      where: { id: { in: [...presetIds] } },
      select: {
        id: true,
        assetId: true,
        productId: true,
        code: true,
        label: true,
        swatchHex: true,
        isActive: true,
      },
    });
  }

  normalizeItemsForPersistence(
    items: ReadonlyArray<OutfitScenePersistedItemDto>,
  ): OutfitScenePersistedItemDto[] {
    return sanitizePersistedOutfitItems(items);
  }
}
