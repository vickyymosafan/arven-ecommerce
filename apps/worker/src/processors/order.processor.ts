import { Inject } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUE_NAMES, type RuntimeConfig } from '@arven/config';
import { createLogger, type ArvenLogger } from '@arven/observability';
import type { Job, Queue } from 'bullmq';
import { WORKER_CONFIG } from '../config/worker-config.module.js';
import { WorkerPrismaService } from '../prisma/worker-prisma.service.js';
import {
  enqueueOrderNotification,
  resolveOrderIdFromJob,
  type OutboxJobEnvelope,
} from './processor-utils.js';

export type OrderJobData = OutboxJobEnvelope;

@Processor(QUEUE_NAMES.ORDER)
export class OrderProcessor extends WorkerHost {
  private readonly logger: ArvenLogger;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: RuntimeConfig,
    @Inject(WorkerPrismaService) private readonly prisma: WorkerPrismaService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
  ) {
    super();
    this.logger = createLogger({
      service: '@arven/worker:order',
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
    });
  }

  async process(
    job: Job<OrderJobData>,
  ): Promise<{ acknowledged: boolean; eventType: string; notificationEnqueued: boolean }> {
    const data = job.data ?? {};
    const eventType = data.eventType ?? job.name;
    const payload =
      data.payload && typeof data.payload === 'object' ? data.payload : undefined;
    const orderId = resolveOrderIdFromJob(data, payload);

    if (eventType === 'order.created' || eventType === 'order.ready_to_ship') {
      const notificationResult = await enqueueOrderNotification({
        notificationQueue: this.notificationQueue,
        prisma: this.prisma,
        eventType,
        ...(data.outboxEventId ? { outboxEventId: data.outboxEventId } : {}),
        ...(job.id !== undefined ? { jobId: String(job.id) } : {}),
        ...(orderId ? { orderId } : {}),
        ...(payload ? { payload } : {}),
      });

      this.logger.info(
        {
          jobId: job.id ?? null,
          outboxEventId: data.outboxEventId ?? null,
          eventType,
          orderId: orderId ?? null,
          orderNumber: notificationResult.orderNumber ?? null,
          notificationEnqueued: notificationResult.enqueued,
        },
        'Processed order lifecycle event',
      );

      return {
        acknowledged: true,
        eventType,
        notificationEnqueued: notificationResult.enqueued,
      };
    }

    this.logger.info(
      {
        jobId: job.id ?? null,
        outboxEventId: data.outboxEventId ?? null,
        eventType,
        orderId: orderId ?? null,
      },
      'Processed order queue event',
    );

    return {
      acknowledged: true,
      eventType,
      notificationEnqueued: false,
    };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<OrderJobData> | undefined, error: Error): void {
    this.logger.error(
      {
        jobId: job?.id ?? null,
        eventType: job?.data?.eventType ?? job?.name ?? 'unknown',
        attemptsMade: job?.attemptsMade ?? 0,
        errorName: error.name,
        errorMessage: error.message,
      },
      'Order job failed',
    );
  }
}
