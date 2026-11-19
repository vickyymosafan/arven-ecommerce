import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { findWorkspaceEnvFile } from '@arven/config';
import { DEFAULT_ARVEN_MATERIAL_SLOTS, inspectAndValidateGlbBuffer } from '@arven/three-engine/glb';
import { describe, expect, it } from 'vitest';
import { AssetStatus, createPrismaClient, seedDatabase } from '../src/index.js';

describe('Phase 07 3D Assets & Customization Presets Seed Invariants', () => {
  it('seeds READY 3D assets, valid binary .glb files on disk, and non-pink presets in PostgreSQL 18', async () => {
    const envPath = findWorkspaceEnvFile();
    if (envPath) {
      loadDotenv({ path: envPath, quiet: true });
    }
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL required for Phase 07 seed verification');
    }

    const prisma = createPrismaClient({ connectionString: dbUrl });
    try {
      const seedRes = await seedDatabase(prisma, { seedDevUsers: false });
      expect(seedRes.assets3dUpserted).toBe(7);
      expect(seedRes.presets3dUpserted).toBeGreaterThanOrEqual(12);

      const featured3D = await prisma.product.findUnique({
        where: { slug: 'essentials-heavyweight-crew-tee' },
        include: {
          assets3d: {
            where: { isActiveVersion: true },
            include: {
              validationRuns: true,
              customizationPresets: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });

      expect(featured3D).not.toBeNull();
      expect(featured3D?.has3dEnabled).toBe(true);
      expect(featured3D?.assets3d).toHaveLength(1);
      const asset = featured3D?.assets3d[0];
      expect(asset?.status).toBe(AssetStatus.READY);
      expect(asset?.validationRuns.some((r) => r.status === 'PASSED')).toBe(true);
      expect(asset?.customizationPresets.length).toBeGreaterThanOrEqual(2);

      const repoRoot = envPath ? path.dirname(envPath) : process.cwd();
      const glbPath = path.resolve(repoRoot, '.local/storage/public', asset!.objectKey);
      expect(existsSync(glbPath)).toBe(true);
      const bytes = await readFile(glbPath);
      const validation = inspectAndValidateGlbBuffer(bytes, {
        profile: 'default',
        expectedMaterialSlots: DEFAULT_ARVEN_MATERIAL_SLOTS,
      });
      expect(validation.valid).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });
});
