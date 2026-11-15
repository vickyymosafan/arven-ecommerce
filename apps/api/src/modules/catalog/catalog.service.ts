import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AdminCategoryDto,
  AdminCollectionDto,
  AdminProductDetailDto,
  AdminProductSummaryDto,
  AdminProductVariantDto,
  CategoryNodeDto,
  CollectionDetailDto,
  CollectionSummaryDto,
  ProductCardDto,
  ProductDetailDto,
  ProductMediaDto,
  ProductVariantPublicDto,
  PublishGateCheckItemDto,
  PublishGateEvaluationDto,
  SizeGuideDataDto,
} from '@arven/contracts';
import {
  CollectionStatus,
  InventoryMovementType,
  MediaType,
  ProductStatus,
  WarehouseStatus,
  type Prisma,
  type PrismaTransactionClient,
} from '@arven/database';
import type {
  AdminProductsQuery,
  CreateCategoryRequest,
  CreateCollectionRequest,
  CreateProductMediaRequest,
  CreateProductRequest,
  CreateProductVariantRequest,
  PublicProductsQuery,
  StockStatus,
  TransitionProductStatusRequest,
  UpdateCategoryRequest,
  UpdateCollectionRequest,
  UpdateProductMediaRequest,
  UpdateProductRequest,
  UpdateProductVariantRequest,
} from '@arven/validators';
import { DomainHttpException, type PaginatedResponse } from '../../common/http/index.js';
import type { AuthenticatedActor } from '../../common/security/index.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../audit-notifications/audit-log.service.js';
import { OutboxWriterService } from '../audit-notifications/outbox-writer.service.js';

const DEFAULT_WAREHOUSE_CODE = 'JKT-MAIN-01';

const PRODUCT_RELATIONS_INCLUDE = {
  productCategories: {
    include: {
      category: true,
    },
  },
  collectionProducts: {
    include: {
      collection: true,
    },
    orderBy: {
      position: 'asc' as const,
    },
  },
  variants: {
    where: {
      deletedAt: null,
    },
    include: {
      inventoryLevels: {
        include: {
          warehouse: {
            select: {
              id: true,
              code: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
  media: {
    orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.ProductInclude;

type LoadedProduct = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_RELATIONS_INCLUDE;
}>;

function computeStockMetrics(
  inventoryLevels: ReadonlyArray<{
    readonly quantityOnHand: number;
    readonly quantityReserved: number;
    readonly lowStockThreshold: number;
    readonly warehouse?: { readonly status: WarehouseStatus } | null;
  }>,
): {
  readonly quantityOnHand: number;
  readonly quantityReserved: number;
  readonly availableQty: number;
  readonly lowStockThreshold: number;
  readonly stockStatus: StockStatus;
} {
  let quantityOnHand = 0;
  let quantityReserved = 0;
  let lowStockThreshold = 5;

  for (const level of inventoryLevels) {
    if (level.warehouse && level.warehouse.status !== WarehouseStatus.ACTIVE) {
      continue;
    }
    quantityOnHand += level.quantityOnHand;
    quantityReserved += level.quantityReserved;
    lowStockThreshold = Math.max(lowStockThreshold, level.lowStockThreshold);
  }

  const availableQty = Math.max(0, quantityOnHand - quantityReserved);
  const stockStatus: StockStatus =
    availableQty <= 0
      ? 'OUT_OF_STOCK'
      : availableQty <= lowStockThreshold
        ? 'LOW_STOCK'
        : 'IN_STOCK';

  return {
    quantityOnHand,
    quantityReserved,
    availableQty,
    lowStockThreshold,
    stockStatus,
  };
}

function toSizeGuideDto(raw: unknown): SizeGuideDataDto | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).length === 0) {
    return null;
  }
  return record as SizeGuideDataDto;
}

function normalizePrismaMediaType(type: ProductMediaDto['type'] | MediaType): MediaType {
  if (type === 'POSTER_3D') {
    return MediaType.POSTER;
  }
  if (type === 'VIDEO_PREVIEW') {
    return MediaType.VIDEO;
  }
  return type as MediaType;
}

function mapMediaDto(row: {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly type: MediaType | ProductMediaDto['type'];
  readonly url: string;
  readonly altText: string;
  readonly position: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly isPrimary: boolean;
}): ProductMediaDto {
  return {
    id: row.id,
    productId: row.productId,
    variantId: row.variantId,
    type: row.type as ProductMediaDto['type'],
    url: row.url,
    altText: row.altText,
    position: row.position,
    width: row.width,
    height: row.height,
    isPrimary: row.isPrimary,
  };
}

export function evaluateProductPublishGate(product: LoadedProduct): PublishGateEvaluationDto {
  const coreIssues: Array<{ field: string; issue: string }> = [];
  if (!product.name.trim()) {
    coreIssues.push({ field: 'name', issue: 'Product name is required' });
  }
  if (!product.slug.trim()) {
    coreIssues.push({ field: 'slug', issue: 'Product slug is required' });
  }
  if (!product.description.trim()) {
    coreIssues.push({ field: 'description', issue: 'Product description is required' });
  }
  if (!product.material.trim()) {
    coreIssues.push({ field: 'material', issue: 'Product material specification is required' });
  }
  if (!product.fit.trim()) {
    coreIssues.push({ field: 'fit', issue: 'Product fit specification is required' });
  }
  if (!product.careInstruction.trim()) {
    coreIssues.push({
      field: 'careInstruction',
      issue: 'Product care instruction is required',
    });
  }

  const activeCategories = product.productCategories.filter(
    (pc) => pc.category.isActive && pc.category.deletedAt === null,
  );
  if (activeCategories.length === 0) {
    coreIssues.push({
      field: 'categoryIds',
      issue: 'At least one active category must be assigned',
    });
  }

  const variantIssues: Array<{ field: string; issue: string }> = [];
  const activeVariants = product.variants.filter((v) => v.isActive && v.deletedAt === null);
  if (activeVariants.length === 0) {
    variantIssues.push({
      field: 'variants',
      issue: 'At least one active variant is required before publishing',
    });
  } else {
    const seenSkus = new Set<string>();
    for (const variant of activeVariants) {
      if (!variant.sku.trim()) {
        variantIssues.push({ field: 'variants.sku', issue: 'Variant SKU must not be empty' });
      } else if (seenSkus.has(variant.sku)) {
        variantIssues.push({
          field: 'variants.sku',
          issue: `Duplicate SKU "${variant.sku}" on product`,
        });
      } else {
        seenSkus.add(variant.sku);
      }

      if (!variant.size.trim() || !variant.color.trim()) {
        variantIssues.push({
          field: `variants[${variant.sku}].attributes`,
          issue: `Variant ${variant.sku} must have both size and color`,
        });
      }
      if (variant.priceIdr < 0n) {
        variantIssues.push({
          field: `variants[${variant.sku}].priceIdr`,
          issue: `Variant ${variant.sku} priceIdr must be non-negative`,
        });
      }
      if (variant.weightGrams <= 0) {
        variantIssues.push({
          field: `variants[${variant.sku}].weightGrams`,
          issue: `Variant ${variant.sku} weightGrams must be positive`,
        });
      }
      if (variant.inventoryLevels.length === 0) {
        variantIssues.push({
          field: `variants[${variant.sku}].inventoryLevels`,
          issue: `Variant ${variant.sku} has no initialized warehouse inventory level`,
        });
      }
    }
  }

  const seoAndSizeGuideIssues: Array<{ field: string; issue: string }> = [];
  if (!product.seoTitle || !product.seoTitle.trim()) {
    seoAndSizeGuideIssues.push({
      field: 'seoTitle',
      issue: 'SEO title is required before publishing',
    });
  }
  if (!product.seoDescription || !product.seoDescription.trim()) {
    seoAndSizeGuideIssues.push({
      field: 'seoDescription',
      issue: 'SEO description is required before publishing',
    });
  }

  const primaryCategoryLink =
    activeCategories.find((pc) => pc.isPrimary) ?? activeCategories[0];
  const resolvedSizeGuide =
    toSizeGuideDto(product.sizeGuideOverride) ??
    toSizeGuideDto(primaryCategoryLink?.category.sizeGuide);
  if (!resolvedSizeGuide) {
    seoAndSizeGuideIssues.push({
      field: 'sizeGuide',
      issue: 'Either product sizeGuideOverride or category sizeGuideJson must be configured',
    });
  }

  const mediaIssues: Array<{ field: string; issue: string }> = [];
  if (product.media.length === 0) {
    mediaIssues.push({
      field: 'media',
      issue: 'At least one product media item is required',
    });
  } else {
    const hasPrimary = product.media.some((m) => m.isPrimary);
    if (!hasPrimary) {
      mediaIssues.push({
        field: 'media.isPrimary',
        issue: 'At least one media item must be marked as primary (isPrimary = true)',
      });
    }
    for (const m of product.media) {
      if (!m.url.trim()) {
        mediaIssues.push({
          field: `media[${m.position}].url`,
          issue: `Media item at position ${m.position} has an empty URL`,
        });
      }
      if (!m.altText.trim()) {
        mediaIssues.push({
          field: `media[${m.position}].altText`,
          issue: `Media item at position ${m.position} requires non-empty altText`,
        });
      }
    }
  }

  const checks: PublishGateCheckItemDto[] = [
    {
      key: 'CORE_METADATA',
      label: 'Core product metadata & active category',
      passed: coreIssues.length === 0,
      issues: coreIssues,
    },
    {
      key: 'ACTIVE_VARIANTS_AND_INVENTORY',
      label: 'Active SKU variants, pricing, weight & warehouse inventory level',
      passed: variantIssues.length === 0,
      issues: variantIssues,
    },
    {
      key: 'SEO_AND_SIZE_GUIDE',
      label: 'SEO metadata & size guide configuration',
      passed: seoAndSizeGuideIssues.length === 0,
      issues: seoAndSizeGuideIssues,
    },
    {
      key: 'MEDIA_AND_ALT_TEXT',
      label: 'Primary image, gallery media & accessible alt text',
      passed: mediaIssues.length === 0,
      issues: mediaIssues,
    },
  ];

  const allIssues = [
    ...coreIssues,
    ...variantIssues,
    ...seoAndSizeGuideIssues,
    ...mediaIssues,
  ];

  return {
    canPublish: allIssues.length === 0,
    unmetCount: allIssues.length,
    checks,
    issues: allIssues,
  };
}

function mapProductCardDto(product: LoadedProduct): ProductCardDto {
  const activeVariants = product.variants.filter((v) => v.isActive && v.deletedAt === null);

  let minPrice = 0;
  let compareAtPriceIdr: number | null = null;
  let totalAvailable = 0;
  let maxThreshold = 5;

  const sizesSet = new Set<string>();
  const colorsMap = new Map<string, string | null>();

  for (const [idx, variant] of activeVariants.entries()) {
    const priceNum = Number(variant.priceIdr);
    const compareNum =
      variant.compareAtPriceIdr !== null ? Number(variant.compareAtPriceIdr) : null;

    if (idx === 0 || priceNum < minPrice) {
      minPrice = priceNum;
      compareAtPriceIdr = compareNum;
    }

    const stock = computeStockMetrics(variant.inventoryLevels);
    totalAvailable += stock.availableQty;
    maxThreshold = Math.max(maxThreshold, stock.lowStockThreshold);

    sizesSet.add(variant.size);
    if (!colorsMap.has(variant.color)) {
      colorsMap.set(variant.color, variant.colorHex);
    }
  }

  const stockStatus: StockStatus =
    totalAvailable <= 0
      ? 'OUT_OF_STOCK'
      : totalAvailable <= maxThreshold
        ? 'LOW_STOCK'
        : 'IN_STOCK';

  const activeCategories = product.productCategories.filter(
    (pc) => pc.category.isActive && pc.category.deletedAt === null,
  );
  const primaryCategoryLink =
    activeCategories.find((pc) => pc.isPrimary) ?? activeCategories[0] ?? null;

  const primaryMediaRow =
    product.media.find((m) => m.isPrimary) ?? product.media[0] ?? null;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    material: product.material,
    fit: product.fit,
    priceIdr: minPrice,
    compareAtPriceIdr,
    isFeatured: product.isFeatured,
    has3dEnabled: product.has3dEnabled,
    inStock: totalAvailable > 0,
    stockStatus,
    primaryCategory: primaryCategoryLink
      ? {
          id: primaryCategoryLink.category.id,
          slug: primaryCategoryLink.category.slug,
          name: primaryCategoryLink.category.name,
        }
      : null,
    collections: product.collectionProducts
      .filter(
        (cp) =>
          cp.collection.status === CollectionStatus.PUBLISHED &&
          cp.collection.deletedAt === null,
      )
      .map((cp) => ({
        id: cp.collection.id,
        slug: cp.collection.slug,
        name: cp.collection.name,
      })),
    primaryMedia: primaryMediaRow ? mapMediaDto(primaryMediaRow) : null,
    availableSizes: Array.from(sizesSet),
    availableColors: Array.from(colorsMap.entries()).map(([color, colorHex]) => ({
      color,
      colorHex,
    })),
    publishedAt: product.publishedAt ? product.publishedAt.toISOString() : null,
  };
}

function mapAdminVariantDto(
  variant: LoadedProduct['variants'][number],
): AdminProductVariantDto {
  const stock = computeStockMetrics(variant.inventoryLevels);
  const hasDimensions =
    variant.lengthCm !== null || variant.widthCm !== null || variant.heightCm !== null;

  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    barcode: null,
    size: variant.size,
    color: variant.color,
    colorHex: variant.colorHex,
    priceIdr: Number(variant.priceIdr),
    compareAtPriceIdr:
      variant.compareAtPriceIdr !== null ? Number(variant.compareAtPriceIdr) : null,
    weightGrams: variant.weightGrams,
    dimensionsJson: hasDimensions
      ? {
          ...(variant.lengthCm !== null ? { lengthCm: variant.lengthCm } : {}),
          ...(variant.widthCm !== null ? { widthCm: variant.widthCm } : {}),
          ...(variant.heightCm !== null ? { heightCm: variant.heightCm } : {}),
        }
      : null,
    isActive: variant.isActive,
    quantityOnHand: stock.quantityOnHand,
    quantityReserved: stock.quantityReserved,
    availableQty: stock.availableQty,
    lowStockThreshold: stock.lowStockThreshold,
    stockStatus: stock.stockStatus,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
}

function mapAdminProductSummaryDto(product: LoadedProduct): AdminProductSummaryDto {
  const card = mapProductCardDto(product);
  const gate = evaluateProductPublishGate(product);
  const activeVariants = product.variants.filter((v) => v.deletedAt === null);

  let totalAvailableStock = 0;
  for (const variant of activeVariants) {
    if (variant.isActive) {
      totalAvailableStock += computeStockMetrics(variant.inventoryLevels).availableQty;
    }
  }

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    status: product.status,
    isVisible: product.isVisible,
    isFeatured: product.isFeatured,
    has3dEnabled: product.has3dEnabled,
    priceIdr: card.priceIdr,
    compareAtPriceIdr: card.compareAtPriceIdr,
    variantCount: activeVariants.length,
    totalAvailableStock,
    primaryCategory: card.primaryCategory,
    collections: product.collectionProducts
      .filter((cp) => cp.collection.deletedAt === null)
      .map((cp) => ({
        id: cp.collection.id,
        slug: cp.collection.slug,
        name: cp.collection.name,
      })),
    primaryMedia: card.primaryMedia,
    publishGate: {
      canPublish: gate.canPublish,
      unmetCount: gate.unmetCount,
    },
    publishedAt: product.publishedAt ? product.publishedAt.toISOString() : null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function mapAdminProductDetailDto(product: LoadedProduct): AdminProductDetailDto {
  const gate = evaluateProductPublishGate(product);
  const activeCategories = product.productCategories.filter(
    (pc) => pc.category.deletedAt === null,
  );
  const primaryCategoryLink =
    activeCategories.find((pc) => pc.isPrimary) ?? activeCategories[0] ?? null;

  const sizeGuideOverride = toSizeGuideDto(product.sizeGuideOverride);
  const effectiveSizeGuide =
    sizeGuideOverride ?? toSizeGuideDto(primaryCategoryLink?.category.sizeGuide);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    material: product.material,
    fit: product.fit,
    careInstruction: product.careInstruction,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    status: product.status,
    isVisible: product.isVisible,
    isFeatured: product.isFeatured,
    has3dEnabled: product.has3dEnabled,
    sizeGuideOverride,
    effectiveSizeGuide,
    categories: activeCategories.map((pc) => ({
      id: pc.category.id,
      slug: pc.category.slug,
      name: pc.category.name,
      isPrimary: pc.isPrimary,
    })),
    collections: product.collectionProducts
      .filter((cp) => cp.collection.deletedAt === null)
      .map((cp) => ({
        id: cp.collection.id,
        slug: cp.collection.slug,
        name: cp.collection.name,
        position: cp.position,
      })),
    variants: product.variants.map(mapAdminVariantDto),
    media: product.media.map(mapMediaDto),
    publishGate: gate,
    publishedAt: product.publishedAt ? product.publishedAt.toISOString() : null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
    @Inject(OutboxWriterService) private readonly outboxWriter: OutboxWriterService,
  ) {}

  // ===========================================================================
  // Public Catalog Queries
  // ===========================================================================

  async listPublicCategories(): Promise<CategoryNodeDto[]> {
    const categories = await this.prisma.client.category.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        productCategories: {
          include: {
            product: {
              select: {
                id: true,
                status: true,
                isVisible: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });

    const nodeMap = new Map<string, CategoryNodeDto>();
    for (const cat of categories) {
      const publishedCount = cat.productCategories.filter(
        (pc) =>
          pc.product.status === ProductStatus.PUBLISHED &&
          pc.product.isVisible &&
          pc.product.deletedAt === null,
      ).length;

      nodeMap.set(cat.id, {
        id: cat.id,
        slug: cat.slug,
        name: cat.name,
        description: cat.description,
        parentId: cat.parentId,
        sortOrder: cat.sortOrder,
        productCount: publishedCount,
        sizeGuideJson: toSizeGuideDto(cat.sizeGuide),
        children: [],
      });
    }

    const roots: CategoryNodeDto[] = [];
    for (const node of nodeMap.values()) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async listPublicCollections(): Promise<CollectionSummaryDto[]> {
    const now = new Date();
    const collections = await this.prisma.client.collection.findMany({
      where: {
        status: CollectionStatus.PUBLISHED,
        deletedAt: null,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        collectionProducts: {
          orderBy: { position: 'asc' },
          include: {
            product: {
              include: PRODUCT_RELATIONS_INCLUDE,
            },
          },
        },
      },
    });

    return collections.map((col) => {
      const publishedProducts = col.collectionProducts
        .map((cp) => cp.product)
        .filter(
          (p) =>
            p.status === ProductStatus.PUBLISHED &&
            p.isVisible &&
            p.deletedAt === null,
        )
        .map(mapProductCardDto);

      return {
        id: col.id,
        slug: col.slug,
        name: col.name,
        description: col.description,
        bannerUrl: col.heroMediaUrl,
        startsAt: col.startsAt ? col.startsAt.toISOString() : null,
        endsAt: col.endsAt ? col.endsAt.toISOString() : null,
        productCount: publishedProducts.length,
        featuredProducts: publishedProducts.slice(0, 4),
      };
    });
  }

  async getPublicCollectionBySlug(slug: string): Promise<CollectionDetailDto> {
    const now = new Date();
    const collection = await this.prisma.client.collection.findFirst({
      where: {
        slug,
        status: CollectionStatus.PUBLISHED,
        deletedAt: null,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: {
        collectionProducts: {
          orderBy: { position: 'asc' },
          include: {
            product: {
              include: PRODUCT_RELATIONS_INCLUDE,
            },
          },
        },
      },
    });

    if (!collection) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        `Collection "${slug}" was not found`,
      );
    }

    const products = collection.collectionProducts
      .map((cp) => cp.product)
      .filter(
        (p) =>
          p.status === ProductStatus.PUBLISHED &&
          p.isVisible &&
          p.deletedAt === null,
      )
      .map(mapProductCardDto);

    return {
      id: collection.id,
      slug: collection.slug,
      name: collection.name,
      description: collection.description,
      bannerUrl: collection.heroMediaUrl,
      startsAt: collection.startsAt ? collection.startsAt.toISOString() : null,
      endsAt: collection.endsAt ? collection.endsAt.toISOString() : null,
      productCount: products.length,
      products,
    };
  }

  async listPublicProducts(
    query: PublicProductsQuery,
  ): Promise<PaginatedResponse<ProductCardDto>> {
    const andFilters: Prisma.ProductWhereInput[] = [
      {
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        deletedAt: null,
      },
    ];

    if (query.featured !== undefined) {
      andFilters.push({ isFeatured: query.featured });
    }

    if (query.category) {
      andFilters.push({
        productCategories: {
          some: {
            category: {
              isActive: true,
              deletedAt: null,
              OR: [
                { slug: query.category },
                { parent: { slug: query.category } },
              ],
            },
          },
        },
      });
    }

    if (query.collection) {
      andFilters.push({
        collectionProducts: {
          some: {
            collection: {
              slug: query.collection,
              status: CollectionStatus.PUBLISHED,
              deletedAt: null,
            },
          },
        },
      });
    }

    const variantFilters: Prisma.ProductVariantWhereInput = {
      isActive: true,
      deletedAt: null,
    };
    let hasVariantFilter = false;

    if (query.size) {
      variantFilters.size = { equals: query.size, mode: 'insensitive' };
      hasVariantFilter = true;
    }
    if (query.color) {
      variantFilters.color = { equals: query.color, mode: 'insensitive' };
      hasVariantFilter = true;
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      variantFilters.priceIdr = {
        ...(query.minPrice !== undefined ? { gte: BigInt(query.minPrice) } : {}),
        ...(query.maxPrice !== undefined ? { lte: BigInt(query.maxPrice) } : {}),
      };
      hasVariantFilter = true;
    }

    if (hasVariantFilter) {
      andFilters.push({
        variants: {
          some: variantFilters,
        },
      });
    }

    if (query.q) {
      const search = query.q;
      andFilters.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { material: { contains: search, mode: 'insensitive' } },
          {
            productCategories: {
              some: {
                category: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
            },
          },
          {
            variants: {
              some: {
                isActive: true,
                deletedAt: null,
                sku: { contains: search, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }

    const where: Prisma.ProductWhereInput = { AND: andFilters };

    const matchingProducts = await this.prisma.client.product.findMany({
      where,
      include: PRODUCT_RELATIONS_INCLUDE,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    let cards = matchingProducts.map(mapProductCardDto);

    if (query.inStock !== undefined) {
      cards = cards.filter((c) => c.inStock === query.inStock);
    }

    if (query.sort === 'price_asc') {
      cards.sort((a, b) => a.priceIdr - b.priceIdr || a.name.localeCompare(b.name));
    } else if (query.sort === 'price_desc') {
      cards.sort((a, b) => b.priceIdr - a.priceIdr || a.name.localeCompare(b.name));
    } else if (query.sort === 'featured') {
      cards.sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) {
          return a.isFeatured ? -1 : 1;
        }
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      });
    }

    const total = cards.length;
    const skip = (query.page - 1) * query.limit;
    const items = cards.slice(skip, skip + query.limit);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getPublicProductBySlug(slug: string): Promise<ProductDetailDto> {
    const candidateSlugs =
      slug === 'essential-heavyweight-tee'
        ? [slug, 'essentials-heavyweight-crew-tee']
        : [slug];

    const product = await this.prisma.client.product.findFirst({
      where: {
        slug: { in: candidateSlugs },
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        deletedAt: null,
      },
      include: PRODUCT_RELATIONS_INCLUDE,
    });

    if (!product) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        `Product "${slug}" was not found`,
      );
    }

    const card = mapProductCardDto(product);
    const activeVariants: ProductVariantPublicDto[] = product.variants
      .filter((v) => v.isActive && v.deletedAt === null)
      .map((v) => {
        const stock = computeStockMetrics(v.inventoryLevels);
        return {
          id: v.id,
          sku: v.sku,
          size: v.size,
          color: v.color,
          colorHex: v.colorHex,
          priceIdr: Number(v.priceIdr),
          compareAtPriceIdr:
            v.compareAtPriceIdr !== null ? Number(v.compareAtPriceIdr) : null,
          weightGrams: v.weightGrams,
          availableQty: stock.availableQty,
          lowStockThreshold: stock.lowStockThreshold,
          stockStatus: stock.stockStatus,
        };
      });

    const activeCategories = product.productCategories.filter(
      (pc) => pc.category.isActive && pc.category.deletedAt === null,
    );
    const primaryCategoryLink =
      activeCategories.find((pc) => pc.isPrimary) ?? activeCategories[0] ?? null;

    const sizeGuide =
      toSizeGuideDto(product.sizeGuideOverride) ??
      toSizeGuideDto(primaryCategoryLink?.category.sizeGuide);

    const categoryIds = activeCategories.map((pc) => pc.categoryId);
    const collectionIds = product.collectionProducts.map((cp) => cp.collectionId);

    const relatedRows = await this.prisma.client.product.findMany({
      where: {
        id: { not: product.id },
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        deletedAt: null,
        ...(categoryIds.length > 0 || collectionIds.length > 0
          ? {
              OR: [
                ...(categoryIds.length > 0
                  ? [{ productCategories: { some: { categoryId: { in: categoryIds } } } }]
                  : []),
                ...(collectionIds.length > 0
                  ? [
                      {
                        collectionProducts: {
                          some: { collectionId: { in: collectionIds } },
                        },
                      },
                    ]
                  : []),
              ],
            }
          : {}),
      },
      take: 4,
      orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
      include: PRODUCT_RELATIONS_INCLUDE,
    });

    const media = product.media.map(mapMediaDto);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      material: product.material,
      fit: product.fit,
      careInstruction: product.careInstruction,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      isFeatured: product.isFeatured,
      has3dEnabled: product.has3dEnabled,
      priceIdr: card.priceIdr,
      compareAtPriceIdr: card.compareAtPriceIdr,
      inStock: card.inStock,
      stockStatus: card.stockStatus,
      primaryCategory: card.primaryCategory,
      categories: activeCategories.map((pc) => ({
        id: pc.category.id,
        slug: pc.category.slug,
        name: pc.category.name,
        isPrimary: pc.isPrimary,
      })),
      collections: card.collections,
      variants: activeVariants,
      media,
      primaryMedia: card.primaryMedia,
      sizeGuide,
      relatedProducts: relatedRows.map(mapProductCardDto),
      publishedAt: product.publishedAt ? product.publishedAt.toISOString() : null,
    };
  }

  // ===========================================================================
  // Admin Product Operations
  // ===========================================================================

  async listAdminProducts(
    query: AdminProductsQuery,
  ): Promise<PaginatedResponse<AdminProductSummaryDto>> {
    const andFilters: Prisma.ProductWhereInput[] = [{ deletedAt: null }];

    if (query.status) {
      andFilters.push({ status: query.status });
    }

    if (query.category) {
      andFilters.push({
        productCategories: {
          some: {
            category: {
              OR: [{ slug: query.category }, { id: this.isUuid(query.category) ? query.category : undefined }],
            },
          },
        },
      });
    }

    if (query.collection) {
      andFilters.push({
        collectionProducts: {
          some: {
            collection: {
              OR: [
                { slug: query.collection },
                { id: this.isUuid(query.collection) ? query.collection : undefined },
              ],
            },
          },
        },
      });
    }

    if (query.q) {
      const search = query.q;
      andFilters.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
          {
            variants: {
              some: {
                deletedAt: null,
                sku: { contains: search, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }

    const where: Prisma.ProductWhereInput = { AND: andFilters };
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.product.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: PRODUCT_RELATIONS_INCLUDE,
      }),
      this.prisma.client.product.count({ where }),
    ]);

    return {
      items: rows.map(mapAdminProductSummaryDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getAdminProductById(productId: string): Promise<AdminProductDetailDto> {
    const product = await this.loadProductOrThrow(this.prisma.client, productId);
    return mapAdminProductDetailDto(product);
  }

  async createProduct(
    actor: AuthenticatedActor,
    input: CreateProductRequest,
    ipAddress?: string | null,
  ): Promise<AdminProductDetailDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existingSlug = await tx.product.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (existingSlug) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CONFLICT',
          `Product with slug "${input.slug}" already exists`,
        );
      }

      const uniqueCategoryIds = Array.from(
        new Set([
          ...input.categoryIds,
          ...(input.primaryCategoryId ? [input.primaryCategoryId] : []),
        ]),
      );

      if (uniqueCategoryIds.length > 0) {
        const categories = await tx.category.findMany({
          where: { id: { in: uniqueCategoryIds }, deletedAt: null },
          select: { id: true },
        });
        if (categories.length !== uniqueCategoryIds.length) {
          throw new DomainHttpException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'One or more categoryIds do not exist',
          );
        }
      }

      const uniqueCollectionIds = Array.from(new Set(input.collectionIds));
      if (uniqueCollectionIds.length > 0) {
        const collections = await tx.collection.findMany({
          where: { id: { in: uniqueCollectionIds }, deletedAt: null },
          select: { id: true },
        });
        if (collections.length !== uniqueCollectionIds.length) {
          throw new DomainHttpException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'One or more collectionIds do not exist',
          );
        }
      }

      const primaryCatId = input.primaryCategoryId ?? uniqueCategoryIds[0] ?? null;

      const created = await tx.product.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          material: input.material,
          fit: input.fit,
          careInstruction: input.careInstruction,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          status: ProductStatus.DRAFT,
          isVisible: input.isVisible,
          isFeatured: input.isFeatured,
          has3dEnabled: input.has3dEnabled,
          ...(input.sizeGuideOverride !== undefined && input.sizeGuideOverride !== null
            ? {
                sizeGuideOverride:
                  input.sizeGuideOverride as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(uniqueCategoryIds.length > 0
            ? {
                productCategories: {
                  create: uniqueCategoryIds.map((categoryId) => ({
                    categoryId,
                    isPrimary: categoryId === primaryCatId,
                  })),
                },
              }
            : {}),
          ...(uniqueCollectionIds.length > 0
            ? {
                collectionProducts: {
                  create: uniqueCollectionIds.map((collectionId, idx) => ({
                    collectionId,
                    position: idx + 1,
                  })),
                },
              }
            : {}),
        },
        select: { id: true },
      });

      const loaded = await this.loadProductOrThrow(tx, created.id);

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.created',
          resource: 'Product',
          resourceId: loaded.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            slug: loaded.slug,
            name: loaded.name,
            status: loaded.status,
            categoryIds: uniqueCategoryIds,
            collectionIds: uniqueCollectionIds,
          },
        },
        tx,
      );

      return mapAdminProductDetailDto(loaded);
    });
  }

  async updateProduct(
    actor: AuthenticatedActor,
    productId: string,
    input: UpdateProductRequest,
    ipAddress?: string | null,
  ): Promise<AdminProductDetailDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await this.loadProductOrThrow(tx, productId);

      if (input.slug && input.slug !== existing.slug) {
        const conflict = await tx.product.findUnique({
          where: { slug: input.slug },
          select: { id: true },
        });
        if (conflict && conflict.id !== productId) {
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'CONFLICT',
            `Product with slug "${input.slug}" already exists`,
          );
        }
      }

      if (input.categoryIds !== undefined || input.primaryCategoryId !== undefined) {
        const currentIds = existing.productCategories.map((pc) => pc.categoryId);
        const baseIds = input.categoryIds ?? currentIds;
        const uniqueCategoryIds = Array.from(
          new Set([
            ...baseIds,
            ...(input.primaryCategoryId ? [input.primaryCategoryId] : []),
          ]),
        );

        if (uniqueCategoryIds.length > 0) {
          const categories = await tx.category.findMany({
            where: { id: { in: uniqueCategoryIds }, deletedAt: null },
            select: { id: true },
          });
          if (categories.length !== uniqueCategoryIds.length) {
            throw new DomainHttpException(
              HttpStatus.BAD_REQUEST,
              'VALIDATION_ERROR',
              'One or more categoryIds do not exist',
            );
          }
        }

        const primaryCatId =
          input.primaryCategoryId ??
          existing.productCategories.find((pc) => pc.isPrimary)?.categoryId ??
          uniqueCategoryIds[0] ??
          null;

        await tx.productCategory.deleteMany({ where: { productId } });
        if (uniqueCategoryIds.length > 0) {
          await tx.productCategory.createMany({
            data: uniqueCategoryIds.map((categoryId) => ({
              productId,
              categoryId,
              isPrimary: categoryId === primaryCatId,
            })),
          });
        }
      }

      if (input.collectionIds !== undefined) {
        const uniqueCollectionIds = Array.from(new Set(input.collectionIds));
        if (uniqueCollectionIds.length > 0) {
          const collections = await tx.collection.findMany({
            where: { id: { in: uniqueCollectionIds }, deletedAt: null },
            select: { id: true },
          });
          if (collections.length !== uniqueCollectionIds.length) {
            throw new DomainHttpException(
              HttpStatus.BAD_REQUEST,
              'VALIDATION_ERROR',
              'One or more collectionIds do not exist',
            );
          }
        }

        await tx.collectionProduct.deleteMany({ where: { productId } });
        if (uniqueCollectionIds.length > 0) {
          await tx.collectionProduct.createMany({
            data: uniqueCollectionIds.map((collectionId, idx) => ({
              collectionId,
              productId,
              position: idx + 1,
            })),
          });
        }
      }

      await tx.product.update({
        where: { id: productId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.material !== undefined ? { material: input.material } : {}),
          ...(input.fit !== undefined ? { fit: input.fit } : {}),
          ...(input.careInstruction !== undefined
            ? { careInstruction: input.careInstruction }
            : {}),
          ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
          ...(input.seoDescription !== undefined
            ? { seoDescription: input.seoDescription }
            : {}),
          ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
          ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
          ...(input.has3dEnabled !== undefined ? { has3dEnabled: input.has3dEnabled } : {}),
          ...(input.sizeGuideOverride !== undefined
            ? {
                sizeGuideOverride: (input.sizeGuideOverride ?? {}) as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      const reloaded = await this.loadProductOrThrow(tx, productId);

      if (
        reloaded.status === ProductStatus.PUBLISHED ||
        reloaded.status === ProductStatus.READY_TO_PUBLISH
      ) {
        const gate = evaluateProductPublishGate(reloaded);
        if (!gate.canPublish) {
          throw new DomainHttpException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'PUBLISH_GATE_UNMET',
            'Cannot save changes that invalidate the Publish Gate on a ready or published product',
            gate.issues,
          );
        }
      }

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.updated',
          resource: 'Product',
          resourceId: productId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            slug: existing.slug,
            name: existing.name,
            status: existing.status,
            isVisible: existing.isVisible,
            isFeatured: existing.isFeatured,
          },
          afterState: {
            slug: reloaded.slug,
            name: reloaded.name,
            status: reloaded.status,
            isVisible: reloaded.isVisible,
            isFeatured: reloaded.isFeatured,
          },
        },
        tx,
      );

      return mapAdminProductDetailDto(reloaded);
    });
  }

  async deleteProduct(
    actor: AuthenticatedActor,
    productId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await this.loadProductOrThrow(tx, productId);
      const now = new Date();

      await tx.product.update({
        where: { id: productId },
        data: {
          status: ProductStatus.ARCHIVED,
          isVisible: false,
          deletedAt: now,
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.deleted',
          resource: 'Product',
          resourceId: productId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            slug: existing.slug,
            name: existing.name,
            status: existing.status,
          },
          afterState: {
            status: ProductStatus.ARCHIVED,
            isVisible: false,
            deletedAt: now.toISOString(),
          },
        },
        tx,
      );
    });
  }

  async transitionProductStatus(
    actor: AuthenticatedActor,
    productId: string,
    input: TransitionProductStatusRequest,
    ipAddress?: string | null,
  ): Promise<AdminProductDetailDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await this.loadProductOrThrow(tx, productId);
      const target = input.targetStatus as ProductStatus;

      if (existing.status === target) {
        return mapAdminProductDetailDto(existing);
      }

      if (
        target === ProductStatus.READY_TO_PUBLISH ||
        target === ProductStatus.PUBLISHED
      ) {
        const gate = evaluateProductPublishGate(existing);
        if (!gate.canPublish) {
          throw new DomainHttpException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'PUBLISH_GATE_UNMET',
            `Product "${existing.slug}" cannot transition to ${target} because Publish Gate checks failed`,
            gate.issues,
          );
        }
      }

      const allowedTransitions: Readonly<Record<ProductStatus, ReadonlySet<ProductStatus>>> = {
        DRAFT: new Set([
          ProductStatus.REVIEW,
          ProductStatus.READY_TO_PUBLISH,
          ProductStatus.PUBLISHED,
          ProductStatus.ARCHIVED,
        ]),
        REVIEW: new Set([
          ProductStatus.DRAFT,
          ProductStatus.READY_TO_PUBLISH,
          ProductStatus.PUBLISHED,
          ProductStatus.ARCHIVED,
        ]),
        READY_TO_PUBLISH: new Set([
          ProductStatus.DRAFT,
          ProductStatus.REVIEW,
          ProductStatus.PUBLISHED,
          ProductStatus.ARCHIVED,
        ]),
        PUBLISHED: new Set([
          ProductStatus.DRAFT,
          ProductStatus.REVIEW,
          ProductStatus.READY_TO_PUBLISH,
          ProductStatus.ARCHIVED,
        ]),
        ARCHIVED: new Set([ProductStatus.DRAFT]),
      };

      if (!allowedTransitions[existing.status]?.has(target)) {
        throw new DomainHttpException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVALID_STATUS_TRANSITION',
          `Cannot transition product from ${existing.status} to ${target}`,
        );
      }

      const now = new Date();
      const publishedAt =
        target === ProductStatus.PUBLISHED ? (existing.publishedAt ?? now) : existing.publishedAt;

      await tx.product.update({
        where: { id: productId },
        data: {
          status: target,
          publishedAt,
        },
      });

      if (target === ProductStatus.PUBLISHED) {
        await this.outboxWriter.enqueue(
          {
            aggregateType: 'Product',
            aggregateId: productId,
            eventType: 'product.published',
            payload: {
              productId,
              slug: existing.slug,
              name: existing.name,
              publishedBy: actor.userId,
              publishedAt: (publishedAt ?? now).toISOString(),
            },
          },
          tx,
        );
      }

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.status.transitioned',
          resource: 'Product',
          resourceId: productId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            status: existing.status,
            publishedAt: existing.publishedAt ? existing.publishedAt.toISOString() : null,
          },
          afterState: {
            status: target,
            publishedAt: publishedAt ? publishedAt.toISOString() : null,
            reason: input.reason ?? null,
          },
        },
        tx,
      );

      const reloaded = await this.loadProductOrThrow(tx, productId);
      return mapAdminProductDetailDto(reloaded);
    });
  }

  // ===========================================================================
  // Admin Variant CRUD
  // ===========================================================================

  async createVariant(
    actor: AuthenticatedActor,
    productId: string,
    input: CreateProductVariantRequest,
    ipAddress?: string | null,
  ): Promise<AdminProductVariantDto> {
    return this.prisma.withTransaction(async (tx) => {
      await this.loadProductOrThrow(tx, productId);

      const existingSku = await tx.productVariant.findUnique({
        where: { sku: input.sku },
        select: { id: true },
      });
      if (existingSku) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CONFLICT',
          `Variant with SKU "${input.sku}" already exists`,
        );
      }

      const warehouse = await this.ensureDefaultWarehouse(tx);
      const dims = input.dimensionsJson ?? null;
      const lengthCm =
        dims && typeof dims['lengthCm'] === 'number' ? Math.trunc(dims['lengthCm']) : null;
      const widthCm =
        dims && typeof dims['widthCm'] === 'number' ? Math.trunc(dims['widthCm']) : null;
      const heightCm =
        dims && typeof dims['heightCm'] === 'number' ? Math.trunc(dims['heightCm']) : null;

      const created = await tx.productVariant.create({
        data: {
          productId,
          sku: input.sku,
          size: input.size,
          color: input.color,
          colorHex: input.colorHex ?? null,
          priceIdr: BigInt(input.priceIdr),
          compareAtPriceIdr:
            input.compareAtPriceIdr !== undefined && input.compareAtPriceIdr !== null
              ? BigInt(input.compareAtPriceIdr)
              : null,
          weightGrams: input.weightGrams,
          lengthCm,
          widthCm,
          heightCm,
          isActive: input.isActive,
        },
      });

      const initialStock = input.initialStock ?? 0;
      const lowStockThreshold = input.lowStockThreshold ?? 5;

      await tx.inventoryLevel.create({
        data: {
          warehouseId: warehouse.id,
          variantId: created.id,
          quantityOnHand: initialStock,
          quantityReserved: 0,
          lowStockThreshold,
        },
      });

      if (initialStock > 0) {
        await tx.inventoryMovement.create({
          data: {
            warehouseId: warehouse.id,
            variantId: created.id,
            type: InventoryMovementType.RECEIPT,
            quantityDelta: initialStock,
            referenceType: 'ADMIN_VARIANT_INIT',
            referenceId: created.id,
            reason: `Initial stock receipt on variant creation (${created.sku})`,
            actorId: actor.userId,
          },
        });
      }

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.variant.created',
          resource: 'ProductVariant',
          resourceId: created.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            productId,
            sku: created.sku,
            size: created.size,
            color: created.color,
            priceIdr: input.priceIdr,
            compareAtPriceIdr: input.compareAtPriceIdr ?? null,
            initialStock,
          },
        },
        tx,
      );

      const reloadedProduct = await this.loadProductOrThrow(tx, productId);
      const variantRow = reloadedProduct.variants.find((v) => v.id === created.id)!;
      return mapAdminVariantDto(variantRow);
    });
  }

  async updateVariant(
    actor: AuthenticatedActor,
    productId: string,
    variantId: string,
    input: UpdateProductVariantRequest,
    ipAddress?: string | null,
  ): Promise<AdminProductVariantDto> {
    return this.prisma.withTransaction(async (tx) => {
      const product = await this.loadProductOrThrow(tx, productId);
      const existing = product.variants.find((v) => v.id === variantId);

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Product variant was not found',
        );
      }

      if (input.sku && input.sku !== existing.sku) {
        const skuConflict = await tx.productVariant.findUnique({
          where: { sku: input.sku },
          select: { id: true },
        });
        if (skuConflict && skuConflict.id !== variantId) {
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'CONFLICT',
            `Variant with SKU "${input.sku}" already exists`,
          );
        }
      }

      const nextPriceIdr =
        input.priceIdr !== undefined ? BigInt(input.priceIdr) : existing.priceIdr;
      const nextCompareAtPriceIdr =
        input.compareAtPriceIdr !== undefined
          ? input.compareAtPriceIdr !== null
            ? BigInt(input.compareAtPriceIdr)
            : null
          : existing.compareAtPriceIdr;

      if (nextCompareAtPriceIdr !== null && nextCompareAtPriceIdr < nextPriceIdr) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'compareAtPriceIdr must be greater than or equal to priceIdr',
        );
      }

      const dims = input.dimensionsJson;
      const dimensionUpdates: Prisma.ProductVariantUpdateInput =
        dims === undefined
          ? {}
          : dims === null
            ? { lengthCm: null, widthCm: null, heightCm: null }
            : {
                lengthCm:
                  typeof dims['lengthCm'] === 'number' ? Math.trunc(dims['lengthCm']) : null,
                widthCm:
                  typeof dims['widthCm'] === 'number' ? Math.trunc(dims['widthCm']) : null,
                heightCm:
                  typeof dims['heightCm'] === 'number' ? Math.trunc(dims['heightCm']) : null,
              };

      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.size !== undefined ? { size: input.size } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.colorHex !== undefined ? { colorHex: input.colorHex } : {}),
          priceIdr: nextPriceIdr,
          compareAtPriceIdr: nextCompareAtPriceIdr,
          ...(input.weightGrams !== undefined ? { weightGrams: input.weightGrams } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...dimensionUpdates,
        },
      });

      if (input.lowStockThreshold !== undefined) {
        await tx.inventoryLevel.updateMany({
          where: { variantId },
          data: { lowStockThreshold: input.lowStockThreshold },
        });
      }

      const oldPriceNum = Number(existing.priceIdr);
      const newPriceNum = Number(updated.priceIdr);
      const oldCompareNum =
        existing.compareAtPriceIdr !== null ? Number(existing.compareAtPriceIdr) : null;
      const newCompareNum =
        updated.compareAtPriceIdr !== null ? Number(updated.compareAtPriceIdr) : null;

      const priceChanged = oldPriceNum !== newPriceNum || oldCompareNum !== newCompareNum;

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.variant.updated',
          resource: 'ProductVariant',
          resourceId: variantId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            sku: existing.sku,
            size: existing.size,
            color: existing.color,
            priceIdr: oldPriceNum,
            compareAtPriceIdr: oldCompareNum,
            isActive: existing.isActive,
          },
          afterState: {
            sku: updated.sku,
            size: updated.size,
            color: updated.color,
            priceIdr: newPriceNum,
            compareAtPriceIdr: newCompareNum,
            isActive: updated.isActive,
          },
        },
        tx,
      );

      if (priceChanged) {
        await this.auditLogService.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'PRODUCT',
            action: 'product.variant.price_changed',
            resource: 'ProductVariant',
            resourceId: variantId,
            ipAddress: ipAddress ?? null,
            beforeState: {
              productId,
              sku: existing.sku,
              oldValue: oldPriceNum,
              priceIdr: oldPriceNum,
              compareAtPriceIdr: oldCompareNum,
            },
            afterState: {
              productId,
              sku: updated.sku,
              newValue: newPriceNum,
              priceIdr: newPriceNum,
              compareAtPriceIdr: newCompareNum,
            },
          },
          tx,
        );
      }

      const reloadedProduct = await this.loadProductOrThrow(tx, productId);
      const variantRow = reloadedProduct.variants.find((v) => v.id === variantId)!;
      return mapAdminVariantDto(variantRow);
    });
  }

  async deleteVariant(
    actor: AuthenticatedActor,
    productId: string,
    variantId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const product = await this.loadProductOrThrow(tx, productId);
      const existing = product.variants.find((v) => v.id === variantId);

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Product variant was not found',
        );
      }

      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.variant.deleted',
          resource: 'ProductVariant',
          resourceId: variantId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            productId,
            sku: existing.sku,
            priceIdr: Number(existing.priceIdr),
          },
        },
        tx,
      );
    });
  }

  // ===========================================================================
  // Admin Media CRUD
  // ===========================================================================

  async createMedia(
    actor: AuthenticatedActor,
    productId: string,
    input: CreateProductMediaRequest,
    ipAddress?: string | null,
  ): Promise<ProductMediaDto> {
    return this.prisma.withTransaction(async (tx) => {
      const product = await this.loadProductOrThrow(tx, productId);

      if (input.variantId) {
        const variantExists = product.variants.some((v) => v.id === input.variantId);
        if (!variantExists) {
          throw new DomainHttpException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'variantId does not belong to this product',
          );
        }
      }

      const shouldBePrimary = input.isPrimary || product.media.length === 0;
      if (shouldBePrimary) {
        await tx.productMedia.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const objectKey = `catalog/products/${product.slug}/${randomUUID()}`;
      const created = await tx.productMedia.create({
        data: {
          productId,
          variantId: input.variantId ?? null,
          type: normalizePrismaMediaType(input.type),
          objectKey,
          url: input.url,
          altText: input.altText,
          position: input.position,
          width: input.width ?? null,
          height: input.height ?? null,
          isPrimary: shouldBePrimary,
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.media.created',
          resource: 'ProductMedia',
          resourceId: created.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            productId,
            type: created.type,
            altText: created.altText,
            position: created.position,
            isPrimary: created.isPrimary,
          },
        },
        tx,
      );

      return mapMediaDto(created);
    });
  }

  async updateMedia(
    actor: AuthenticatedActor,
    productId: string,
    mediaId: string,
    input: UpdateProductMediaRequest,
    ipAddress?: string | null,
  ): Promise<ProductMediaDto> {
    return this.prisma.withTransaction(async (tx) => {
      const product = await this.loadProductOrThrow(tx, productId);
      const existing = product.media.find((m) => m.id === mediaId);

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Product media item was not found',
        );
      }

      if (input.isPrimary === true) {
        await tx.productMedia.updateMany({
          where: { productId, isPrimary: true, id: { not: mediaId } },
          data: { isPrimary: false },
        });
      }

      const updateData: Prisma.ProductMediaUncheckedUpdateInput = {
        ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
        ...(input.type !== undefined ? { type: normalizePrismaMediaType(input.type) } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.altText !== undefined ? { altText: input.altText } : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      };

      const updated = await tx.productMedia.update({
        where: { id: mediaId },
        data: updateData,
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.media.updated',
          resource: 'ProductMedia',
          resourceId: mediaId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            altText: existing.altText,
            position: existing.position,
            isPrimary: existing.isPrimary,
          },
          afterState: {
            altText: updated.altText,
            position: updated.position,
            isPrimary: updated.isPrimary,
          },
        },
        tx,
      );

      return mapMediaDto(updated);
    });
  }

  async deleteMedia(
    actor: AuthenticatedActor,
    productId: string,
    mediaId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const product = await this.loadProductOrThrow(tx, productId);
      const existing = product.media.find((m) => m.id === mediaId);

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Product media item was not found',
        );
      }

      await tx.productMedia.delete({ where: { id: mediaId } });

      if (existing.isPrimary) {
        const nextMedia = await tx.productMedia.findFirst({
          where: { productId },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        if (nextMedia) {
          await tx.productMedia.update({
            where: { id: nextMedia.id },
            data: { isPrimary: true },
          });
        }
      }

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'product.media.deleted',
          resource: 'ProductMedia',
          resourceId: mediaId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            productId,
            altText: existing.altText,
            position: existing.position,
            isPrimary: existing.isPrimary,
          },
        },
        tx,
      );
    });
  }

  // ===========================================================================
  // Admin Category CRUD
  // ===========================================================================

  async listAdminCategories(): Promise<AdminCategoryDto[]> {
    const rows = await this.prisma.client.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        productCategories: {
          where: {
            product: { deletedAt: null },
          },
          select: { productId: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      sizeGuideJson: toSizeGuideDto(row.sizeGuide),
      productCount: row.productCategories.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createCategory(
    actor: AuthenticatedActor,
    input: CreateCategoryRequest,
    ipAddress?: string | null,
  ): Promise<AdminCategoryDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.category.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (existing) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CONFLICT',
          `Category with slug "${input.slug}" already exists`,
        );
      }

      const created = await tx.category.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          parentId: input.parentId ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          ...(input.sizeGuideJson !== undefined && input.sizeGuideJson !== null
            ? { sizeGuide: input.sizeGuideJson as Prisma.InputJsonValue }
            : {}),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'category.created',
          resource: 'Category',
          resourceId: created.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            slug: created.slug,
            name: created.name,
            isActive: created.isActive,
          },
        },
        tx,
      );

      return {
        id: created.id,
        slug: created.slug,
        name: created.name,
        description: created.description,
        parentId: created.parentId,
        sortOrder: created.sortOrder,
        isActive: created.isActive,
        sizeGuideJson: toSizeGuideDto(created.sizeGuide),
        productCount: 0,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    });
  }

  async updateCategory(
    actor: AuthenticatedActor,
    categoryId: string,
    input: UpdateCategoryRequest,
    ipAddress?: string | null,
  ): Promise<AdminCategoryDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.category.findFirst({
        where: { id: categoryId, deletedAt: null },
        include: {
          productCategories: {
            where: { product: { deletedAt: null } },
            select: { productId: true },
          },
        },
      });

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Category was not found',
        );
      }

      if (input.slug && input.slug !== existing.slug) {
        const conflict = await tx.category.findUnique({
          where: { slug: input.slug },
          select: { id: true },
        });
        if (conflict && conflict.id !== categoryId) {
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'CONFLICT',
            `Category with slug "${input.slug}" already exists`,
          );
        }
      }

      const updated = await tx.category.update({
        where: { id: categoryId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.sizeGuideJson !== undefined
            ? { sizeGuide: (input.sizeGuideJson ?? {}) as Prisma.InputJsonValue }
            : {}),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'category.updated',
          resource: 'Category',
          resourceId: categoryId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            slug: existing.slug,
            name: existing.name,
            isActive: existing.isActive,
          },
          afterState: {
            slug: updated.slug,
            name: updated.name,
            isActive: updated.isActive,
          },
        },
        tx,
      );

      return {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        description: updated.description,
        parentId: updated.parentId,
        sortOrder: updated.sortOrder,
        isActive: updated.isActive,
        sizeGuideJson: toSizeGuideDto(updated.sizeGuide),
        productCount: existing.productCategories.length,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async deleteCategory(
    actor: AuthenticatedActor,
    categoryId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await tx.category.findFirst({
        where: { id: categoryId, deletedAt: null },
      });
      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Category was not found',
        );
      }

      await tx.category.update({
        where: { id: categoryId },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'category.deleted',
          resource: 'Category',
          resourceId: categoryId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            slug: existing.slug,
            name: existing.name,
          },
        },
        tx,
      );
    });
  }

  // ===========================================================================
  // Admin Collection CRUD
  // ===========================================================================

  async listAdminCollections(): Promise<AdminCollectionDto[]> {
    const rows = await this.prisma.client.collection.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        collectionProducts: {
          where: { product: { deletedAt: null } },
          orderBy: { position: 'asc' },
          select: { productId: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      bannerUrl: row.heroMediaUrl,
      status: row.status,
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      productCount: row.collectionProducts.length,
      productIds: row.collectionProducts.map((cp) => cp.productId),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createCollection(
    actor: AuthenticatedActor,
    input: CreateCollectionRequest,
    ipAddress?: string | null,
  ): Promise<AdminCollectionDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.collection.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (existing) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CONFLICT',
          `Collection with slug "${input.slug}" already exists`,
        );
      }

      const uniqueProductIds = input.productIds
        ? Array.from(new Set(input.productIds))
        : [];

      const created = await tx.collection.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          heroMediaUrl: input.bannerUrl ?? null,
          status: input.status,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          ...(uniqueProductIds.length > 0
            ? {
                collectionProducts: {
                  create: uniqueProductIds.map((productId, idx) => ({
                    productId,
                    position: idx + 1,
                  })),
                },
              }
            : {}),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'collection.created',
          resource: 'Collection',
          resourceId: created.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            slug: created.slug,
            name: created.name,
            status: created.status,
          },
        },
        tx,
      );

      return {
        id: created.id,
        slug: created.slug,
        name: created.name,
        description: created.description,
        bannerUrl: created.heroMediaUrl,
        status: created.status,
        startsAt: created.startsAt ? created.startsAt.toISOString() : null,
        endsAt: created.endsAt ? created.endsAt.toISOString() : null,
        productCount: uniqueProductIds.length,
        productIds: uniqueProductIds,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    });
  }

  async updateCollection(
    actor: AuthenticatedActor,
    collectionId: string,
    input: UpdateCollectionRequest,
    ipAddress?: string | null,
  ): Promise<AdminCollectionDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.collection.findFirst({
        where: { id: collectionId, deletedAt: null },
        include: {
          collectionProducts: {
            where: { product: { deletedAt: null } },
            orderBy: { position: 'asc' },
            select: { productId: true },
          },
        },
      });

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Collection was not found',
        );
      }

      if (input.slug && input.slug !== existing.slug) {
        const conflict = await tx.collection.findUnique({
          where: { slug: input.slug },
          select: { id: true },
        });
        if (conflict && conflict.id !== collectionId) {
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'CONFLICT',
            `Collection with slug "${input.slug}" already exists`,
          );
        }
      }

      let productIds = existing.collectionProducts.map((cp) => cp.productId);
      if (input.productIds !== undefined) {
        productIds = Array.from(new Set(input.productIds));
        await tx.collectionProduct.deleteMany({ where: { collectionId } });
        if (productIds.length > 0) {
          await tx.collectionProduct.createMany({
            data: productIds.map((productId, idx) => ({
              collectionId,
              productId,
              position: idx + 1,
            })),
          });
        }
      }

      const updated = await tx.collection.update({
        where: { id: collectionId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.bannerUrl !== undefined ? { heroMediaUrl: input.bannerUrl } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.startsAt !== undefined
            ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
            : {}),
          ...(input.endsAt !== undefined
            ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
            : {}),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'collection.updated',
          resource: 'Collection',
          resourceId: collectionId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            slug: existing.slug,
            name: existing.name,
            status: existing.status,
          },
          afterState: {
            slug: updated.slug,
            name: updated.name,
            status: updated.status,
          },
        },
        tx,
      );

      return {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        description: updated.description,
        bannerUrl: updated.heroMediaUrl,
        status: updated.status,
        startsAt: updated.startsAt ? updated.startsAt.toISOString() : null,
        endsAt: updated.endsAt ? updated.endsAt.toISOString() : null,
        productCount: productIds.length,
        productIds,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async deleteCollection(
    actor: AuthenticatedActor,
    collectionId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await tx.collection.findFirst({
        where: { id: collectionId, deletedAt: null },
      });
      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Collection was not found',
        );
      }

      await tx.collection.update({
        where: { id: collectionId },
        data: {
          status: CollectionStatus.ARCHIVED,
          deletedAt: new Date(),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'collection.deleted',
          resource: 'Collection',
          resourceId: collectionId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            slug: existing.slug,
            name: existing.name,
            status: existing.status,
          },
        },
        tx,
      );
    });
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  private isUuid(val: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  }

  private async loadProductOrThrow(
    db: PrismaTransactionClient | PrismaService['client'],
    productId: string,
  ): Promise<LoadedProduct> {
    const product = await db.product.findFirst({
      where: {
        id: productId,
        deletedAt: null,
      },
      include: PRODUCT_RELATIONS_INCLUDE,
    });

    if (!product) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Product was not found',
      );
    }

    return product;
  }

  private async ensureDefaultWarehouse(
    tx: PrismaTransactionClient,
  ): Promise<{ readonly id: string; readonly code: string }> {
    const existing = await tx.warehouse.findFirst({
      where: {
        OR: [{ code: DEFAULT_WAREHOUSE_CODE }, { isDefault: true }],
        status: WarehouseStatus.ACTIVE,
      },
      orderBy: { isDefault: 'desc' },
      select: { id: true, code: true },
    });

    if (existing) {
      return existing;
    }

    return tx.warehouse.upsert({
      where: { code: DEFAULT_WAREHOUSE_CODE },
      update: {
        status: WarehouseStatus.ACTIVE,
        isDefault: true,
      },
      create: {
        code: DEFAULT_WAREHOUSE_CODE,
        name: 'Jakarta Main Fulfillment Center',
        city: 'Jakarta Selatan',
        province: 'DKI Jakarta',
        postalCode: '12190',
        status: WarehouseStatus.ACTIVE,
        isDefault: true,
      },
      select: { id: true, code: true },
    });
  }
}
