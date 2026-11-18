import { randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import type { WorkerPrismaService } from '../prisma/worker-prisma.service.js';

export interface OutboxJobEnvelope {
  outboxEventId?: string;
  aggregateType?: string;
  aggregateId?: string;
  eventType?: string;
  schemaVersion?: number;
  payload?: Record<string, unknown>;
  occurredAtUtc?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function readStringField(
  source: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!source) {
    return undefined;
  }
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function resolveOrderIdFromJob(
  data: OutboxJobEnvelope,
  payload: Record<string, unknown> | undefined,
): string | undefined {
  const fromPayload = readStringField(payload, 'orderId');
  if (isUuid(fromPayload)) {
    return fromPayload;
  }
  if (data.aggregateType === 'order' && isUuid(data.aggregateId)) {
    return data.aggregateId;
  }
  return undefined;
}

export async function enqueueOrderNotification(params: {
  notificationQueue: Queue;
  prisma: WorkerPrismaService;
  eventType: string;
  outboxEventId?: string;
  jobId?: string;
  orderId?: string;
  payload?: Record<string, unknown>;
}): Promise<{ enqueued: boolean; orderNumber?: string }> {
  const { notificationQueue, prisma, eventType, outboxEventId, jobId, orderId, payload } = params;

  let email =
    readStringField(payload, 'email') ??
    readStringField(payload, 'guestEmail') ??
    readStringField(payload, 'to');
  let fullName = readStringField(payload, 'fullName') ?? readStringField(payload, 'recipientName');
  let orderNumber = readStringField(payload, 'orderNumber');
  let grandTotalIdr = payload?.['grandTotalIdr'];
  let currency = readStringField(payload, 'currency') ?? 'IDR';

  if (orderId && (!email || !orderNumber)) {
    const order = await prisma.client.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        guestEmail: true,
        grandTotalIdr: true,
        currency: true,
        user: {
          select: {
            email: true,
            fullName: true,
          },
        },
      },
    });
    if (order) {
      orderNumber = orderNumber ?? order.orderNumber;
      email = email ?? order.user?.email ?? order.guestEmail ?? undefined;
      fullName = fullName ?? order.user?.fullName ?? undefined;
      grandTotalIdr = grandTotalIdr ?? order.grandTotalIdr.toString();
      currency = order.currency;
    }
  }

  if (!email) {
    return {
      enqueued: false,
      ...(orderNumber ? { orderNumber } : {}),
    };
  }

  const rawDedup = outboxEventId ?? jobId ?? orderId ?? randomUUID();
  const safeDedup = rawDedup.replace(/[^a-zA-Z0-9_-]/g, '-');
  const safeEvent = eventType.replaceAll('.', '-');
  const notificationJobId = `notify-${safeEvent}-${safeDedup}`;

  await notificationQueue.add(
    eventType,
    {
      outboxEventId,
      eventType,
      payload: {
        ...(payload ?? {}),
        email,
        ...(fullName ? { fullName } : {}),
        ...(orderId ? { orderId } : {}),
        ...(orderNumber ? { orderNumber } : {}),
        ...(grandTotalIdr !== undefined ? { grandTotalIdr: String(grandTotalIdr) } : {}),
        currency,
      },
    },
    {
      jobId: notificationJobId,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 10_000,
      },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  );

  return {
    enqueued: true,
    ...(orderNumber ? { orderNumber } : {}),
  };
}
