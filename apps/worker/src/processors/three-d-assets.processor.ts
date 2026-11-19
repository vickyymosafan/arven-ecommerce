import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Inject } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUE_NAMES, type RuntimeConfig } from '@arven/config';
import { AssetStatus, AssetValidationStatus, type Prisma } from '@arven/database';
import { createLogger, type ArvenLogger } from '@arven/observability';
import {
  DEFAULT_ARVEN_MATERIAL_SLOTS,
  buildDefaultAssetConfig,
  inferSilhouetteFromSlug,
  inspectAndValidateGlbBuffer,
} from '@arven/three-engine/glb';
import type { Job } from 'bullmq';
import { WORKER_CONFIG } from '../config/worker-config.module.js';
import { WorkerPrismaService } from '../prisma/worker-prisma.service.js';
import { isUuid, readStringField, type OutboxJobEnvelope } from './processor-utils.js';

export type ThreeDAssetsJobData = OutboxJobEnvelope & {
  readonly assetId?: string;
  readonly stagingKey?: string;
  readonly mobileStagingKey?: string;
};

const VALIDATOR_VERSION = 'arven-glb-validator-1.0.0';

function findWorkspaceRoot(): string {
  let current = path.resolve(import.meta.dirname);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.resolve(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

function resolveLocalStorageFile(baseDir: string, scope: 'staging' | 'public', objectKey: string): string {
  const normalized = objectKey.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
    throw new Error(`Invalid object key for 3D worker: ${objectKey}`);
  }
  const resolvedBase = path.isAbsolute(baseDir)
    ? path.resolve(baseDir)
    : path.resolve(findWorkspaceRoot(), baseDir);
  const scopeRoot = path.resolve(resolvedBase, scope);
  const fullPath = path.resolve(scopeRoot, ...normalized.split('/'));
  const rel = path.relative(scopeRoot, fullPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Object key escapes storage root: ${objectKey}`);
  }
  return fullPath;
}

@Processor(QUEUE_NAMES.THREE_D_ASSETS)
export class ThreeDAssetsProcessor extends WorkerHost {
  private readonly logger: ArvenLogger;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: RuntimeConfig,
    @Inject(WorkerPrismaService) private readonly prisma: WorkerPrismaService,
  ) {
    super();
    this.logger = createLogger({
      service: '@arven/worker:3d-assets',
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
    });
  }

  async process(
    job: Job<ThreeDAssetsJobData>,
  ): Promise<{ acknowledged: boolean; eventType: string; assetId: string | null; status?: string }> {
    const data = job.data ?? {};
    const eventType = data.eventType ?? job.name;
    const payload =
      data.payload && typeof data.payload === 'object' ? data.payload : undefined;

    const assetId =
      data.assetId ??
      readStringField(payload, 'assetId') ??
      (data.aggregateType === 'asset3d' && isUuid(data.aggregateId)
        ? data.aggregateId
        : undefined);

    if (!isUuid(assetId)) {
      this.logger.info(
        { jobId: job.id ?? null, eventType },
        'Processed 3D assets informational job without assetId',
      );
      return { acknowledged: true, eventType, assetId: null };
    }

    if (eventType !== 'asset.validation.requested' && eventType !== 'asset3d.validate') {
      this.logger.info(
        { jobId: job.id ?? null, eventType, assetId },
        'Acknowledged 3D asset lifecycle outbox event',
      );
      return { acknowledged: true, eventType, assetId };
    }

    const asset = await this.prisma.client.product3DAsset.findUnique({
      where: { id: assetId },
      include: {
        product: {
          select: { id: true, slug: true },
        },
      },
    });

    if (!asset) {
      return { acknowledged: true, eventType, assetId, status: 'NOT_FOUND' };
    }

    // Already validated synchronously or by a prior run
    if (asset.status === AssetStatus.READY || asset.status === AssetStatus.FAILED) {
      return { acknowledged: true, eventType, assetId, status: asset.status };
    }

    const startedAt = new Date();
    const rawConfig = (asset.config && typeof asset.config === 'object'
      ? asset.config
      : {}) as Record<string, unknown>;
    const stagingKey =
      data.stagingKey ??
      readStringField(payload, 'stagingKey') ??
      (typeof rawConfig['stagingKey'] === 'string' ? rawConfig['stagingKey'] : asset.objectKey);

    try {
      const storagePath = resolveLocalStorageFile(
        this.config.STORAGE_LOCAL_DIR,
        'staging',
        stagingKey,
      );
      const glbBuffer = await readFile(storagePath);
      const result = inspectAndValidateGlbBuffer(glbBuffer, {
        profile: 'default',
        expectedMaterialSlots: DEFAULT_ARVEN_MATERIAL_SLOTS,
      });

      const nextStatus = result.valid ? AssetStatus.READY : AssetStatus.FAILED;
      const runStatus = result.valid
        ? AssetValidationStatus.PASSED
        : AssetValidationStatus.FAILED;

      const updatedConfig = result.valid
        ? buildDefaultAssetConfig({
            silhouette: inferSilhouetteFromSlug(asset.product.slug),
            defaultProfile: {
              triangles: result.triangleCount,
              vertices: result.vertexCount,
              bytes: result.bytes,
            },
            liteProfile: {
              triangles: result.triangleCount,
              vertices: result.vertexCount,
              bytes: result.bytes,
            },
          })
        : rawConfig;

      await this.prisma.withTransaction(async (tx) => {
        await tx.product3DAsset.update({
          where: { id: asset.id },
          data: {
            status: nextStatus,
            bytes: BigInt(result.bytes),
            config: updatedConfig as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.assetValidationRun.create({
          data: {
            assetId: asset.id,
            status: runStatus,
            validatorVersion: VALIDATOR_VERSION,
            report: {
              bytes: result.bytes,
              triangleCount: result.triangleCount,
              vertexCount: result.vertexCount,
              meshNames: result.meshNames,
              materialNames: result.materialNames,
              boundsMin: result.boundsMin,
              boundsMax: result.boundsMax,
              errors: result.errors,
            } as unknown as Prisma.InputJsonValue,
            errorSummary: result.valid ? null : result.errors.join('; '),
            startedAt,
            completedAt: new Date(),
          },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'asset3d',
            aggregateId: asset.id,
            eventType: 'asset.validation.completed',
            schemaVersion: 1,
            payload: {
              assetId: asset.id,
              productId: asset.productId,
              status: nextStatus,
              valid: result.valid,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      });

      this.logger.info(
        { jobId: job.id ?? null, assetId, status: nextStatus, triangles: result.triangleCount },
        'Completed asynchronous 3D asset validation run',
      );

      return { acknowledged: true, eventType, assetId, status: nextStatus };
    } catch (error) {
      const summary =
        error instanceof Error ? error.message.slice(0, 500) : 'Worker validation failed';
      await this.prisma.withTransaction(async (tx) => {
        await tx.product3DAsset.update({
          where: { id: asset.id },
          data: { status: AssetStatus.FAILED },
        });
        await tx.assetValidationRun.create({
          data: {
            assetId: asset.id,
            status: AssetValidationStatus.FAILED,
            validatorVersion: VALIDATOR_VERSION,
            report: { errors: [summary] } as unknown as Prisma.InputJsonValue,
            errorSummary: summary,
            startedAt,
            completedAt: new Date(),
          },
        });
      });
      return { acknowledged: true, eventType, assetId, status: AssetStatus.FAILED };
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ThreeDAssetsJobData> | undefined, error: Error): void {
    this.logger.error(
      {
        jobId: job?.id ?? null,
        assetId: job?.data?.assetId ?? null,
        errorName: error.name,
        errorMessage: error.message,
      },
      '3D asset validation job failed',
    );
  }
}
