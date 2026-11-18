import { Inject, type OnModuleInit } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { CHECKOUT_POLICY, QUEUE_NAMES, type RuntimeConfig } from '@arven/config';
import { OrderStatus, PaymentStatus, StockReservationStatus } from '@arven/database';
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

export type PaymentJobData = OutboxJobEnvelope;

export interface PaymentReconcileResult {
  readonly expiredPayments: number;
  readonly expiredOrders: number;
  readonly skippedPayments: number;
}

interface StalePendingPaymentRow {
  id: string;
  orderId: string;
  orderStatus: OrderStatus;
  paymentExpiresAt: Date;
}

const DEFAULT_RECONCILE_BATCH_SIZE = 25;

@Processor(QUEUE_NAMES.PAYMENT)
export class PaymentProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger: ArvenLogger;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: RuntimeConfig,
    @Inject(WorkerPrismaService) private readonly prisma: WorkerPrismaService,
    @InjectQueue(QUEUE_NAMES.PAYMENT) private readonly paymentQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
  ) {
    super();
    this.logger = createLogger({
      service: '@arven/worker:payment',
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.config.NODE_ENV !== 'test') {
      await this.paymentQueue.upsertJobScheduler(
        'payment-pending-reconcile',
        { every: CHECKOUT_POLICY.RESERVATION_SWEEP_INTERVAL_MS },
        { name: 'payment.reconcile-pending', data: {} },
      );
    }
  }

  async process(
    job: Job<PaymentJobData>,
  ): Promise<
    PaymentReconcileResult | { acknowledged: boolean; eventType: string; notificationEnqueued?: boolean }
  > {
    const data = job.data ?? {};
    const eventType = data.eventType ?? job.name;
    const payload =
      data.payload && typeof data.payload === 'object' ? data.payload : undefined;

    if (
      eventType === 'payment.reconcile-pending' ||
      job.name === 'payment-pending-reconcile'
    ) {
      return this.reconcilePendingPayments();
    }

    if (eventType === 'payment.pending') {
      this.logger.info(
        {
          jobId: job.id ?? null,
          outboxEventId: data.outboxEventId ?? null,
          eventType,
          aggregateType: data.aggregateType ?? null,
          aggregateId: data.aggregateId ?? null,
        },
        'Processed payment.pending event',
      );
      return { acknowledged: true, eventType };
    }

    if (
      eventType === 'payment.succeeded' ||
      eventType === 'payment.failed' ||
      eventType === 'refund.completed'
    ) {
      let orderId = resolveOrderIdFromJob(data, payload);
      const refundId =
        readStringField(payload, 'refundId') ??
        (data.aggregateType === 'refund' && isUuid(data.aggregateId)
          ? data.aggregateId
          : undefined);
      let enrichedPayload: Record<string, unknown> | undefined = payload
        ? { ...payload }
        : undefined;

      if (eventType === 'refund.completed' && isUuid(refundId) && (!orderId || !enrichedPayload?.['amountIdr'])) {
        const refund = await this.prisma.client.refund.findUnique({
          where: { id: refundId },
          select: {
            orderId: true,
            amountIdr: true,
            status: true,
            providerRefundId: true,
          },
        });
        if (refund) {
          orderId = orderId ?? refund.orderId;
          enrichedPayload = {
            ...(enrichedPayload ?? {}),
            refundId,
            orderId,
            amountIdr: enrichedPayload?.['amountIdr'] ?? refund.amountIdr.toString(),
            refundStatus: refund.status,
            ...(refund.providerRefundId
              ? { providerRefundId: refund.providerRefundId }
              : {}),
          };
        }
      }

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
          refundId: refundId ?? null,
          orderNumber: notificationResult.orderNumber ?? null,
          notificationEnqueued: notificationResult.enqueued,
        },
        'Processed payment outcome event',
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
        aggregateType: data.aggregateType ?? null,
        aggregateId: data.aggregateId ?? null,
      },
      'Processed payment queue event',
    );
    return { acknowledged: true, eventType };
  }

  async reconcilePendingPayments(
    now: Date = new Date(),
    batchSize: number = DEFAULT_RECONCILE_BATCH_SIZE,
  ): Promise<PaymentReconcileResult> {
    const boundedBatch = Math.max(1, Math.min(batchSize, 200));

    const result = await this.prisma.withTransaction(async (tx) => {
      const stalePayments = await tx.$queryRaw<StalePendingPaymentRow[]>`
        SELECT
          p.id,
          p.order_id AS "orderId",
          o.status AS "orderStatus",
          o.payment_expires_at AS "paymentExpiresAt"
        FROM payments p
        INNER JOIN orders o ON o.id = p.order_id
        WHERE p.status = 'PENDING'::"PaymentStatus"
          AND p.expires_at <= ${now}
        ORDER BY p.expires_at ASC, p.id ASC
        LIMIT ${boundedBatch}
        FOR UPDATE OF p SKIP LOCKED
      `;

      if (stalePayments.length === 0) {
        return {
          expiredPayments: 0,
          expiredOrders: 0,
          skippedPayments: 0,
        };
      }

      let expiredPayments = 0;
      let expiredOrders = 0;
      let skippedPayments = 0;

      for (const stale of stalePayments) {
        if (
          stale.orderStatus !== OrderStatus.PENDING_PAYMENT &&
          stale.orderStatus !== OrderStatus.EXPIRED &&
          stale.orderStatus !== OrderStatus.CANCELLED
        ) {
          skippedPayments += 1;
          continue;
        }

        if (stale.orderStatus === OrderStatus.PENDING_PAYMENT) {
          const activeReservationCount = await tx.stockReservation.count({
            where: {
              orderId: stale.orderId,
              status: StockReservationStatus.ACTIVE,
            },
          });

          // Defer to InventoryExpiryProcessor whenever active stock reservations still exist.
          if (activeReservationCount > 0) {
            skippedPayments += 1;
            continue;
          }

          if (stale.paymentExpiresAt <= now) {
            const orderUpdate = await tx.order.updateMany({
              where: {
                id: stale.orderId,
                status: OrderStatus.PENDING_PAYMENT,
              },
              data: {
                status: OrderStatus.EXPIRED,
              },
            });
            if (orderUpdate.count === 1) {
              await tx.orderStatusHistory.create({
                data: {
                  orderId: stale.orderId,
                  fromStatus: OrderStatus.PENDING_PAYMENT,
                  toStatus: OrderStatus.EXPIRED,
                  actorType: 'SYSTEM',
                  actorId: null,
                  reason: 'Pending payment expired during reconciliation',
                },
              });
              expiredOrders += 1;
            }
          }
        }

        const paymentUpdate = await tx.payment.updateMany({
          where: {
            id: stale.id,
            status: PaymentStatus.PENDING,
          },
          data: {
            status: PaymentStatus.EXPIRED,
            failureReason: 'PAYMENT_WINDOW_EXPIRED',
          },
        });

        if (paymentUpdate.count === 1) {
          expiredPayments += 1;
        } else {
          skippedPayments += 1;
        }
      }

      return {
        expiredPayments,
        expiredOrders,
        skippedPayments,
      };
    });

    if (result.expiredPayments > 0 || result.expiredOrders > 0) {
      this.logger.info(
        {
          expiredPayments: result.expiredPayments,
          expiredOrders: result.expiredOrders,
          skippedPayments: result.skippedPayments,
          reconciledAtUtc: now.toISOString(),
        },
        'Reconciled stale pending payments',
      );
    }

    return result;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PaymentJobData> | undefined, error: Error): void {
    this.logger.error(
      {
        jobId: job?.id ?? null,
        eventType: job?.data?.eventType ?? job?.name ?? 'unknown',
        attemptsMade: job?.attemptsMade ?? 0,
        errorName: error.name,
        errorMessage: error.message,
      },
      'Payment job failed',
    );
  }
}
