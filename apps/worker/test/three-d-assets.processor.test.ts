import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getQueueToken } from '@nestjs/bullmq';
import { NestFactory } from '@nestjs/core';
import {
  loadRuntimeConfig,
  QUEUE_NAMES,
  type RuntimeConfig,
} from '@arven/config';
import { AssetFormat, AssetStatus } from '@arven/database';
import { buildArvenGarmentGlbBuffer } from '@arven/three-engine/glb';
import type { Job, Queue } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveQueueForOutboxEvent } from '../src/outbox/outbox-routing.js';
import { WorkerPrismaService } from '../src/prisma/worker-prisma.service.js';
import {
  ThreeDAssetsProcessor,
  type ThreeDAssetsJobData,
} from '../src/processors/three-d-assets.processor.js';
import { WorkerModule } from '../src/worker.module.js';

function buildTestConfig(storageDir: string, emailDir: string): RuntimeConfig {
  const base = loadRuntimeConfig();
  const redisUrl = new URL(base.REDIS_URL);
  redisUrl.pathname = '/13';
  return Object.freeze({
    ...base,
    NODE_ENV: 'test' as const,
    LOG_LEVEL: 'error' as const,
    REDIS_URL: redisUrl.toString(),
    EMAIL_DRIVER: 'local_capture' as const,
    EMAIL_LOCAL_DIR: emailDir,
    STORAGE_DRIVER: 'local_fs' as const,
    STORAGE_LOCAL_DIR: storageDir,
  });
}

describe('Phase 07 ThreeDAssetsProcessor', () => {
  const tempDirs: string[] = [];
  const createdAssetIds: string[] = [];

  afterAll(async () => {
    const base = loadRuntimeConfig();
    const prismaService = new WorkerPrismaService(base);
    try {
      if (createdAssetIds.length > 0) {
        await prismaService.client.assetValidationRun.deleteMany({
          where: { assetId: { in: createdAssetIds } },
        });
        await prismaService.client.product3DAsset.deleteMany({
          where: { id: { in: createdAssetIds } },
        });
      }
    } finally {
      await prismaService.onModuleDestroy();
      await Promise.all(
        tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
      );
    }
  });

  it('registers ThreeDAssetsProcessor in WorkerModule and routes asset.* events to 3d-assets queue', async () => {
    expect(resolveQueueForOutboxEvent('asset.validation.requested')).toBe(
      QUEUE_NAMES.THREE_D_ASSETS,
    );
    expect(resolveQueueForOutboxEvent('asset.published')).toBe(
      QUEUE_NAMES.THREE_D_ASSETS,
    );

    const storageDir = await mkdtemp(path.join(os.tmpdir(), 'arven-3d-wk-storage-'));
    const emailDir = await mkdtemp(path.join(os.tmpdir(), 'arven-3d-wk-email-'));
    tempDirs.push(storageDir, emailDir);

    const app = await NestFactory.createApplicationContext(
      WorkerModule.forRoot(buildTestConfig(storageDir, emailDir)),
      { logger: false },
    );

    try {
      const processor = app.get(ThreeDAssetsProcessor);
      expect(processor).toBeInstanceOf(ThreeDAssetsProcessor);
      const queue = app.get<Queue>(getQueueToken(QUEUE_NAMES.THREE_D_ASSETS));
      expect(queue.name).toBe(QUEUE_NAMES.THREE_D_ASSETS);
    } finally {
      await app.close();
    }
  });

  it('validates staged binary GLB -> READY and transitions malformed GLB -> FAILED', async () => {
    const storageDir = await mkdtemp(path.join(os.tmpdir(), 'arven-3d-wk-val-'));
    const emailDir = await mkdtemp(path.join(os.tmpdir(), 'arven-3d-wk-email2-'));
    tempDirs.push(storageDir, emailDir);

    const cfg = buildTestConfig(storageDir, emailDir);
    const app = await NestFactory.createApplicationContext(
      WorkerModule.forRoot(cfg),
      { logger: false },
    );

    try {
      const prismaService = app.get(WorkerPrismaService);
      const processor = app.get(ThreeDAssetsProcessor);

      const product = await prismaService.client.product.findFirstOrThrow({
        where: { slug: 'essentials-heavyweight-crew-tee' },
        select: { id: true, slug: true },
      });

      const maxVersion = await prismaService.client.product3DAsset.aggregate({
        where: { productId: product.id },
        _max: { version: true },
      });
      const vGood = (maxVersion._max.version ?? 1) + 100;
      const vBad = vGood + 1;

      const goodStagingKey = `staging/test/${vGood}/model.glb`;
      const badStagingKey = `staging/test/${vBad}/model.glb`;

      const goodFullPath = path.join(storageDir, 'staging', ...goodStagingKey.split('/'));
      const badFullPath = path.join(storageDir, 'staging', ...badStagingKey.split('/'));
      await mkdir(path.dirname(goodFullPath), { recursive: true });
      await mkdir(path.dirname(badFullPath), { recursive: true });

      await writeFile(
        goodFullPath,
        buildArvenGarmentGlbBuffer({ silhouette: 'tee' }),
      );
      await writeFile(badFullPath, Buffer.from('<script>alert(1)</script>', 'utf8'));

      const goodAsset = await prismaService.client.product3DAsset.create({
        data: {
          productId: product.id,
          version: vGood,
          format: AssetFormat.GLB,
          objectKey: `test/${product.id}/v${vGood}/model.glb`,
          posterKey: `test/${product.id}/v${vGood}/poster.svg`,
          bytes: 100n,
          status: AssetStatus.PROCESSING,
          config: { stagingKey: goodStagingKey },
        },
      });
      const badAsset = await prismaService.client.product3DAsset.create({
        data: {
          productId: product.id,
          version: vBad,
          format: AssetFormat.GLB,
          objectKey: `test/${product.id}/v${vBad}/model.glb`,
          posterKey: `test/${product.id}/v${vBad}/poster.svg`,
          bytes: 25n,
          status: AssetStatus.PROCESSING,
          config: { stagingKey: badStagingKey },
        },
      });
      createdAssetIds.push(goodAsset.id, badAsset.id);

      const goodOutcome = await processor.process({
        id: `job-${goodAsset.id}`,
        name: 'asset.validation.requested',
        data: {
          eventType: 'asset.validation.requested',
          assetId: goodAsset.id,
          stagingKey: goodStagingKey,
        },
      } as Job<ThreeDAssetsJobData>);
      expect(goodOutcome.status).toBe(AssetStatus.READY);

      const badOutcome = await processor.process({
        id: `job-${badAsset.id}`,
        name: 'asset.validation.requested',
        data: {
          eventType: 'asset.validation.requested',
          assetId: badAsset.id,
          stagingKey: badStagingKey,
        },
      } as Job<ThreeDAssetsJobData>);
      expect(badOutcome.status).toBe(AssetStatus.FAILED);

      const badDb = await prismaService.client.product3DAsset.findUnique({
        where: { id: badAsset.id },
        include: { validationRuns: true },
      });
      expect(badDb?.status).toBe(AssetStatus.FAILED);
      expect(badDb?.validationRuns[0]?.status).toBe('FAILED');
      expect(badDb?.validationRuns[0]?.errorSummary).toMatch(/polyglot|magic/i);
    } finally {
      await app.close();
    }
  });
});
