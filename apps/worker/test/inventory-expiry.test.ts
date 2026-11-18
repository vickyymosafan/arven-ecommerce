import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getQueueToken } from '@nestjs/bullmq';
import { NestFactory } from '@nestjs/core';
import {
  loadRuntimeConfig,
  QUEUE_NAMES,
  type RuntimeConfig,
} from '@arven/config';
import {
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  StockReservationStatus,
} from '@arven/database';
import type { Queue } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';
import { WorkerPrismaService } from '../src/prisma/worker-prisma.service.js';
import { InventoryExpiryProcessor } from '../src/processors/inventory.processor.js';
import { PaymentProcessor } from '../src/processors/payment.processor.js';
import { WorkerModule } from '../src/worker.module.js';

function buildIntegrationConfig(emailDir: string): RuntimeConfig {
  const base = loadRuntimeConfig();
  return Object.freeze({
    ...base,
    NODE_ENV: 'test' as const,
    LOG_LEVEL: 'error' as const,
    EMAIL_DRIVER: 'local_capture' as const,
    EMAIL_LOCAL_DIR: emailDir,
    STORAGE_DRIVER: 'local_fs' as const,
  });
}

async function waitForCapturedEmails(
  captureDir: string,
  expectedCount: number,
  timeoutMs = 10_000,
): Promise<Array<Record<string, unknown>>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = await readdir(captureDir);
    const jsonFiles = entries
      .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
      .sort();
    if (jsonFiles.length >= expectedCount) {
      const parsed: Array<Record<string, unknown>> = [];
      for (const file of jsonFiles) {
        const raw = await readFile(path.join(captureDir, file), 'utf8');
        parsed.push(JSON.parse(raw) as Record<string, unknown>);
      }
      return parsed;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for ${expectedCount} captured emails in ${captureDir}`,
  );
}

describe('Phase 05 worker expiry, reconciliation & lifecycle integration', () => {
  const tempDirs: string[] = [];
  const createdOrderIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdProductIds: string[] = [];

  afterAll(async () => {
    const base = loadRuntimeConfig();
    const prismaService = new WorkerPrismaService(base);
    try {
      if (createdOrderIds.length > 0) {
        await prismaService.client.outboxEvent.deleteMany({
          where: { aggregateId: { in: createdOrderIds } },
        });
        await prismaService.client.payment.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prismaService.client.orderStatusHistory.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prismaService.client.orderItem.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
      }

      if (createdVariantIds.length > 0 || createdOrderIds.length > 0) {
        const reservations = await prismaService.client.stockReservation.findMany({
          where: {
            OR: [
              ...(createdOrderIds.length > 0
                ? [{ orderId: { in: createdOrderIds } }]
                : []),
              ...(createdVariantIds.length > 0
                ? [{ variantId: { in: createdVariantIds } }]
                : []),
            ],
          },
          select: { id: true },
        });
        const reservationIds = reservations.map((r) => r.id);

        if (createdVariantIds.length > 0 || reservationIds.length > 0) {
          await prismaService.client.inventoryMovement.deleteMany({
            where: {
              OR: [
                ...(createdVariantIds.length > 0
                  ? [{ variantId: { in: createdVariantIds } }]
                  : []),
                ...(reservationIds.length > 0
                  ? [{ referenceId: { in: reservationIds } }]
                  : []),
              ],
            },
          });
        }

        await prismaService.client.stockReservation.deleteMany({
          where: {
            OR: [
              ...(createdOrderIds.length > 0
                ? [{ orderId: { in: createdOrderIds } }]
                : []),
              ...(createdVariantIds.length > 0
                ? [{ variantId: { in: createdVariantIds } }]
                : []),
            ],
          },
        });
      }

      if (createdOrderIds.length > 0) {
        await prismaService.client.order.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }

      if (createdVariantIds.length > 0) {
        await prismaService.client.inventoryLevel.deleteMany({
          where: { variantId: { in: createdVariantIds } },
        });
        await prismaService.client.productVariant.deleteMany({
          where: { id: { in: createdVariantIds } },
        });
      }

      if (createdProductIds.length > 0) {
        await prismaService.client.product.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
    } finally {
      await prismaService.onModuleDestroy();
      await Promise.all(
        tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
      );
    }
  });

  it('atomically releases expired ACTIVE reservations and is strictly idempotent on second sweep', async () => {
    const emailDir = await mkdtemp(path.join(os.tmpdir(), 'arven-wktest-expiry-'));
    tempDirs.push(emailDir);

    const config = buildIntegrationConfig(emailDir);
    const app = await NestFactory.createApplicationContext(
      WorkerModule.forRoot(config),
      { logger: false },
    );

    const prisma = app.get(WorkerPrismaService);
    const inventoryProcessor = app.get(InventoryExpiryProcessor);
    const suffix = randomUUID().slice(0, 8).toUpperCase();

    try {
      const warehouse = await prisma.client.warehouse.findFirstOrThrow({
        where: { code: 'JKT-MAIN-01' },
        select: { id: true },
      });

      const product = await prisma.client.product.create({
        data: {
          slug: `arven-wktest-prod-${suffix.toLowerCase()}`,
          name: `ARVEN Worker Expiry Test Garment ${suffix}`,
          description: 'Synthetic test product for worker reservation expiry verification.',
          material: '100% Cotton',
          fit: 'Relaxed Fit',
          careInstruction: 'Cold wash',
        },
        select: { id: true },
      });
      createdProductIds.push(product.id);

      const variant = await prisma.client.productVariant.create({
        data: {
          productId: product.id,
          sku: `ARV-WKTEST-${suffix}`,
          size: 'M',
          color: 'Charcoal',
          colorHex: '#17191B',
          priceIdr: 299_000n,
          weightGrams: 300,
        },
        select: { id: true },
      });
      createdVariantIds.push(variant.id);

      const reservedQty = 3;
      const initialOnHand = 10;
      await prisma.client.inventoryLevel.create({
        data: {
          warehouseId: warehouse.id,
          variantId: variant.id,
          quantityOnHand: initialOnHand,
          quantityReserved: reservedQty,
          lowStockThreshold: 2,
        },
      });

      const now = new Date();
      const expiredAt = new Date(now.getTime() - 60_000);
      const futureAt = new Date(now.getTime() + 600_000);

      // Expired PENDING_PAYMENT order + ACTIVE reservation + PENDING payment
      const expiredOrder = await prisma.client.order.create({
        data: {
          orderNumber: `ARV-WKTEST-${suffix}`,
          guestEmail: `guest-${suffix.toLowerCase()}@example.com`,
          guestTokenHash: 'a'.repeat(64),
          status: OrderStatus.PENDING_PAYMENT,
          currency: 'IDR',
          subtotalIdr: 897_000n,
          discountTotalIdr: 0n,
          shippingTotalIdr: 20_000n,
          taxTotalIdr: 0n,
          grandTotalIdr: 917_000n,
          shippingProvider: 'jne-adapter',
          shippingService: 'REG',
          addressSnapshot: {
            recipientName: 'ARVEN Test',
            phone: '+628123456789',
            addressLine1: 'Jl. Kemang Raya No. 1',
            city: 'Jakarta Selatan',
            province: 'DKI Jakarta',
            postalCode: '12730',
            countryCode: 'ID',
          },
          paymentExpiresAt: expiredAt,
        },
        select: { id: true },
      });
      createdOrderIds.push(expiredOrder.id);

      const expiredReservation = await prisma.client.stockReservation.create({
        data: {
          orderId: expiredOrder.id,
          warehouseId: warehouse.id,
          variantId: variant.id,
          quantity: reservedQty,
          status: StockReservationStatus.ACTIVE,
          expiresAt: expiredAt,
        },
        select: { id: true },
      });

      const pendingPayment = await prisma.client.payment.create({
        data: {
          orderId: expiredOrder.id,
          provider: 'local_stub',
          providerReference: `ARV-WKTEST-PAY-${suffix}`,
          status: PaymentStatus.PENDING,
          amountIdr: 917_000n,
          currency: 'IDR',
          expiresAt: expiredAt,
        },
        select: { id: true },
      });

      // Second order that is NOT expired yet (must remain untouched)
      const activeOrder = await prisma.client.order.create({
        data: {
          orderNumber: `ARV-WKTEST-ACT-${suffix}`,
          guestEmail: `active-${suffix.toLowerCase()}@example.com`,
          guestTokenHash: 'b'.repeat(64),
          status: OrderStatus.PENDING_PAYMENT,
          currency: 'IDR',
          subtotalIdr: 299_000n,
          discountTotalIdr: 0n,
          shippingTotalIdr: 20_000n,
          taxTotalIdr: 0n,
          grandTotalIdr: 319_000n,
          shippingProvider: 'jne-adapter',
          shippingService: 'REG',
          addressSnapshot: {
            recipientName: 'ARVEN Active',
            phone: '+628123456780',
            addressLine1: 'Jl. Senopati No. 2',
            city: 'Jakarta Selatan',
            province: 'DKI Jakarta',
            postalCode: '12190',
            countryCode: 'ID',
          },
          paymentExpiresAt: futureAt,
        },
        select: { id: true },
      });
      createdOrderIds.push(activeOrder.id);

      const firstSweep = await inventoryProcessor.sweepExpiredReservations(now, 25);
      expect(firstSweep.expiredOrders).toBeGreaterThanOrEqual(1);
      expect(firstSweep.releasedReservations).toBeGreaterThanOrEqual(1);

      const updatedLevel = await prisma.client.inventoryLevel.findUniqueOrThrow({
        where: {
          warehouseId_variantId: {
            warehouseId: warehouse.id,
            variantId: variant.id,
          },
        },
      });
      expect(updatedLevel.quantityOnHand).toBe(initialOnHand);
      expect(updatedLevel.quantityReserved).toBe(0);

      const updatedReservation = await prisma.client.stockReservation.findUniqueOrThrow({
        where: { id: expiredReservation.id },
      });
      expect(updatedReservation.status).toBe(StockReservationStatus.EXPIRED);
      expect(updatedReservation.releasedAt).not.toBeNull();

      const movements = await prisma.client.inventoryMovement.findMany({
        where: {
          referenceType: 'RESERVATION',
          referenceId: expiredReservation.id,
        },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]?.type).toBe(InventoryMovementType.RELEASE);
      expect(movements[0]?.quantityDelta).toBe(-reservedQty);
      expect(movements[0]?.actorId).toBeNull();

      const updatedOrder = await prisma.client.order.findUniqueOrThrow({
        where: { id: expiredOrder.id },
      });
      expect(updatedOrder.status).toBe(OrderStatus.EXPIRED);

      const historyRows = await prisma.client.orderStatusHistory.findMany({
        where: { orderId: expiredOrder.id },
      });
      expect(historyRows).toHaveLength(1);
      expect(historyRows[0]?.fromStatus).toBe(OrderStatus.PENDING_PAYMENT);
      expect(historyRows[0]?.toStatus).toBe(OrderStatus.EXPIRED);
      expect(historyRows[0]?.actorType).toBe('SYSTEM');

      const updatedPayment = await prisma.client.payment.findUniqueOrThrow({
        where: { id: pendingPayment.id },
      });
      expect(updatedPayment.status).toBe(PaymentStatus.EXPIRED);
      expect(updatedPayment.failureReason).toBe('PAYMENT_WINDOW_EXPIRED');

      const outboxEvents = await prisma.client.outboxEvent.findMany({
        where: {
          aggregateType: 'order',
          aggregateId: expiredOrder.id,
          eventType: 'inventory.released',
        },
      });
      expect(outboxEvents).toHaveLength(1);

      const untouchedOrder = await prisma.client.order.findUniqueOrThrow({
        where: { id: activeOrder.id },
      });
      expect(untouchedOrder.status).toBe(OrderStatus.PENDING_PAYMENT);

      // Second sweep must be strictly idempotent (zero changes for our order & zero changes overall)
      const secondSweep = await inventoryProcessor.sweepExpiredReservations(now, 25);
      expect(secondSweep.expiredOrders).toBe(0);
      expect(secondSweep.releasedReservations).toBe(0);

      const movementsAfterSecondSweep = await prisma.client.inventoryMovement.findMany({
        where: {
          referenceType: 'RESERVATION',
          referenceId: expiredReservation.id,
        },
      });
      expect(movementsAfterSecondSweep).toHaveLength(1);

      const outboxAfterSecondSweep = await prisma.client.outboxEvent.findMany({
        where: {
          aggregateType: 'order',
          aggregateId: expiredOrder.id,
          eventType: 'inventory.released',
        },
      });
      expect(outboxAfterSecondSweep).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('reconciles stale PENDING payments idempotently and routes order/payment events to notification queue', async () => {
    const emailDir = await mkdtemp(path.join(os.tmpdir(), 'arven-wktest-notify-'));
    tempDirs.push(emailDir);

    const config = buildIntegrationConfig(emailDir);
    const app = await NestFactory.createApplicationContext(
      WorkerModule.forRoot(config),
      { logger: false },
    );

    const prisma = app.get(WorkerPrismaService);
    const paymentProcessor = app.get(PaymentProcessor);
    const orderQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.ORDER));
    const paymentQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.PAYMENT));
    const suffix = randomUUID().slice(0, 8).toUpperCase();

    try {
      const now = new Date();
      const expiredAt = new Date(now.getTime() - 120_000);

      const expiredOrder = await prisma.client.order.create({
        data: {
          orderNumber: `ARV-WKTEST-REC-${suffix}`,
          guestEmail: `reconcile-${suffix.toLowerCase()}@example.com`,
          guestTokenHash: 'c'.repeat(64),
          status: OrderStatus.EXPIRED,
          currency: 'IDR',
          subtotalIdr: 499_000n,
          discountTotalIdr: 0n,
          shippingTotalIdr: 20_000n,
          taxTotalIdr: 0n,
          grandTotalIdr: 519_000n,
          shippingProvider: 'sicepat-adapter',
          shippingService: 'BEST',
          addressSnapshot: {
            recipientName: 'ARVEN Reconcile',
            phone: '+628123456781',
            addressLine1: 'Jl. Dharmawangsa No. 8',
            city: 'Jakarta Selatan',
            province: 'DKI Jakarta',
            postalCode: '12160',
            countryCode: 'ID',
          },
          paymentExpiresAt: expiredAt,
        },
        select: { id: true },
      });
      createdOrderIds.push(expiredOrder.id);

      const stalePayment = await prisma.client.payment.create({
        data: {
          orderId: expiredOrder.id,
          provider: 'local_stub',
          providerReference: `ARV-WKTEST-REC-PAY-${suffix}`,
          status: PaymentStatus.PENDING,
          amountIdr: 519_000n,
          currency: 'IDR',
          expiresAt: expiredAt,
        },
        select: { id: true },
      });

      const firstReconcile = await paymentProcessor.reconcilePendingPayments(now, 25);
      expect(firstReconcile.expiredPayments).toBeGreaterThanOrEqual(1);

      const paymentAfter = await prisma.client.payment.findUniqueOrThrow({
        where: { id: stalePayment.id },
      });
      expect(paymentAfter.status).toBe(PaymentStatus.EXPIRED);
      expect(paymentAfter.failureReason).toBe('PAYMENT_WINDOW_EXPIRED');

      const secondReconcile = await paymentProcessor.reconcilePendingPayments(now, 25);
      expect(secondReconcile.expiredPayments).toBe(0);

      const orderOutboxId = randomUUID();
      const paymentOutboxId = randomUUID();

      const orderJob = await orderQueue.add(
        'order.created',
        {
          outboxEventId: orderOutboxId,
          aggregateType: 'order',
          aggregateId: expiredOrder.id,
          eventType: 'order.created',
          payload: {
            orderId: expiredOrder.id,
            orderNumber: `ARV-WKTEST-REC-${suffix}`,
            email: `order-notify-${suffix.toLowerCase()}@example.com`,
          },
        },
        {
          jobId: `wktest-order-${suffix}`,
          removeOnComplete: true,
        },
      );

      const paymentJob = await paymentQueue.add(
        'payment.succeeded',
        {
          outboxEventId: paymentOutboxId,
          aggregateType: 'order',
          aggregateId: expiredOrder.id,
          eventType: 'payment.succeeded',
          payload: {
            orderId: expiredOrder.id,
            orderNumber: `ARV-WKTEST-REC-${suffix}`,
            email: `payment-notify-${suffix.toLowerCase()}@example.com`,
          },
        },
        {
          jobId: `wktest-pay-${suffix}`,
          removeOnComplete: true,
        },
      );

      const captured = await waitForCapturedEmails(emailDir, 2);
      const subjects = captured.map((item) => item['subject']);
      expect(subjects).toContain('Your ARVEN order confirmation');
      expect(subjects).toContain('Payment received for your ARVEN order');

      // OrderProcessor must not duplicate order.created outbox loops
      const extraOutbox = await prisma.client.outboxEvent.findMany({
        where: { aggregateId: expiredOrder.id },
      });
      expect(extraOutbox).toHaveLength(0);

      await orderJob.remove().catch(() => undefined);
      await paymentJob.remove().catch(() => undefined);
    } finally {
      await app.close();
    }
  });
});
