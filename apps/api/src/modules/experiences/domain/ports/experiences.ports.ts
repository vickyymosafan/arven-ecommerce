import type { OutfitScenePersistedItemDto } from '@arven/contracts';
import type { ShowroomZoneStatusInput } from '@arven/validators';

export const SHOWROOM_REPOSITORY = Symbol('ARVEN_SHOWROOM_REPOSITORY');
export const OUTFIT_STUDIO_REPOSITORY = Symbol('ARVEN_OUTFIT_STUDIO_REPOSITORY');

export interface ShowroomZoneProductVariantRecord {
  readonly id: string;
  readonly priceIdr: bigint;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
}

export interface ShowroomZoneProductMediaRecord {
  readonly url: string;
  readonly altText: string | null;
  readonly isPrimary: boolean;
}

export interface ShowroomZoneProductRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly isVisible: boolean;
  readonly has3dEnabled: boolean;
  readonly deletedAt: Date | null;
  readonly variants: ReadonlyArray<ShowroomZoneProductVariantRecord>;
  readonly media: ReadonlyArray<ShowroomZoneProductMediaRecord>;
}

export interface ShowroomHotspotRecord {
  readonly id: string;
  readonly zoneId: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly label: string;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly product: ShowroomZoneProductRecord;
}

export interface ShowroomZoneRecord {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: ShowroomZoneStatusInput;
  readonly sortOrder: number;
  readonly sceneObjectKey: string;
  readonly liteSceneObjectKey: string | null;
  readonly posterKey: string;
  readonly sceneBytes: bigint;
  readonly liteSceneBytes: bigint | null;
  readonly cameraBaseline: unknown;
  readonly portals: unknown;
  readonly config: unknown;
  readonly publishedAt: Date | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly hotspots: ReadonlyArray<ShowroomHotspotRecord>;
}

export interface CreateShowroomZonePersistenceInput {
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: ShowroomZoneStatusInput;
  readonly sortOrder: number;
  readonly sceneObjectKey: string;
  readonly liteSceneObjectKey: string | null;
  readonly posterKey: string;
  readonly sceneBytes: bigint;
  readonly liteSceneBytes: bigint | null;
  readonly cameraBaseline: Record<string, unknown>;
  readonly portals: ReadonlyArray<Record<string, unknown>>;
  readonly config: Record<string, unknown>;
  readonly createdBy: string | null;
}

export interface UpdateShowroomZonePersistenceInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly sortOrder?: number;
  readonly sceneBytes?: bigint;
  readonly liteSceneBytes?: bigint | null;
  readonly cameraBaseline?: Record<string, unknown>;
  readonly portals?: ReadonlyArray<Record<string, unknown>>;
  readonly config?: Record<string, unknown>;
}

export interface CreateShowroomHotspotPersistenceInput {
  readonly zoneId: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly label: string;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface UpdateShowroomHotspotPersistenceInput {
  readonly variantId?: string | null;
  readonly label?: string;
  readonly positionX?: number;
  readonly positionY?: number;
  readonly positionZ?: number;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface ShowroomRepositoryPort {
  findPublishedZones(): Promise<ShowroomZoneRecord[]>;
  findPublishedZoneByCode(code: string): Promise<ShowroomZoneRecord | null>;
  findAllZones(): Promise<ShowroomZoneRecord[]>;
  findZoneById(id: string): Promise<ShowroomZoneRecord | null>;
  findZoneByCode(code: string): Promise<ShowroomZoneRecord | null>;
  findHotspotById(id: string): Promise<ShowroomHotspotRecord | null>;
}

export interface OutfitStudioPresetRecord {
  readonly id: string;
  readonly productId: string;
  readonly assetId: string;
  readonly code: string;
  readonly label: string;
  readonly swatchHex: string;
  readonly materialOverrides: unknown;
  readonly variantId: string | null;
  readonly variant: {
    readonly id: string;
    readonly sku: string;
    readonly color: string;
  } | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OutfitStudioInventoryLevelRecord {
  readonly quantityOnHand: number;
  readonly quantityReserved: number;
}

export interface OutfitStudioVariantRecord {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly size: string;
  readonly color: string;
  readonly colorHex: string | null;
  readonly priceIdr: bigint;
  readonly compareAtPriceIdr: bigint | null;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly inventoryLevels: ReadonlyArray<OutfitStudioInventoryLevelRecord>;
}

export interface OutfitStudioProductRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly material: string;
  readonly fit: string;
  readonly status: string;
  readonly isVisible: boolean;
  readonly deletedAt: Date | null;
  readonly variants: ReadonlyArray<OutfitStudioVariantRecord>;
}

export interface OutfitStudioAssetRecord {
  readonly id: string;
  readonly productId: string;
  readonly version: number;
  readonly status: string;
  readonly isActiveVersion: boolean;
  readonly objectKey: string;
  readonly mobileObjectKey: string | null;
  readonly posterKey: string;
  readonly config: unknown;
  readonly product: OutfitStudioProductRecord;
  readonly customizationPresets: ReadonlyArray<OutfitStudioPresetRecord>;
}

export interface OutfitSceneRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly title: string;
  readonly mannequinRigVersion: string;
  readonly items: unknown;
  readonly isPublicPreset: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OutfitResolvedVariantLookup {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly size: string;
  readonly color: string;
  readonly priceIdr: bigint;
  readonly compareAtPriceIdr: bigint | null;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly inventoryLevels: ReadonlyArray<OutfitStudioInventoryLevelRecord>;
  readonly product: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly status: string;
    readonly isVisible: boolean;
    readonly deletedAt: Date | null;
    readonly assets3d: ReadonlyArray<{
      readonly id: string;
      readonly version: number;
      readonly status: string;
      readonly isActiveVersion: boolean;
      readonly config: unknown;
      readonly customizationPresets: ReadonlyArray<{
        readonly id: string;
        readonly productId: string;
        readonly assetId: string;
        readonly code: string;
        readonly label: string;
        readonly swatchHex: string;
        readonly isActive: boolean;
      }>;
    }>;
  };
}

export interface OutfitStudioRepositoryPort {
  findActiveReadyGarmentAssets(): Promise<OutfitStudioAssetRecord[]>;
  findPublicPresets(): Promise<OutfitSceneRecord[]>;
  findPublicPresetById(id: string): Promise<OutfitSceneRecord | null>;
  findCustomerOutfits(userId: string): Promise<OutfitSceneRecord[]>;
  findCustomerOutfitById(id: string, userId: string): Promise<OutfitSceneRecord | null>;
  findVariantsForResolution(
    variantIds: ReadonlyArray<string>,
  ): Promise<OutfitResolvedVariantLookup[]>;
  findAssetsForHydration(
    assetIds: ReadonlyArray<string>,
  ): Promise<
    Array<{
      readonly id: string;
      readonly productId: string;
      readonly status: string;
      readonly isActiveVersion: boolean;
      readonly config: unknown;
    }>
  >;
  findPresetsForHydration(
    presetIds: ReadonlyArray<string>,
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
  >;
  countCustomerOutfits(userId: string): Promise<number>;
  normalizeItemsForPersistence(
    items: ReadonlyArray<OutfitScenePersistedItemDto>,
  ): OutfitScenePersistedItemDto[];
}
