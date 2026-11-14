import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUE_NAMES, type RuntimeConfig } from '@arven/config';
import { createLogger, type ArvenLogger } from '@arven/observability';
import type { Queue } from 'bullmq';
import { WORKER_CONFIG } from '../config/worker-config.module.js';
import { WorkerPrismaService } from '../prisma/worker-prisma.service.js';
import {
  computeRetryDelayMs,
  MAX_OUTBOX_ATTEMPTS,
  resolveQueueForOutboxEvent,
  type BullQueueName,
} from './outbox-routing.js';

interface OutboxPendingRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: number;
  payload: unknown;
  occurredAt: Date;
  attempts: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_BATCH_SIZE = 25;

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: ArvenLogger;
  private readonly queues: ReadonlyMap<BullQueueName, Queue>;
  private pollTimer: NodeJS.Timeout | undefined;
  private isPolling = false;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: RuntimeConfig,
    @Inject(WorkerPrismaService) private readonly prisma: WorkerPrismaService,
    @InjectQueue(QUEUE_NAMES.PAYMENT) paymentQueue: Queue,
    @InjectQueue(QUEUE_NAMES.INVENTORY) inventoryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ORDER) orderQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SHIPPING) shippingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.MEDIA) mediaQueue: Queue,
    @InjectQueue(QUEUE_NAMES.THREE_D_ASSETS) assets3dQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ANALYTICS) analyticsQueue: Queue,
  ) {
    this.logger = createLogger({
      service: '@arven/worker:outbox-relay',
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
    });
    this.queues = new Map<BullQueueName, Queue>([
      [QUEUE_NAMES.PAYMENT, paymentQueue],
      [QUEUE_NAMES.INVENTORY, inventoryQueue],
      [QUEUE_NAMES.ORDER, orderQueue],
      [QUEUE_NAMES.SHIPPING, shippingQueue],
      [QUEUE_NAMES.NOTIFICATION, notificationQueue],
      [QUEUE_NAMES.MEDIA, mediaQueue],
      [QUEUE_NAMES.THREE_D_ASSETS, assets3dQueue],
      [QUEUE_NAMES.ANALYTICS, analyticsQueue],
    ]);
  }

  onModuleInit(): void {
    if (this.config.NODE_ENV !== 'test') {
      this.startPolling();
    }
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  startPolling(intervalMs = DEFAULT_POLL_INTERVAL_MS): void {
    if (this.pollTimer) {
      return;
    }
    this.pollTimer = setInterval(() => {
      if (this.isPolling) {
        return;
      }
      this.isPolling = true;
      void this.pollOnce()
        .catch((error: unknown) => {
          this.logger.error(
            {
              errorMessage: error instanceof Error ? error.message : 'Unknown outbox error',
            },
            'Outbox poll cycle failed',
          );
        })
        .finally(() => {
          this.isPolling = false;
        });
    }, intervalMs);
    this.pollTimer.unref?.();
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  async pollOnce(batchSize = DEFAULT_BATCH_SIZE): Promise<number> {
    return this.prisma.withTransaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxPendingRow[]>`
        SELECT
          id,
          aggregate_type AS "aggregateType",
          aggregate_id AS "aggregateId",
          event_type AS "eventType",
          schema_version AS "schemaVersion",
          payload,
          occurred_at AS "occurredAt",
          attempts
        FROM outbox_events
        WHERE status = 'PENDING'
          AND published_at IS NULL
          AND next_attempt_at <= NOW()
        ORDER BY occurred_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;

      let processedCount = 0;

      for (const row of rows) {
        const targetQueueName = resolveQueueForOutboxEvent(row.eventType);
        const queue = this.queues.get(targetQueueName);
        if (!queue) {
          throw new Error(`No BullMQ queue registered for ${targetQueueName}`);
        }

        const nextAttempts = row.attempts + 1;
        try {
          await queue.add(
            row.eventType,
            {
              outboxEventId: row.id,
              aggregateType: row.aggregateType,
              aggregateId: row.aggregateId,
              eventType: row.eventType,
              schemaVersion: row.schemaVersion,
              payload: row.payload,
              occurredAtUtc:
                row.occurredAt instanceof Date
                  ? row.occurredAt.toISOString()
                  : String(row.occurredAt),
            },
            {
              jobId: row.id,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
              removeOnComplete: 500,
              removeOnFail: 1000,
            },
          );

          await tx.outboxEvent.update({
            where: { id: row.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              attempts: nextAttempts,
              lastError: null,
            },
          });
          processedCount += 1;
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message.slice(0, 500) : 'Outbox dispatch failed';
          const exhausted = nextAttempts >= MAX_OUTBOX_ATTEMPTS;

          await tx.outboxEvent.update({
            where: { id: row.id },
            data: {
              status: exhausted ? 'FAILED' : 'PENDING',
              attempts: nextAttempts,
              nextAttemptAt: new Date(Date.now() + computeRetryDelayMs(nextAttempts)),
              lastError: message,
            },
          });

          this.logger.warn(
            {
              outboxEventId: row.id,
              eventType: row.eventType,
              queueName: targetQueueName,
              attempts: nextAttempts,
              exhausted,
            },
            'Failed to enqueue outbox event',
          );
        }
      }

      return processedCount;
    });
  }
}
