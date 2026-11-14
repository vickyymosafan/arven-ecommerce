import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_CODES,
  PERMISSION_DESCRIPTIONS,
  ROLE_CODES,
  ROLE_PERMISSION_MATRIX,
} from '@arven/config';
import {
  $Enums,
  ARVEN_ROLE_DEFINITIONS,
  ARVEN_SEED_CATEGORIES,
  ARVEN_SEED_COLLECTIONS,
  ARVEN_SEED_PRODUCTS,
  ARVEN_SEED_WAREHOUSE,
  InventoryMovementType,
  Prisma,
  PrismaClient,
  ProductStatus,
  createPrismaClient,
  createPrismaClientWithPool,
  createPrismaPool,
  seedDatabase,
  withTransaction,
} from '../src/index.js';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const SCHEMA_SQL = readFileSync(
  resolve(PACKAGE_ROOT, 'prisma/migrations/0001_phase02_core/migration.sql'),
  'utf8',
);
const PRISMA_SCHEMA = readFileSync(resolve(PACKAGE_ROOT, 'prisma/schema.prisma'), 'utf8');
const MIGRATION_LOCK = readFileSync(
  resolve(PACKAGE_ROOT, 'prisma/migrations/migration_lock.toml'),
  'utf8',
);

const EXPECTED_CHECK_CONSTRAINTS = [
  'chk_inventory_on_hand_nonneg',
  'chk_inventory_reserved_nonneg',
  'chk_inventory_reserved_lte_on_hand',
  'chk_stock_reservation_qty_pos',
  'chk_inventory_movement_delta_nonzero',
  'chk_variant_price_nonneg',
  'chk_variant_compare_at_nonneg',
  'chk_variant_weight_pos',
  'chk_cart_item_qty_pos',
  'chk_order_totals_nonneg',
  'chk_order_owner_or_guest',
  'chk_order_item_qty_pos',
  'chk_order_item_unit_price_nonneg',
  'chk_order_item_line_total_nonneg',
  'chk_payment_amount_pos',
  'chk_refund_amount_pos',
  'chk_coupon_value_pos',
  'chk_coupon_pct_bounds',
  'chk_return_item_qty_pos',
  'chk_review_rating_bounds',
] as const;

const EXPECTED_PARTIAL_INDEXES = [
  'uq_carts_active_user',
  'uq_carts_active_guest',
  'uq_product_3d_assets_active_version',
  'uq_addresses_default_per_user',
  'uq_wishlist_items_null_variant',
  'idx_outbox_pending',
] as const;

describe('@arven/database exports and client helpers', () => {
  it('exports PrismaClient, Prisma namespace, enums, and helper functions', () => {
    expect(typeof PrismaClient).toBe('function');
    expect(typeof Prisma).toBe('object');
    expect(typeof $Enums).toBe('object');
    expect(typeof createPrismaPool).toBe('function');
    expect(typeof createPrismaClient).toBe('function');
    expect(typeof createPrismaClientWithPool).toBe('function');
    expect(typeof withTransaction).toBe('function');
    expect(typeof seedDatabase).toBe('function');
  });

  it('rejects empty connection strings and invalid pool sizes fail-closed', async () => {
    expect(() => createPrismaPool('   ')).toThrow(/connectionString is required/i);
    expect(() => createPrismaPool('postgresql://user:pass@127.0.0.1:5432/db', 0)).toThrow(
      /positive integer/i,
    );

    const pool = createPrismaPool('postgresql://user:pass@127.0.0.1:5432/arven_test', 4);
    expect(pool.options.max).toBe(4);
    expect(pool.options.idleTimeoutMillis).toBe(30_000);
    expect(pool.options.statement_timeout).toBe(10_000);
    await pool.end();
  });
});

describe('Canonical Prisma 7 schema & migration SQL invariants', () => {
  it('enforces all 25 Prisma enums and AMB-01 / AMB-03 enum resolutions', () => {
    expect(Object.keys($Enums)).toHaveLength(25);
    expect(Object.values(ProductStatus)).toEqual([
      'DRAFT',
      'REVIEW',
      'READY_TO_PUBLISH',
      'PUBLISHED',
      'ARCHIVED',
    ]);
    expect(Object.values(InventoryMovementType)).toEqual([
      'RECEIPT',
      'RESERVATION',
      'RELEASE',
      'SALE',
      'ADJUSTMENT',
      'RETURN_TO_STOCK',
    ]);
    expect(Object.values(InventoryMovementType)).not.toContain('COMMIT');
  });

  it('uses Prisma 7 prisma-client ESM format without legacy datasource url', () => {
    expect(PRISMA_SCHEMA).toContain('provider               = "prisma-client"');
    expect(PRISMA_SCHEMA).toContain('importFileExtension    = "js"');
    expect(PRISMA_SCHEMA).not.toMatch(/url\s*=\s*env\(/);
    expect(PRISMA_SCHEMA).toContain('mfaLastTimeStep');
    expect(PRISMA_SCHEMA).toContain('@@map("mfa_recovery_codes")');
    expect(PRISMA_SCHEMA).toContain('@map("quantity_on_hand")');
    expect(PRISMA_SCHEMA).toContain('@map("quantity_reserved")');
    expect(PRISMA_SCHEMA).toMatch(/model Order \{[\s\S]*?userId\s+String\?\s+@map\("user_id"\)/);
  });

  it('ships 0001_phase02_core SQL with 25 enums, 48 tables, all CHECKs, partial indexes, and immutable audit trigger', () => {
    expect(MIGRATION_LOCK).toContain('provider = "postgresql"');

    const enumStatements = SCHEMA_SQL.match(/^CREATE TYPE "/gm) ?? [];
    const tableStatements = SCHEMA_SQL.match(/^CREATE TABLE "/gm) ?? [];
    expect(enumStatements).toHaveLength(25);
    expect(tableStatements).toHaveLength(48);

    for (const constraintName of EXPECTED_CHECK_CONSTRAINTS) {
      expect(SCHEMA_SQL).toContain(constraintName);
    }

    for (const indexName of EXPECTED_PARTIAL_INDEXES) {
      expect(SCHEMA_SQL).toContain(indexName);
    }

    expect(SCHEMA_SQL).toContain('CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()');
    expect(SCHEMA_SQL).toContain('CREATE TRIGGER trg_audit_logs_immutable');
    expect(SCHEMA_SQL).toContain('BEFORE UPDATE OR DELETE ON audit_logs');
  });
});

describe('Seed matrix alignment & fail-closed guards', () => {
  it('aligns 8 roles and 36 permissions with @arven/config RBAC matrix', () => {
    expect(ROLE_CODES).toHaveLength(8);
    expect(Object.keys(ARVEN_ROLE_DEFINITIONS)).toEqual([...ROLE_CODES]);
    expect(PERMISSION_CODES).toHaveLength(36);

    for (const code of PERMISSION_CODES) {
      expect(PERMISSION_DESCRIPTIONS[code]).toBeDefined();
    }

    for (const roleCode of ROLE_CODES) {
      const assigned = ROLE_PERMISSION_MATRIX[roleCode];
      for (const permissionCode of assigned) {
        expect(PERMISSION_CODES).toContain(permissionCode);
      }
    }
  });

  it('aligns reference warehouse, 4 collections, 5 categories, and 6 SKUs with PRD', () => {
    expect(ARVEN_SEED_WAREHOUSE.code).toBe('JKT-MAIN-01');
    expect(ARVEN_SEED_COLLECTIONS.map((c) => c.slug)).toEqual([
      'essentials',
      'form',
      'atelier',
      'movement',
    ]);
    expect(ARVEN_SEED_CATEGORIES.map((c) => c.slug)).toEqual([
      'tops',
      'bottoms',
      'outerwear',
      'footwear',
      'accessories',
    ]);
    expect(ARVEN_SEED_PRODUCTS.map((p) => p.sku)).toEqual([
      'ARV-TOP-001',
      'ARV-TOP-002',
      'ARV-BOT-001',
      'ARV-OUT-001',
      'ARV-FW-001',
      'ARV-ACC-001',
    ]);
    expect(ARVEN_SEED_PRODUCTS.map((p) => p.priceIdr)).toEqual([
      299_000n,
      499_000n,
      649_000n,
      899_000n,
      1_299_000n,
      799_000n,
    ]);
  });

  it('refuses to seed development users in production or without a valid password before opening a transaction', async () => {
    const uncalledClient = {
      $transaction: async () => {
        throw new Error('Transaction must not execute when fail-closed guard rejects');
      },
    } as unknown as PrismaClient;

    await expect(
      seedDatabase(uncalledClient, {
        nodeEnv: 'production',
        seedDevUsers: true,
        devUserPassword: 'ValidDevPassword123!',
      }),
    ).rejects.toThrow(/NODE_ENV=production/);

    await expect(
      seedDatabase(uncalledClient, {
        nodeEnv: 'development',
        seedDevUsers: true,
        devUserPassword: '',
      }),
    ).rejects.toThrow(/SEED_DEV_USER_PASSWORD is required/);

    await expect(
      seedDatabase(uncalledClient, {
        nodeEnv: 'development',
        seedDevUsers: true,
        devUserPassword: 'too-short',
      }),
    ).rejects.toThrow(/length must be between 12 and 128/);
  });
});
