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

export type ShippingJobData = OutboxJobEnvelope;

const NOTIFIABLE_SHIPPING_EVENTS = new Set<string>([
  'shipment.dispatched',
  'shipment.delivered',
]);

@Processor(QUEUE_NAMES.SHIPPING)
export class ShippingProcessor extends WorkerHost {
  private readonly logger: ArvenLogger;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: RuntimeConfig,
    @Inject(WorkerPrismaService) private readonly prisma: WorkerPrismaService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
  ) {
    super();
    this.logger = createLogger({
      service: '@arven/worker:shipping',
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
    });
  }

  async process(
    job: Job<ShippingJobData>,
  ): Promise<{ acknowledged: boolean; eventType: string; notificationEnqueued: boolean }> {
    const data = job.data ?? {};
    const eventType = data.eventType ?? job.name;
    const payload =
      data.payload && typeof data.payload === 'object' ? data.payload : undefined;

    let orderId = resolveOrderIdFromJob(data, payload);
    const shipmentId =
      readStringField(payload, 'shipmentId') ??
      (data.aggregateType === 'shipment' && isUuid(data.aggregateId)
        ? data.aggregateId
        : undefined);

    let enrichedPayload: Record<string, unknown> | undefined = payload ? { ...payload } : undefined;

    if (
      isUuid(shipmentId) &&
      (!orderId || !readStringField(enrichedPayload, 'trackingNumber'))
    ) {
      const shipment = await this.prisma.client.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          orderId: true,
          trackingNumber: true,
          provider: true,
          serviceCode: true,
        },
      });
      if (shipment) {
        orderId = orderId ?? shipment.orderId;
        enrichedPayload = {
          ...(enrichedPayload ?? {}),
          shipmentId,
          orderId,
          ...(shipment.trackingNumber ? { trackingNumber: shipment.trackingNumber } : {}),
          provider: shipment.provider,
          serviceCode: shipment.serviceCode,
        };
      }
    }

    if (NOTIFIABLE_SHIPPING_EVENTS.has(eventType)) {
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
          shipmentId: shipmentId ?? null,
          orderId: orderId ?? null,
          orderNumber: notificationResult.orderNumber ?? null,
          notificationEnqueued: notificationResult.enqueued,
        },
        'Processed shipping lifecycle event',
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
        shipmentId: shipmentId ?? null,
        orderId: orderId ?? null,
      },
      'Processed shipping queue event',
    );

    return {
      acknowledged: true,
      eventType,
      notificationEnqueued: false,
    };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ShippingJobData> | undefined, error: Error): void {
    this.logger.error(
      {
        jobId: job?.id ?? null,
        eventType: job?.data?.eventType ?? job?.name ?? 'unknown',
        attemptsMade: job?.attemptsMade ?? 0,
        errorName: error.name,
        errorMessage: error.message,
      },
      'Shipping job failed',
    );
  }
}
