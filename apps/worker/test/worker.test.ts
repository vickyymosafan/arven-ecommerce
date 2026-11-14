import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getQueueToken } from '@nestjs/bullmq';
import { NestFactory } from '@nestjs/core';
import {
  BULLMQ_QUEUES,
  QUEUE_NAMES,
  validateRuntimeConfig,
  type RuntimeConfig,
} from '@arven/config';
import type { Queue } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';
import { WorkerLocalCaptureEmailAdapter } from '../src/adapters/worker-email.provider.js';
import {
  computeRetryDelayMs,
  resolveQueueForOutboxEvent,
} from '../src/outbox/outbox-routing.js';
import {
  buildBullMqConnectionOptions,
  WorkerModule,
} from '../src/worker.module.js';

function buildTestConfig(emailDir: string): RuntimeConfig {
  return validateRuntimeConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DATABASE_URL: 'postgresql://arven:test@127.0.0.1:5432/arven_test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    SESSION_SECRET: 'worker-test-session-secret-0123456789abcdef',
    CSRF_SECRET: 'worker-test-csrf-secret-0123456789abcdef',
    MFA_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    EMAIL_DRIVER: 'local_capture',
    EMAIL_LOCAL_DIR: emailDir,
    STORAGE_DRIVER: 'local_fs',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:3001',
  });
}

async function waitForCapturedJson(
  captureDir: string,
  timeoutMs = 8000,
): Promise<{ fileName: string; parsed: Record<string, unknown> }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = await readdir(captureDir);
    const jsonFiles = entries.filter(
      (name) => name.endsWith('.json') && !name.startsWith('.'),
    );
    if (jsonFiles.length > 0 && jsonFiles[0]) {
      const content = await readFile(path.join(captureDir, jsonFiles[0]), 'utf8');
      return {
        fileName: jsonFiles[0],
        parsed: JSON.parse(content) as Record<string, unknown>,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for captured email in ${captureDir}`);
}

describe('worker unit & Memurai queue integration', () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it('routes canonical outbox events across all 8 BullMQ queues', () => {
    expect(BULLMQ_QUEUES).toHaveLength(8);
    expect(resolveQueueForOutboxEvent('auth.verification.requested')).toBe(
      QUEUE_NAMES.NOTIFICATION,
    );
    expect(resolveQueueForOutboxEvent('user.registered')).toBe(
      QUEUE_NAMES.NOTIFICATION,
    );
    expect(resolveQueueForOutboxEvent('payment.succeeded')).toBe(QUEUE_NAMES.PAYMENT);
    expect(resolveQueueForOutboxEvent('refund.completed')).toBe(QUEUE_NAMES.PAYMENT);
    expect(resolveQueueForOutboxEvent('inventory.reserved')).toBe(
      QUEUE_NAMES.INVENTORY,
    );
    expect(resolveQueueForOutboxEvent('order.created')).toBe(QUEUE_NAMES.ORDER);
    expect(resolveQueueForOutboxEvent('return.requested')).toBe(QUEUE_NAMES.ORDER);
    expect(resolveQueueForOutboxEvent('shipment.dispatched')).toBe(
      QUEUE_NAMES.SHIPPING,
    );
    expect(resolveQueueForOutboxEvent('asset.published')).toBe(
      QUEUE_NAMES.THREE_D_ASSETS,
    );
    expect(resolveQueueForOutboxEvent('media.thumbnail.requested')).toBe(
      QUEUE_NAMES.MEDIA,
    );
    expect(resolveQueueForOutboxEvent('product.published')).toBe(QUEUE_NAMES.ANALYTICS);
  });

  it('computes bounded exponential retry delays', () => {
    expect(computeRetryDelayMs(1)).toBe(2000);
    expect(computeRetryDelayMs(2)).toBe(4000);
    expect(computeRetryDelayMs(12)).toBe(256_000);
  });

  it('parses BullMQ Redis connection options with maxRetriesPerRequest=null', () => {
    const standard = buildBullMqConnectionOptions('redis://user:pass@127.0.0.1:6379/2');
    expect(standard).toMatchObject({
      host: '127.0.0.1',
      port: 6379,
      username: 'user',
      password: 'pass',
      db: 2,
      maxRetriesPerRequest: null,
    });

    const secure = buildBullMqConnectionOptions('rediss://cache.example.com:6380');
    expect(secure).toMatchObject({
      host: 'cache.example.com',
      port: 6380,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });

  it('fails closed when instantiating WorkerLocalCaptureEmailAdapter in production', () => {
    expect(
      () =>
        new WorkerLocalCaptureEmailAdapter({
          captureDir: './.local/emails',
          defaultFrom: 'ARVEN <noreply@arven.test>',
          nodeEnv: 'production',
        }),
    ).toThrow(/production/i);
  });

  it('connects all 8 queues to Memurai and processes a notification job via local_capture', async () => {
    const emailDir = await mkdtemp(path.join(os.tmpdir(), 'arven-worker-mail-'));
    tempDirs.push(emailDir);

    const config = buildTestConfig(emailDir);
    const app = await NestFactory.createApplicationContext(
      WorkerModule.forRoot(config),
      { logger: false },
    );

    const notificationQueue = app.get<Queue>(
      getQueueToken(QUEUE_NAMES.NOTIFICATION),
    );
    const jobId = `verify-${Date.now()}`;

    try {
      for (const queueName of BULLMQ_QUEUES) {
        const queue = app.get<Queue>(getQueueToken(queueName));
        expect(queue.name).toBe(queueName);
      }

      const job = await notificationQueue.add(
        'auth.verification.requested',
        {
          eventType: 'auth.verification.requested',
          payload: {
            email: 'client.test@example.com',
            recipientName: 'Sora <Atelier>',
            actionUrl: 'https://arven.test/verify?token=opaque-test-token-1234',
          },
        },
        {
          jobId,
          removeOnComplete: true,
        },
      );

      const captured = await waitForCapturedJson(emailDir);
      expect(captured.parsed['to']).toBe('client.test@example.com');
      expect(captured.parsed['subject']).toBe('Confirm your ARVEN email address');

      const htmlName = captured.parsed['htmlFile'] as string;
      const htmlContent = await readFile(path.join(emailDir, htmlName), 'utf8');
      expect(htmlContent).toContain('Sora &lt;Atelier&gt;');
      expect(htmlContent).toContain(
        'https://arven.test/verify?token=opaque-test-token-1234',
      );

      await job.remove().catch(() => undefined);
    } finally {
      await app.close();
    }
  });
});
