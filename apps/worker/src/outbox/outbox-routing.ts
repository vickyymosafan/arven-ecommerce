import { BULLMQ_QUEUES, QUEUE_NAMES } from '@arven/config';

export type BullQueueName = (typeof BULLMQ_QUEUES)[number];

export const MAX_OUTBOX_ATTEMPTS = 5;

export function resolveQueueForOutboxEvent(eventType: string): BullQueueName {
  if (eventType.startsWith('auth.') || eventType.startsWith('user.')) {
    return QUEUE_NAMES.NOTIFICATION;
  }
  if (eventType.startsWith('payment.') || eventType.startsWith('refund.')) {
    return QUEUE_NAMES.PAYMENT;
  }
  if (eventType.startsWith('inventory.')) {
    return QUEUE_NAMES.INVENTORY;
  }
  if (eventType.startsWith('order.') || eventType.startsWith('return.')) {
    return QUEUE_NAMES.ORDER;
  }
  if (eventType.startsWith('shipment.')) {
    return QUEUE_NAMES.SHIPPING;
  }
  if (eventType.startsWith('asset.')) {
    return QUEUE_NAMES.THREE_D_ASSETS;
  }
  if (eventType.startsWith('media.')) {
    return QUEUE_NAMES.MEDIA;
  }
  if (eventType.startsWith('product.') || eventType.startsWith('analytics.')) {
    return QUEUE_NAMES.ANALYTICS;
  }
  return QUEUE_NAMES.NOTIFICATION;
}

export function computeRetryDelayMs(nextAttempts: number): number {
  const clampedPower = Math.max(0, Math.min(nextAttempts, 8));
  return Math.min(300_000, 1000 * 2 ** clampedPower);
}
