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
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  ReturnStatus,
  ShipmentStatus,
} from '@arven/database';
import type { Queue } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';
import { renderWorkerEmailTemplate } from '../src/adapters/worker-email.provider.js';
import { resolveQueueForOutboxEvent } from '../src/outbox/outbox-routing.js';
import { WorkerPrismaService } from '../src/prisma/worker-prisma.service.js';
import { SUBJECT_BY_EVENT } from '../src/processors/notifications.processor.js';
import { OrderProcessor } from '../src/processors/order.processor.js';
import { PaymentProcessor } from '../src/processors/payment.processor.js';
import { ShippingProcessor } from '../src/processors/shipping.processor.js';
import { WorkerModule } from '../src/worker.module.js';

function buildIntegrationConfig(emailDir: string): RuntimeConfig {
  const base = loadRuntimeConfig();
  const redisUrl = new URL(base.REDIS_URL);
  redisUrl.pathname = '/13';
  return Object.freeze({
    ...base,
    NODE_ENV: 'test' as const,
    LOG_LEVEL: 'error' as const,
    REDIS_URL: redisUrl.toString(),
    EMAIL_DRIVER: 'local_capture' as const,
    EMAIL_LOCAL_DIR: emailDir,
    STORAGE_DRIVER: 'local_fs' as const,
  });
}

async function waitForCapturedEmails(
  captureDir: string,
  expectedCount: number,
  timeoutMs = 12_000,
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

describe('Phase 06 Worker Processors (Shipping, Returns, Refunds & Notifications)', () => {
  const tempDirs: string[] = [];
  const createdOrderIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    const base = loadRuntimeConfig();
    const prismaService = new WorkerPrismaService(base);
    try {
      if (createdOrderIds.length > 0) {
        await prismaService.client.refund.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prismaService.client.return.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prismaService.client.shipment.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prismaService.client.payment.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prismaService.client.orderStatusHistory.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prismaService.client.order.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }
      if (createdUserIds.length > 0) {
        await prismaService.client.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }
    } finally {
      await prismaService.onModuleDestroy();
      await Promise.all(
        tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
      );
    }
  });

  it('defines notification subjects and XSS-safe templates for Phase 06 shipment, return, and refund events', () => {
    expect(SUBJECT_BY_EVENT['shipment.dispatched']).toBe('Your ARVEN order has shipped');
    expect(SUBJECT_BY_EVENT['shipment.delivered']).toBe('Your ARVEN order has been delivered');
    expect(SUBJECT_BY_EVENT['return.requested']).toBe('We received your ARVEN return request');
    expect(SUBJECT_BY_EVENT['refund.completed']).toBe('Your ARVEN refund has been completed');

    expect(resolveQueueForOutboxEvent('shipment.dispatched')).toBe(QUEUE_NAMES.SHIPPING);
    expect(resolveQueueForOutboxEvent('shipment.delivered')).toBe(QUEUE_NAMES.SHIPPING);
    expect(resolveQueueForOutboxEvent('return.requested')).toBe(QUEUE_NAMES.ORDER);
    expect(resolveQueueForOutboxEvent('refund.completed')).toBe(QUEUE_NAMES.PAYMENT);

    const rendered = renderWorkerEmailTemplate({
      to: 'client@example.com',
      template: 'shipment.dispatched',
      subject: SUBJECT_BY_EVENT['shipment.dispatched']!,
      variables: {
        recipientName: 'Aria <Client>',
        orderNumber: 'ARV-20261118-SHIP01',
        trackingNumber: 'JNE-001234',
      },
    });
    expect(rendered.html).toContain('Aria &lt;Client&gt;');
    expect(rendered.html).toContain('ARV-20261118-SHIP01');
    expect(rendered.html).toContain('JNE-001234');
    expect(rendered.html).not.toContain('\u2014');
  });

  it('registers ShippingProcessor in WorkerModule and leaves 3d-assets queue unimplemented (Phase 07 exclusion)', async () => {
    const emailDir = await mkdtemp(path.join(os.tmpdir(), 'arven-wktest-p6-mod-'));
    tempDirs.push(emailDir);

    const app = await NestFactory.createApplicationContext(
      WorkerModule.forRoot(buildIntegrationConfig(emailDir)),
      { logger: false },
    );

    try {
      expect(app.get(ShippingProcessor)).toBeInstanceOf(ShippingProcessor);
      expect(app.get(OrderProcessor)).toBeInstanceOf(OrderProcessor);
      expect(app.get(PaymentProcessor)).toBeInstanceOf(PaymentProcessor);
      const threeDQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.THREE_D_ASSETS));
      expect(threeDQueue.name).toBe(QUEUE_NAMES.THREE_D_ASSETS);
    } finally {
      await app.close();
    }
  });

  it('processes shipment.dispatched, shipment.delivered, return.requested, and refund.completed idempotently end-to-end', async () => {
    const emailDir = await mkdtemp(path.join(os.tmpdir(), 'arven-wktest-p6-e2e-'));
    tempDirs.push(emailDir);

    const app = await NestFactory.createApplicationContext(
      WorkerModule.forRoot(buildIntegrationConfig(emailDir)),
      { logger: false },
    );

    const prisma = app.get(WorkerPrismaService);
    const shippingQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.SHIPPING));
    const orderQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.ORDER));
    const paymentQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.PAYMENT));
    const suffix = randomUUID().slice(0, 8).toUpperCase();

    try {
      const warehouse = await prisma.client.warehouse.findFirstOrThrow({
        where: { code: 'JKT-MAIN-01' },
        select: { id: true },
      });

      const requester = await prisma.client.user.create({
        data: {
          email: `ops-requester-${suffix.toLowerCase()}@example.com`,
          passwordHash: 'not-used-in-worker-test',
          fullName: 'ARVEN Ops Requester',
        },
        select: { id: true },
      });
      createdUserIds.push(requester.id);

      const order = await prisma.client.order.create({
        data: {
          orderNumber: `ARV-WKTEST-P6-${suffix}`,
          guestEmail: `phase06-client-${suffix.toLowerCase()}@example.com`,
          guestTokenHash: 'd'.repeat(64),
          status: OrderStatus.DELIVERED,
          currency: 'IDR',
          subtotalIdr: 899_000n,
          discountTotalIdr: 0n,
          shippingTotalIdr: 25_000n,
          taxTotalIdr: 0n,
          grandTotalIdr: 924_000n,
          shippingProvider: 'jne-adapter',
          shippingService: 'REG',
          addressSnapshot: {
            recipientName: 'Raka Pratama',
            phone: '+628123456789',
            addressLine1: 'Jl. Senopati No. 10',
            city: 'Jakarta Selatan',
            province: 'DKI Jakarta',
            postalCode: '12190',
            countryCode: 'ID',
          },
          paymentExpiresAt: new Date(Date.now() + 3600_000),
          paidAt: new Date(),
        },
        select: { id: true, orderNumber: true },
      });
      createdOrderIds.push(order.id);

      const shipment = await prisma.client.shipment.create({
        data: {
          orderId: order.id,
          warehouseId: warehouse.id,
          provider: 'jne-adapter',
          serviceCode: 'REG',
          trackingNumber: `JNE-P6-${suffix}`,
          status: ShipmentStatus.IN_TRANSIT,
          shippedAt: new Date(),
        },
        select: { id: true },
      });

      const returnRecord = await prisma.client.return.create({
        data: {
          orderId: order.id,
          status: ReturnStatus.REQUESTED,
          reason: 'SIZE_EXCHANGE',
        },
        select: { id: true },
      });

      const payment = await prisma.client.payment.create({
        data: {
          orderId: order.id,
          provider: 'local_stub',
          providerReference: `ARV-P6-PAY-${suffix}`,
          status: PaymentStatus.SETTLEMENT,
          amountIdr: 924_000n,
          currency: 'IDR',
          expiresAt: new Date(Date.now() + 3600_000),
          settledAt: new Date(),
        },
        select: { id: true },
      });

      const refund = await prisma.client.refund.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          returnId: returnRecord.id,
          refundKey: `ref-p6-${suffix}`,
          status: RefundStatus.SUCCEEDED,
          amountIdr: 899_000n,
          currency: 'IDR',
          reason: 'Approved return refund',
          requestedBy: requester.id,
          approvedBy: requester.id,
          completedAt: new Date(),
        },
        select: { id: true },
      });

      const dispatchedOutboxId = randomUUID();
      const deliveredOutboxId = randomUUID();
      const returnOutboxId = randomUUID();
      const refundOutboxId = randomUUID();

      // Dispatch job omits orderId in payload so ShippingProcessor must resolve it from Shipment table
      const dispatchedJob = await shippingQueue.add(
        'shipment.dispatched',
        {
          outboxEventId: dispatchedOutboxId,
          aggregateType: 'shipment',
          aggregateId: shipment.id,
          eventType: 'shipment.dispatched',
          payload: {
            shipmentId: shipment.id,
          },
        },
        { jobId: `wktest-ship-disp-${suffix}`, removeOnComplete: true },
      );

      const deliveredJob = await shippingQueue.add(
        'shipment.delivered',
        {
          outboxEventId: deliveredOutboxId,
          aggregateType: 'order',
          aggregateId: order.id,
          eventType: 'shipment.delivered',
          payload: {
            orderId: order.id,
            shipmentId: shipment.id,
          },
        },
        { jobId: `wktest-ship-delv-${suffix}`, removeOnComplete: true },
      );

      const returnJob = await orderQueue.add(
        'return.requested',
        {
          outboxEventId: returnOutboxId,
          aggregateType: 'return',
          aggregateId: returnRecord.id,
          eventType: 'return.requested',
          payload: {
            returnId: returnRecord.id,
          },
        },
        { jobId: `wktest-ret-req-${suffix}`, removeOnComplete: true },
      );

      const refundJob = await paymentQueue.add(
        'refund.completed',
        {
          outboxEventId: refundOutboxId,
          aggregateType: 'refund',
          aggregateId: refund.id,
          eventType: 'refund.completed',
          payload: {
            refundId: refund.id,
          },
        },
        { jobId: `wktest-ref-comp-${suffix}`, removeOnComplete: true },
      );

      // Re-enqueue duplicate dispatched event with same outboxEventId to confirm BullMQ notification jobId idempotency
      const duplicateDispatchedJob = await shippingQueue.add(
        'shipment.dispatched',
        {
          outboxEventId: dispatchedOutboxId,
          aggregateType: 'shipment',
          aggregateId: shipment.id,
          eventType: 'shipment.dispatched',
          payload: {
            shipmentId: shipment.id,
          },
        },
        { jobId: `wktest-ship-disp-dup-${suffix}`, removeOnComplete: true },
      );

      const captured = await waitForCapturedEmails(emailDir, 4);
      // Give brief window to verify duplicate did not emit a 5th email
      await new Promise((resolve) => setTimeout(resolve, 400));
      const allEntries = (await readdir(emailDir)).filter(
        (name) => name.endsWith('.json') && !name.startsWith('.'),
      );
      expect(allEntries).toHaveLength(4);

      const subjects = captured.map((item) => item['subject']);
      expect(subjects).toEqual(
        expect.arrayContaining([
          'Your ARVEN order has shipped',
          'Your ARVEN order has been delivered',
          'We received your ARVEN return request',
          'Your ARVEN refund has been completed',
        ]),
      );

      for (const item of captured) {
        expect(item['to']).toBe(`phase06-client-${suffix.toLowerCase()}@example.com`);
      }

      await Promise.all([
        dispatchedJob.remove().catch(() => undefined),
        deliveredJob.remove().catch(() => undefined),
        returnJob.remove().catch(() => undefined),
        refundJob.remove().catch(() => undefined),
        duplicateDispatchedJob.remove().catch(() => undefined),
      ]);
    } finally {
      await app.close();
    }
  });
});
