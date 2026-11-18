import { Inject, type OnModuleInit } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { CHECKOUT_POLICY, QUEUE_NAMES, type RuntimeConfig } from '@arven/config';
import {
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  StockReservationStatus,
} from '@arven/database';
import { createLogger, type ArvenLogger } from '@arven/observability';
import type { Job, Queue } from 'bullmq';
import { WORKER_CONFIG } from '../config/worker-config.module.js';
import { WorkerPrismaService } from '../prisma/worker-prisma.service.js';
import type { OutboxJobEnvelope } from './processor-utils.js';

export type InventoryJobData = OutboxJobEnvelope;

export interface InventoryExpirySweepResult {
  readonly expiredOrders: number;
  readonly releasedReservations: number;
  readonly skippedOrders: number;
}

interface LockedOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
}

interface LockedReservationRow {
  id: string;
  warehouseId: string;
  variantId: string;
  quantity: number;
}

const DEFAULT_SWEEP_BATCH_SIZE = 25;

@Processor(QUEUE_NAMES.INVENTORY)
export class InventoryExpiryProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger: ArvenLogger;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: RuntimeConfig,
    @Inject(WorkerPrismaService) private readonly prisma: WorkerPrismaService,
    @InjectQueue(QUEUE_NAMES.INVENTORY) private readonly inventoryQueue: Queue,
  ) {
    super();
    this.logger = createLogger({
      service: '@arven/worker:inventory',
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.config.NODE_ENV !== 'test') {
      await this.inventoryQueue.upsertJobScheduler(
        'inventory-reservation-expiry-sweep',
        { every: CHECKOUT_POLICY.RESERVATION_SWEEP_INTERVAL_MS },
        { name: 'inventory.expire-reservations', data: {} },
      );
    }
  }

  async process(
    job: Job<InventoryJobData>,
  ): Promise<InventoryExpirySweepResult | { acknowledged: boolean; eventType: string }> {
    const data = job.data ?? {};
    const eventType = data.eventType ?? job.name;

    if (
      eventType === 'inventory.expire-reservations' ||
      job.name === 'inventory-reservation-expiry-sweep'
    ) {
      return this.sweepExpiredReservations();
    }

    if (
      eventType === 'inventory.reserved' ||
      eventType === 'inventory.released' ||
      eventType === 'inventory.received'
    ) {
      this.logger.info(
        {
          jobId: job.id ?? null,
          outboxEventId: data.outboxEventId ?? null,
          eventType,
          aggregateType: data.aggregateType ?? null,
          aggregateId: data.aggregateId ?? null,
        },
        'Processed inventory domain event',
      );
      return { acknowledged: true, eventType };
    }

    this.logger.warn(
      {
        jobId: job.id ?? null,
        eventType,
      },
      'Received unrecognized inventory job type',
    );
    return { acknowledged: false, eventType };
  }

  async sweepExpiredReservations(
    now: Date = new Date(),
    batchSize: number = DEFAULT_SWEEP_BATCH_SIZE,
  ): Promise<InventoryExpirySweepResult> {
    const boundedBatch = Math.max(1, Math.min(batchSize, 200));

    const result = await this.prisma.withTransaction(async (tx) => {
      const expiredOrderRows = await tx.$queryRaw<Array<{ orderId: string }>>`
        SELECT sr.order_id AS "orderId"
        FROM stock_reservations sr
        WHERE sr.status = 'ACTIVE'::"StockReservationStatus"
          AND sr.expires_at <= ${now}
        GROUP BY sr.order_id
        ORDER BY MIN(sr.expires_at) ASC, sr.order_id ASC
        LIMIT ${boundedBatch}
      `;

      if (expiredOrderRows.length === 0) {
        return {
          expiredOrders: 0,
          releasedReservations: 0,
          skippedOrders: 0,
        };
      }

      let expiredOrders = 0;
      let releasedReservations = 0;
      let skippedOrders = 0;

      for (const { orderId } of expiredOrderRows) {
        const lockedOrders = await tx.$queryRaw<LockedOrderRow[]>`
          SELECT id, order_number AS "orderNumber", status
          FROM orders
          WHERE id = ${orderId}::uuid
          FOR UPDATE
        `;
        const lockedOrder = lockedOrders[0];
        if (!lockedOrder || lockedOrder.status !== OrderStatus.PENDING_PAYMENT) {
          skippedOrders += 1;
          continue;
        }

        const lockedReservations = await tx.$queryRaw<LockedReservationRow[]>`
          SELECT
            id,
            warehouse_id AS "warehouseId",
            variant_id AS "variantId",
            quantity
          FROM stock_reservations
          WHERE order_id = ${orderId}::uuid
            AND status = 'ACTIVE'::"StockReservationStatus"
            AND expires_at <= ${now}
          ORDER BY variant_id ASC, warehouse_id ASC
          FOR UPDATE
        `;

        if (lockedReservations.length === 0) {
          skippedOrders += 1;
          continue;
        }

        const releasedSummary: Array<{
          reservationId: string;
          warehouseId: string;
          variantId: string;
          quantity: number;
        }> = [];

        for (const reservation of lockedReservations) {
          const updatedReservation = await tx.stockReservation.updateMany({
            where: {
              id: reservation.id,
              status: StockReservationStatus.ACTIVE,
            },
            data: {
              status: StockReservationStatus.EXPIRED,
              releasedAt: now,
            },
          });

          if (updatedReservation.count !== 1) {
            continue;
          }

          const decremented = await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE inventory_levels
            SET quantity_reserved = quantity_reserved - ${reservation.quantity},
                updated_at = ${now}
            WHERE warehouse_id = ${reservation.warehouseId}::uuid
              AND variant_id = ${reservation.variantId}::uuid
              AND quantity_reserved >= ${reservation.quantity}
            RETURNING id
          `;

          if (decremented.length !== 1) {
            throw new Error(
              `Invariant violation releasing reservation ${reservation.id}: insufficient quantity_reserved`,
            );
          }

          await tx.inventoryMovement.create({
            data: {
              warehouseId: reservation.warehouseId,
              variantId: reservation.variantId,
              type: InventoryMovementType.RELEASE,
              quantityDelta: -reservation.quantity,
              referenceType: 'RESERVATION',
              referenceId: reservation.id,
              actorId: null,
              reason: 'Payment window expired',
            },
          });

          releasedReservations += 1;
          releasedSummary.push({
            reservationId: reservation.id,
            warehouseId: reservation.warehouseId,
            variantId: reservation.variantId,
            quantity: reservation.quantity,
          });
        }

        if (releasedSummary.length === 0) {
          skippedOrders += 1;
          continue;
        }

        const orderUpdate = await tx.order.updateMany({
          where: {
            id: orderId,
            status: OrderStatus.PENDING_PAYMENT,
          },
          data: {
            status: OrderStatus.EXPIRED,
          },
        });

        if (orderUpdate.count === 1) {
          await tx.orderStatusHistory.create({
            data: {
              orderId,
              fromStatus: OrderStatus.PENDING_PAYMENT,
              toStatus: OrderStatus.EXPIRED,
              actorType: 'SYSTEM',
              actorId: null,
              reason: 'Reservation payment window expired',
            },
          });
        }

        await tx.payment.updateMany({
          where: {
            orderId,
            status: PaymentStatus.PENDING,
          },
          data: {
            status: PaymentStatus.EXPIRED,
            failureReason: 'PAYMENT_WINDOW_EXPIRED',
          },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'order',
            aggregateId: orderId,
            eventType: 'inventory.released',
            schemaVersion: 1,
            payload: {
              orderId,
              orderNumber: lockedOrder.orderNumber,
              reason: 'PAYMENT_WINDOW_EXPIRED',
              releasedAtUtc: now.toISOString(),
              reservations: releasedSummary,
            },
          },
        });

        expiredOrders += 1;
      }

      return {
        expiredOrders,
        releasedReservations,
        skippedOrders,
      };
    });

    if (result.expiredOrders > 0 || result.releasedReservations > 0) {
      this.logger.info(
        {
          expiredOrders: result.expiredOrders,
          releasedReservations: result.releasedReservations,
          skippedOrders: result.skippedOrders,
          sweepAtUtc: now.toISOString(),
        },
        'Expired overdue stock reservations',
      );
    }

    return result;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<InventoryJobData> | undefined, error: Error): void {
    this.logger.error(
      {
        jobId: job?.id ?? null,
        eventType: job?.data?.eventType ?? job?.name ?? 'unknown',
        attemptsMade: job?.attemptsMade ?? 0,
        errorName: error.name,
        errorMessage: error.message,
      },
      'Inventory job failed',
    );
  }
}

export { InventoryExpiryProcessor as InventoryProcessor };
