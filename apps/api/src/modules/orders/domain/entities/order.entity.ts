import { OrdersDomainError } from '../errors/orders-domain.error.js';

export const CANCELLABLE_ORDER_STATUS = 'PENDING_PAYMENT';

export const ADMIN_FULFILLMENT_TARGET_STATUSES = [
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
] as const;

export const POST_SHIPMENT_PROTECTED_STATUSES = [
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
] as const;

const ADMIN_TRANSITION_GRAPH: Record<string, readonly string[]> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PAID: ['PROCESSING', 'READY_TO_SHIP', 'CANCELLED'],
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
};

export function canCancelOrderStatus(status: string): boolean {
  return status === CANCELLABLE_ORDER_STATUS;
}

export function assertOrderCancellable(currentStatus: string): void {
  if (!canCancelOrderStatus(currentStatus)) {
    throw new OrdersDomainError(
      409,
      'ORDER_CANNOT_BE_CANCELLED',
      `Order cannot be cancelled while in status ${currentStatus}`,
      [{ field: 'status', issue: `Current status ${currentStatus} cannot be cancelled` }],
    );
  }
}

export function isAdminFulfillmentTarget(toStatus: string): boolean {
  return (ADMIN_FULFILLMENT_TARGET_STATUSES as readonly string[]).includes(toStatus);
}

export function isPostShipmentProtectedStatus(status: string): boolean {
  return (POST_SHIPMENT_PROTECTED_STATUSES as readonly string[]).includes(status);
}

export function assertAdminOrderTransition(fromStatus: string, toStatus: string): void {
  const allowed = ADMIN_TRANSITION_GRAPH[fromStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new OrdersDomainError(
      409,
      'INVALID_STATE_TRANSITION',
      `Cannot transition order from ${fromStatus} to ${toStatus}`,
      [
        {
          field: 'toStatus',
          issue: `Transition ${fromStatus} -> ${toStatus} is not permitted`,
        },
      ],
    );
  }
}
