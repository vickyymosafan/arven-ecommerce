import { ReturnsDomainError } from '../errors/returns-domain.error.js';

export const RETURN_WINDOW_DAYS = 14;

export const NON_REJECTED_RETURN_STATUSES = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'RECEIVED',
  'REFUNDED',
  'CLOSED',
] as const;

export const ELIGIBLE_ORDER_STATUSES_FOR_RETURN = [
  'DELIVERED',
  'RETURN_REQUESTED',
  'RETURN_APPROVED',
  'RETURNED',
] as const;

export const RESTOCKABLE_CONDITIONS = ['UNOPENED', 'GOOD'] as const;

export interface ReturnOrderItemDescriptor {
  id: string;
  variantId: string | null;
  sku: string;
  quantity: number;
}

export interface RequestedReturnItem {
  orderItemId: string;
  quantity: number;
}

export function assertOrderEligibleForReturn(
  orderStatus: string,
  deliveredAt: Date,
  now: Date,
  windowDays: number = RETURN_WINDOW_DAYS,
): void {
  if (!(ELIGIBLE_ORDER_STATUSES_FOR_RETURN as readonly string[]).includes(orderStatus)) {
    throw new ReturnsDomainError(
      409,
      'ORDER_NOT_ELIGIBLE_FOR_RETURN',
      `Order in status ${orderStatus} is not eligible for return`,
      [{ field: 'status', issue: 'Order must be DELIVERED before requesting a return' }],
    );
  }

  const windowMs = windowDays * 86_400_000;
  if (now.getTime() - deliveredAt.getTime() > windowMs) {
    throw new ReturnsDomainError(
      422,
      'RETURN_WINDOW_EXPIRED',
      `Return window of ${windowDays} days after delivery has expired`,
      [{ field: 'deliveredAt', issue: `Order exceeded ${windowDays}-day return window` }],
    );
  }
}

export function validateRequestedReturnItems(
  requestedItems: ReadonlyArray<RequestedReturnItem>,
  orderItemsById: ReadonlyMap<string, ReturnOrderItemDescriptor>,
  alreadyReturnedQtyByOrderItemId: ReadonlyMap<string, number>,
): void {
  const seen = new Set<string>();

  for (const item of requestedItems) {
    if (seen.has(item.orderItemId)) {
      throw new ReturnsDomainError(
        400,
        'VALIDATION_ERROR',
        'Duplicate orderItemId entries are not allowed',
        [{ field: 'items.orderItemId', issue: `Duplicate item ${item.orderItemId}` }],
      );
    }
    seen.add(item.orderItemId);

    const orderItem = orderItemsById.get(item.orderItemId);
    if (!orderItem) {
      throw new ReturnsDomainError(
        403,
        'ORDER_ITEM_OWNERSHIP_DENIED',
        `Order item ${item.orderItemId} does not belong to this order`,
        [{ field: 'items.orderItemId', issue: 'Order item does not belong to target order' }],
      );
    }

    const alreadyReturned = alreadyReturnedQtyByOrderItemId.get(item.orderItemId) ?? 0;
    const remainingReturnable = orderItem.quantity - alreadyReturned;

    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > remainingReturnable) {
      throw new ReturnsDomainError(
        422,
        'RETURN_QUANTITY_EXCEEDED',
        `Requested return quantity (${item.quantity}) exceeds remaining returnable quantity (${Math.max(0, remainingReturnable)}) for SKU ${orderItem.sku}`,
        [
          {
            field: 'items.quantity',
            issue: `Max returnable quantity for ${item.orderItemId} is ${Math.max(0, remainingReturnable)}`,
          },
        ],
      );
    }
  }
}

export function assertReturnReviewable(status: string): void {
  if (status !== 'REQUESTED') {
    throw new ReturnsDomainError(
      409,
      'INVALID_STATE_TRANSITION',
      `Return in status ${status} cannot move to UNDER_REVIEW`,
      [{ field: 'status', issue: `Expected REQUESTED, got ${status}` }],
    );
  }
}

export function assertReturnApprovable(
  status: string,
  decision: 'APPROVE' | 'REJECT',
  adminNotes: string | undefined,
): void {
  if (status !== 'UNDER_REVIEW') {
    throw new ReturnsDomainError(
      409,
      'INVALID_STATE_TRANSITION',
      `Return in status ${status} cannot be approved or rejected`,
      [{ field: 'status', issue: `Expected UNDER_REVIEW, got ${status}` }],
    );
  }

  if (decision === 'REJECT' && (!adminNotes || adminNotes.trim().length === 0)) {
    throw new ReturnsDomainError(
      400,
      'VALIDATION_ERROR',
      'adminNotes reason is required when rejecting a return request',
      [{ field: 'adminNotes', issue: 'Reason is required when rejecting a return' }],
    );
  }
}

export function assertReturnReceivable(status: string): void {
  if (status !== 'APPROVED') {
    throw new ReturnsDomainError(
      409,
      'INVALID_STATE_TRANSITION',
      `Return in status ${status} cannot be physically received`,
      [{ field: 'status', issue: `Expected APPROVED, got ${status}` }],
    );
  }
}

export function shouldRestockReturnItem(params: {
  condition: 'UNOPENED' | 'GOOD' | 'DAMAGED' | 'DEFECTIVE';
  restock: boolean;
  variantId: string | null;
  alreadyRestocked: boolean;
}): boolean {
  if (params.alreadyRestocked) {
    return false;
  }
  if (!params.restock || params.variantId === null) {
    return false;
  }
  return (RESTOCKABLE_CONDITIONS as readonly string[]).includes(params.condition);
}
