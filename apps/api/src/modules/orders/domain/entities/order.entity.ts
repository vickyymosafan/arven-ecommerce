import { OrdersDomainError } from '../errors/orders-domain.error.js';

export const CANCELLABLE_ORDER_STATUS = 'PENDING_PAYMENT';

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
