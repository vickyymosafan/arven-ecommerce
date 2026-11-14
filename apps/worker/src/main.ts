import 'reflect-metadata';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { BULLMQ_QUEUES, loadRuntimeConfig } from '@arven/config';
import { createLogger } from '@arven/observability';
import { WorkerModule } from './worker.module.js';

export async function bootstrapWorker(): Promise<void> {
  const config = loadRuntimeConfig();
  const logger = createLogger({
    service: '@arven/worker',
    level: config.LOG_LEVEL,
    env: config.NODE_ENV,
  });

  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
    bufferLogs: true,
  });
  app.enableShutdownHooks();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Worker shutdown signal received');
    await app.close();
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  logger.info(
    {
      env: config.NODE_ENV,
      queues: [...BULLMQ_QUEUES],
    },
    'ARVEN BullMQ worker started',
  );
}

const entryHref = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === entryHref) {
  void bootstrapWorker().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Fatal worker startup error';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
