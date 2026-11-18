import { Inject } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUE_NAMES, type RuntimeConfig } from '@arven/config';
import { createLogger, type ArvenLogger } from '@arven/observability';
import type { Job, Queue } from 'bullmq';
import { WORKER_CONFIG } from '../config/worker-config.module.js';
import { WorkerPrismaService } from '../prisma/worker-prisma.service.js';
import {
  enqueueOrderNotification,
  isUuid,
  readStringField,
  resolveOrderIdFromJob,
  type OutboxJobEnvelope,
} from './processor-utils.js';

export type OrderJobData = OutboxJobEnvelope;

const NOTIFIABLE_ORDER_QUEUE_EVENTS = new Set<string>([
  'order.created',
  'order.ready_to_ship',
  'return.requested',
  'return.approved',
  'return.rejected',
  'return.received',
]);

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
    let orderId = resolveOrderIdFromJob(data, payload);
    const returnId =
      readStringField(payload, 'returnId') ??
      (data.aggregateType === 'return' && isUuid(data.aggregateId)
        ? data.aggregateId
        : undefined);
    let enrichedPayload: Record<string, unknown> | undefined = payload ? { ...payload } : undefined;

    if (eventType.startsWith('return.') && !orderId && isUuid(returnId)) {
      const returnRecord = await this.prisma.client.return.findUnique({
        where: { id: returnId },
        select: {
          orderId: true,
          status: true,
          reason: true,
        },
      });
      if (returnRecord) {
        orderId = returnRecord.orderId;
        enrichedPayload = {
          ...(enrichedPayload ?? {}),
          returnId,
          orderId,
          returnStatus: returnRecord.status,
          reason: returnRecord.reason,
        };
      }
    }

    if (NOTIFIABLE_ORDER_QUEUE_EVENTS.has(eventType)) {
      const notificationResult = await enqueueOrderNotification({
        notificationQueue: this.notificationQueue,
        prisma: this.prisma,
        eventType,
        ...(data.outboxEventId ? { outboxEventId: data.outboxEventId } : {}),
        ...(job.id !== undefined ? { jobId: String(job.id) } : {}),
        ...(orderId ? { orderId } : {}),
        ...(enrichedPayload ? { payload: enrichedPayload } : {}),
      });

      this.logger.info(
        {
          jobId: job.id ?? null,
          outboxEventId: data.outboxEventId ?? null,
          eventType,
          orderId: orderId ?? null,
          returnId: returnId ?? null,
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
