import { Module, type DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BULLMQ_QUEUES, type RuntimeConfig } from '@arven/config';
import type { ConnectionOptions } from 'bullmq';
import {
  createWorkerEmailProvider,
  WORKER_EMAIL_PROVIDER,
  type WorkerEmailProvider,
} from './adapters/worker-email.provider.js';
import { WORKER_CONFIG, WorkerConfigModule } from './config/worker-config.module.js';
import { OutboxRelayService } from './outbox/outbox-relay.service.js';
import { WorkerPrismaService } from './prisma/worker-prisma.service.js';
import { InventoryExpiryProcessor } from './processors/inventory.processor.js';
import { NotificationsProcessor } from './processors/notifications.processor.js';
import { OrderProcessor } from './processors/order.processor.js';
import { PaymentProcessor } from './processors/payment.processor.js';
import { ShippingProcessor } from './processors/shipping.processor.js';
import { ThreeDAssetsProcessor } from './processors/three-d-assets.processor.js';

export function buildBullMqConnectionOptions(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  const dbSegment = parsed.pathname.replace(/^\//, '');
  const db = dbSegment ? Number(dbSegment) : undefined;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db !== undefined && Number.isInteger(db) ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

@Module({})
export class WorkerModule {
  static forRoot(configOverride?: RuntimeConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        WorkerConfigModule.forRoot(configOverride),
        BullModule.forRootAsync({
          inject: [WORKER_CONFIG],
          useFactory: (config: RuntimeConfig) => ({
            connection: buildBullMqConnectionOptions(config.REDIS_URL),
          }),
        }),
        BullModule.registerQueue(...BULLMQ_QUEUES.map((name) => ({ name }))),
      ],
      providers: [
        WorkerPrismaService,
        {
          provide: WORKER_EMAIL_PROVIDER,
          inject: [WORKER_CONFIG],
          useFactory: (config: RuntimeConfig): WorkerEmailProvider =>
            createWorkerEmailProvider(config),
        },
        OutboxRelayService,
        NotificationsProcessor,
        InventoryExpiryProcessor,
        PaymentProcessor,
        OrderProcessor,
        ShippingProcessor,
        ThreeDAssetsProcessor,
      ],
      exports: [
        WorkerPrismaService,
        WORKER_EMAIL_PROVIDER,
        OutboxRelayService,
        NotificationsProcessor,
        InventoryExpiryProcessor,
        PaymentProcessor,
        OrderProcessor,
        ShippingProcessor,
        ThreeDAssetsProcessor,
        BullModule,
      ],
    };
  }
}
