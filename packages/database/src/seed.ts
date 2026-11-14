import argon2 from 'argon2';
import {
  AUTH_POLICY,
  PERMISSION_CODES,
  PERMISSION_DESCRIPTIONS,
  ROLE_CODES,
  ROLE_PERMISSION_MATRIX,
  type RoleCode,
} from '@arven/config';
import {
  CollectionStatus,
  InventoryMovementType,
  ProductStatus,
  UserStatus,
  WarehouseStatus,
  type PrismaClient,
} from './generated/prisma/client.js';
import { withTransaction, type PrismaTransactionClient } from './client.js';

export interface RoleSeedDefinition {
  readonly code: RoleCode;
  readonly name: string;
  readonly description: string;
}

export interface CategorySeedDefinition {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}

export interface CollectionSeedDefinition {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export interface ProductSeedDefinition {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly material: string;
  readonly fit: string;
  readonly careInstruction: string;
  readonly categorySlug: string;
  readonly collectionSlug: string;
  readonly isFeatured: boolean;
  readonly sku: string;
  readonly size: string;
  readonly color: string;
  readonly colorHex: string;
  readonly priceIdr: bigint;
  readonly weightGrams: number;
  readonly initialStock: number;
}

export interface SeedDatabaseOptions {
  readonly nodeEnv?: string;
  readonly seedDevUsers?: boolean;
  readonly devUserPassword?: string;
}

export interface SeedDatabaseResult {
  readonly rolesUpserted: number;
  readonly permissionsUpserted: number;
  readonly rolePermissionsAssigned: number;
  readonly warehouseCode: string;
  readonly categoriesUpserted: number;
  readonly collectionsUpserted: number;
  readonly productsUpserted: number;
  readonly variantsUpserted: number;
  readonly inventoryLevelsCreated: number;
  readonly devUsersSeeded: number;
}

export const ARVEN_ROLE_DEFINITIONS: Readonly<Record<RoleCode, RoleSeedDefinition>> = {
  OWNER: {
    code: 'OWNER',
    name: 'Owner',
    description:
      'Unrestricted platform owner with authority over roles, refund approvals, and payment providers',
  },
  MANAGER: {
    code: 'MANAGER',
    name: 'Manager',
    description: 'Full operational administration except Owner-exclusive security controls',
  },
  PRODUCT: {
    code: 'PRODUCT',
    name: 'Product Manager',
    description: 'Manages catalog products, variants, categories, collections, coupons, and 3D assets',
  },
  INVENTORY: {
    code: 'INVENTORY',
    name: 'Inventory Manager',
    description: 'Manages warehouses, stock levels, inventory adjustments, and stock receipts',
  },
  ORDER: {
    code: 'ORDER',
    name: 'Order Operations',
    description: 'Manages order fulfillment, shipments, return inspections, and refund requests',
  },
  CONTENT: {
    code: 'CONTENT',
    name: 'Content Editor',
    description: 'Publishes editorial pages, journal articles, lookbooks, and media assets',
  },
  SUPPORT: {
    code: 'SUPPORT',
    name: 'Support Agent',
    description: 'Handles customer inquiries, return triage, order visibility, and review moderation',
  },
  CUSTOMER: {
    code: 'CUSTOMER',
    name: 'Customer',
    description: 'Registered storefront customer account',
  },
};

export const ARVEN_SEED_WAREHOUSE = {
  code: 'JKT-MAIN-01',
  name: 'Jakarta Main Fulfillment Center',
  city: 'Jakarta Selatan',
  province: 'DKI Jakarta',
  postalCode: '12190',
} as const;

export const ARVEN_SEED_CATEGORIES: readonly CategorySeedDefinition[] = [
  {
    slug: 'tops',
    name: 'Tops',
    description: 'Structured jersey essentials and tailored woven shirting.',
    sortOrder: 1,
  },
  {
    slug: 'bottoms',
    name: 'Bottoms',
    description: 'Architectural trousers engineered for drape and longevity.',
    sortOrder: 2,
  },
  {
    slug: 'outerwear',
    name: 'Outerwear',
    description: 'Relaxed coats and boxy overshirts in heavyweight natural fibers.',
    sortOrder: 3,
  },
  {
    slug: 'footwear',
    name: 'Footwear',
    description: 'Minimalist leather silhouettes crafted for everyday movement.',
    sortOrder: 4,
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: 'Structured leather carry goods and refined finishing pieces.',
    sortOrder: 5,
  },
];

export const ARVEN_SEED_COLLECTIONS: readonly CollectionSeedDefinition[] = [
  {
    slug: 'essentials',
    name: 'Essentials',
    description: 'Foundational daily uniforms built with disciplined proportions.',
  },
  {
    slug: 'form',
    name: 'Form',
    description: 'Clean tailoring and structured silhouettes for sharp versatility.',
  },
  {
    slug: 'atelier',
    name: 'Atelier',
    description: 'Elevated seasonal craft highlighting tactile wool and crisp poplin.',
  },
  {
    slug: 'movement',
    name: 'Movement',
    description: 'Functional refinement designed to transition seamlessly through the city.',
  },
];

export const ARVEN_SEED_PRODUCTS: readonly ProductSeedDefinition[] = [
  {
    slug: 'essentials-heavyweight-crew-tee',
    name: 'Essentials Heavyweight Crew Tee',
    description: 'Dense combed cotton jersey tee with a clean ribbed collar and relaxed drop shoulder.',
    material: '100% Combed Organic Cotton (280 gsm)',
    fit: 'Relaxed Fit',
    careInstruction: 'Machine wash cold inside out. Lay flat to dry. Do not tumble dry.',
    categorySlug: 'tops',
    collectionSlug: 'essentials',
    isFeatured: true,
    sku: 'ARV-TOP-001',
    size: 'M',
    color: 'Charcoal',
    colorHex: '#17191B',
    priceIdr: 299_000n,
    weightGrams: 320,
    initialStock: 25,
  },
  {
    slug: 'atelier-oversized-poplin-shirt',
    name: 'Atelier Oversized Poplin Shirt',
    description: 'Crisp high-twist cotton poplin overshirt featuring concealed placket buttons and dropped hem.',
    material: '100% Long-Staple Cotton Poplin',
    fit: 'Oversized Fit',
    careInstruction: 'Gentle cold wash or dry clean. Steam on low heat.',
    categorySlug: 'tops',
    collectionSlug: 'atelier',
    isFeatured: true,
    sku: 'ARV-TOP-002',
    size: 'L',
    color: 'Ivory',
    colorHex: '#F8F7F3',
    priceIdr: 499_000n,
    weightGrams: 380,
    initialStock: 18,
  },
  {
    slug: 'form-wide-leg-tailored-trouser',
    name: 'Form Wide-Leg Tailored Trouser',
    description: 'Double-pleated wide-leg trouser with extended waistband tab and clean pressed crease.',
    material: '68% Wool Blend, 30% Recycled Polyester, 2% Elastane',
    fit: 'Wide Tailored Fit',
    careInstruction: 'Dry clean only. Press with damp cloth on low setting.',
    categorySlug: 'bottoms',
    collectionSlug: 'form',
    isFeatured: false,
    sku: 'ARV-BOT-001',
    size: '32',
    color: 'Graphite',
    colorHex: '#35383A',
    priceIdr: 649_000n,
    weightGrams: 540,
    initialStock: 15,
  },
  {
    slug: 'atelier-boxy-wool-overshirt',
    name: 'Atelier Boxy Wool Overshirt',
    description: 'Unlined double-faced wool overshirt with welt chest pockets and matte horn hardware.',
    material: '80% Virgin Wool, 20% Polyamide',
    fit: 'Boxy Cropped Fit',
    careInstruction: 'Specialist dry clean only. Brush gently with soft garment brush.',
    categorySlug: 'outerwear',
    collectionSlug: 'atelier',
    isFeatured: true,
    sku: 'ARV-OUT-001',
    size: 'L',
    color: 'Obsidian',
    colorHex: '#1D1E20',
    priceIdr: 899_000n,
    weightGrams: 780,
    initialStock: 12,
  },
  {
    slug: 'movement-minimalist-leather-sneaker',
    name: 'Movement Minimalist Leather Sneaker',
    description: 'Low-profile tonal court sneaker stitched onto a Margom-inspired natural rubber cup sole.',
    material: 'Full-Grain Calfskin Upper, Calf Leather Lining, Rubber Sole',
    fit: 'True to EU Sizing',
    careInstruction: 'Wipe with damp soft cloth. Condition leather periodically and store with shoe trees.',
    categorySlug: 'footwear',
    collectionSlug: 'movement',
    isFeatured: true,
    sku: 'ARV-FW-001',
    size: '42',
    color: 'Cream',
    colorHex: '#E9E4DA',
    priceIdr: 1_299_000n,
    weightGrams: 980,
    initialStock: 10,
  },
  {
    slug: 'form-structured-calfskin-crossbody',
    name: 'Form Structured Calfskin Crossbody',
    description: 'Architectural rectangular crossbody bag with tonal edge paint and detachable webbing strap.',
    material: '100% Vegetable-Tanned Calfskin Leather',
    fit: 'One Size',
    careInstruction: 'Avoid prolonged moisture exposure. Store inside cotton dust bag.',
    categorySlug: 'accessories',
    collectionSlug: 'form',
    isFeatured: false,
    sku: 'ARV-ACC-001',
    size: 'ONE_SIZE',
    color: 'Deep Stone',
    colorHex: '#5E5C54',
    priceIdr: 799_000n,
    weightGrams: 460,
    initialStock: 14,
  },
];

interface DevUserBlueprint {
  readonly email: string;
  readonly fullName: string;
  readonly roleCode: RoleCode;
}

const DEV_USER_BLUEPRINTS: readonly DevUserBlueprint[] = [
  {
    email: 'owner.dev@arven.local',
    fullName: 'ARVEN Dev Owner',
    roleCode: 'OWNER',
  },
  {
    email: 'manager.dev@arven.local',
    fullName: 'ARVEN Dev Manager',
    roleCode: 'MANAGER',
  },
  {
    email: 'customer.dev@arven.local',
    fullName: 'ARVEN Dev Customer',
    roleCode: 'CUSTOMER',
  },
];

function validateDevUserPassword(password: string | undefined): string {
  if (!password) {
    throw new Error(
      'SEED_DEV_USER_PASSWORD is required when SEED_DEV_USERS=true (non-production only).',
    );
  }
  if (password.includes('\u0000')) {
    throw new Error('SEED_DEV_USER_PASSWORD must not contain NUL characters.');
  }
  if (
    password.length < AUTH_POLICY.PASSWORD_MIN_LENGTH ||
    password.length > AUTH_POLICY.PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `SEED_DEV_USER_PASSWORD length must be between ${AUTH_POLICY.PASSWORD_MIN_LENGTH} and ${AUTH_POLICY.PASSWORD_MAX_LENGTH} characters.`,
    );
  }
  return password;
}

async function seedRolesAndPermissions(tx: PrismaTransactionClient): Promise<{
  readonly roleIdsByCode: Map<RoleCode, string>;
  readonly permissionsUpserted: number;
  readonly rolePermissionsAssigned: number;
}> {
  const roleIdsByCode = new Map<RoleCode, string>();
  for (const roleCode of ROLE_CODES) {
    const def = ARVEN_ROLE_DEFINITIONS[roleCode];
    const role = await tx.role.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        description: def.description,
        isSystem: true,
      },
      create: {
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
      select: { id: true },
    });
    roleIdsByCode.set(roleCode, role.id);
  }

  const permissionIdsByCode = new Map<string, string>();
  for (const permissionCode of PERMISSION_CODES) {
    const meta = PERMISSION_DESCRIPTIONS[permissionCode];
    const permission = await tx.permission.upsert({
      where: { code: permissionCode },
      update: {
        module: meta.area,
        description: meta.description,
      },
      create: {
        code: permissionCode,
        module: meta.area,
        description: meta.description,
      },
      select: { id: true },
    });
    permissionIdsByCode.set(permissionCode, permission.id);
  }

  let rolePermissionsAssigned = 0;
  for (const roleCode of ROLE_CODES) {
    const roleId = roleIdsByCode.get(roleCode);
    if (!roleId) {
      continue;
    }
    const expectedPermissionIds = ROLE_PERMISSION_MATRIX[roleCode].map((permissionCode) => {
      const id = permissionIdsByCode.get(permissionCode);
      if (!id) {
        throw new Error(`Missing permission record for code ${permissionCode}`);
      }
      return id;
    });

    await tx.rolePermission.deleteMany({
      where: {
        roleId,
        permissionId: { notIn: expectedPermissionIds },
      },
    });

    if (expectedPermissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: expectedPermissionIds.map((permissionId) => ({
          roleId,
          permissionId,
        })),
        skipDuplicates: true,
      });
      rolePermissionsAssigned += expectedPermissionIds.length;
    }
  }

  return {
    roleIdsByCode,
    permissionsUpserted: permissionIdsByCode.size,
    rolePermissionsAssigned,
  };
}

async function seedCatalogAndInventory(tx: PrismaTransactionClient): Promise<{
  readonly warehouseCode: string;
  readonly categoriesUpserted: number;
  readonly collectionsUpserted: number;
  readonly productsUpserted: number;
  readonly variantsUpserted: number;
  readonly inventoryLevelsCreated: number;
}> {
  const warehouse = await tx.warehouse.upsert({
    where: { code: ARVEN_SEED_WAREHOUSE.code },
    update: {
      name: ARVEN_SEED_WAREHOUSE.name,
      city: ARVEN_SEED_WAREHOUSE.city,
      province: ARVEN_SEED_WAREHOUSE.province,
      postalCode: ARVEN_SEED_WAREHOUSE.postalCode,
      status: WarehouseStatus.ACTIVE,
      isDefault: true,
    },
    create: {
      code: ARVEN_SEED_WAREHOUSE.code,
      name: ARVEN_SEED_WAREHOUSE.name,
      city: ARVEN_SEED_WAREHOUSE.city,
      province: ARVEN_SEED_WAREHOUSE.province,
      postalCode: ARVEN_SEED_WAREHOUSE.postalCode,
      status: WarehouseStatus.ACTIVE,
      isDefault: true,
    },
    select: { id: true, code: true },
  });

  const categoryIdsBySlug = new Map<string, string>();
  for (const category of ARVEN_SEED_CATEGORIES) {
    const saved = await tx.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: true,
        deletedAt: null,
      },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      select: { id: true },
    });
    categoryIdsBySlug.set(category.slug, saved.id);
  }

  const collectionIdsBySlug = new Map<string, string>();
  for (const collection of ARVEN_SEED_COLLECTIONS) {
    const saved = await tx.collection.upsert({
      where: { slug: collection.slug },
      update: {
        name: collection.name,
        description: collection.description,
        status: CollectionStatus.PUBLISHED,
        deletedAt: null,
      },
      create: {
        slug: collection.slug,
        name: collection.name,
        description: collection.description,
        status: CollectionStatus.PUBLISHED,
      },
      select: { id: true },
    });
    collectionIdsBySlug.set(collection.slug, saved.id);
  }

  const now = new Date();
  let inventoryLevelsCreated = 0;

  for (const [index, item] of ARVEN_SEED_PRODUCTS.entries()) {
    const categoryId = categoryIdsBySlug.get(item.categorySlug);
    const collectionId = collectionIdsBySlug.get(item.collectionSlug);
    if (!categoryId || !collectionId) {
      throw new Error(`Invalid seed relation for product ${item.slug}`);
    }

    const product = await tx.product.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        description: item.description,
        material: item.material,
        fit: item.fit,
        careInstruction: item.careInstruction,
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        isFeatured: item.isFeatured,
        deletedAt: null,
      },
      create: {
        slug: item.slug,
        name: item.name,
        description: item.description,
        material: item.material,
        fit: item.fit,
        careInstruction: item.careInstruction,
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        isFeatured: item.isFeatured,
        has3dEnabled: false,
        publishedAt: now,
      },
      select: { id: true },
    });

    await tx.productCategory.upsert({
      where: {
        productId_categoryId: {
          productId: product.id,
          categoryId,
        },
      },
      update: { isPrimary: true },
      create: {
        productId: product.id,
        categoryId,
        isPrimary: true,
      },
    });

    await tx.collectionProduct.upsert({
      where: {
        collectionId_productId: {
          collectionId,
          productId: product.id,
        },
      },
      update: { position: index + 1 },
      create: {
        collectionId,
        productId: product.id,
        position: index + 1,
      },
    });

    const variant = await tx.productVariant.upsert({
      where: { sku: item.sku },
      update: {
        productId: product.id,
        size: item.size,
        color: item.color,
        colorHex: item.colorHex,
        priceIdr: item.priceIdr,
        weightGrams: item.weightGrams,
        isActive: true,
        deletedAt: null,
      },
      create: {
        productId: product.id,
        sku: item.sku,
        size: item.size,
        color: item.color,
        colorHex: item.colorHex,
        priceIdr: item.priceIdr,
        weightGrams: item.weightGrams,
        isActive: true,
      },
      select: { id: true },
    });

    const existingInventory = await tx.inventoryLevel.findUnique({
      where: {
        warehouseId_variantId: {
          warehouseId: warehouse.id,
          variantId: variant.id,
        },
      },
      select: { id: true },
    });

    if (!existingInventory) {
      await tx.inventoryLevel.create({
        data: {
          warehouseId: warehouse.id,
          variantId: variant.id,
          quantityOnHand: item.initialStock,
          quantityReserved: 0,
          lowStockThreshold: 5,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          warehouseId: warehouse.id,
          variantId: variant.id,
          type: InventoryMovementType.RECEIPT,
          quantityDelta: item.initialStock,
          referenceType: 'SEED_INITIAL_STOCK',
          referenceId: variant.id,
          reason: `Initial catalog seed receipt for ${item.sku}`,
        },
      });

      inventoryLevelsCreated += 1;
    }
  }

  return {
    warehouseCode: warehouse.code,
    categoriesUpserted: categoryIdsBySlug.size,
    collectionsUpserted: collectionIdsBySlug.size,
    productsUpserted: ARVEN_SEED_PRODUCTS.length,
    variantsUpserted: ARVEN_SEED_PRODUCTS.length,
    inventoryLevelsCreated,
  };
}

async function seedDevelopmentUsers(
  tx: PrismaTransactionClient,
  roleIdsByCode: Map<RoleCode, string>,
  passwordHash: string,
): Promise<number> {
  const now = new Date();
  let count = 0;

  for (const blueprint of DEV_USER_BLUEPRINTS) {
    const roleId = roleIdsByCode.get(blueprint.roleCode);
    if (!roleId) {
      throw new Error(`Role ${blueprint.roleCode} missing during dev user seed`);
    }

    const user = await tx.user.upsert({
      where: { email: blueprint.email },
      update: {
        fullName: blueprint.fullName,
        status: UserStatus.ACTIVE,
        verifiedAt: now,
      },
      create: {
        email: blueprint.email,
        passwordHash,
        fullName: blueprint.fullName,
        status: UserStatus.ACTIVE,
        verifiedAt: now,
        mfaEnabled: false,
      },
      select: { id: true },
    });

    await tx.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId,
      },
    });

    count += 1;
  }

  return count;
}

export async function seedDatabase(
  prisma: PrismaClient,
  options: SeedDatabaseOptions = {},
): Promise<SeedDatabaseResult> {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const seedDevUsers = options.seedDevUsers ?? process.env.SEED_DEV_USERS === 'true';

  if (nodeEnv === 'production' && seedDevUsers) {
    throw new Error('Refusing to seed development users when NODE_ENV=production');
  }

  let devPasswordHash: string | null = null;
  if (seedDevUsers) {
    const plainPassword = validateDevUserPassword(
      options.devUserPassword ?? process.env.SEED_DEV_USER_PASSWORD,
    );
    devPasswordHash = await argon2.hash(plainPassword, {
      type: argon2.argon2id,
      memoryCost: AUTH_POLICY.ARGON2_MEMORY_COST_KIB,
      timeCost: AUTH_POLICY.ARGON2_TIME_COST,
      parallelism: AUTH_POLICY.ARGON2_PARALLELISM,
      hashLength: AUTH_POLICY.ARGON2_HASH_LENGTH,
    });
  }

  return withTransaction(prisma, async (tx) => {
    const rbac = await seedRolesAndPermissions(tx);
    const catalog = await seedCatalogAndInventory(tx);

    let devUsersSeeded = 0;
    if (devPasswordHash !== null) {
      devUsersSeeded = await seedDevelopmentUsers(tx, rbac.roleIdsByCode, devPasswordHash);
    }

    return {
      rolesUpserted: rbac.roleIdsByCode.size,
      permissionsUpserted: rbac.permissionsUpserted,
      rolePermissionsAssigned: rbac.rolePermissionsAssigned,
      warehouseCode: catalog.warehouseCode,
      categoriesUpserted: catalog.categoriesUpserted,
      collectionsUpserted: catalog.collectionsUpserted,
      productsUpserted: catalog.productsUpserted,
      variantsUpserted: catalog.variantsUpserted,
      inventoryLevelsCreated: catalog.inventoryLevelsCreated,
      devUsersSeeded,
    };
  });
}
