import type { BadgeTone } from '@arven/ui';
import type { OrderStatusInput, PaymentStatusInput, ReturnStatusInput } from '@arven/contracts';

export { formatIDR, formatWIB } from '@arven/ui';

export function formatOrderStatusLabel(status: string): string {
  return status.toLowerCase().replaceAll('_', ' ');
}

const ORDER_STATUS_BADGE_MAP: Record<OrderStatusInput, { label: string; tone: BadgeTone }> = {
  PENDING_PAYMENT: { label: 'Pending Payment', tone: 'warning' },
  PAID: { label: 'Payment Confirmed', tone: 'success' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  READY_TO_SHIP: { label: 'Ready to Ship', tone: 'info' },
  SHIPPED: { label: 'Shipped', tone: 'info' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  EXPIRED: { label: 'Payment Expired', tone: 'neutral' },
  REFUND_PENDING: { label: 'Refund Pending', tone: 'warning' },
  PARTIALLY_REFUNDED: { label: 'Partially Refunded', tone: 'neutral' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  RETURN_REQUESTED: { label: 'Return Requested', tone: 'warning' },
  RETURN_APPROVED: { label: 'Return Approved', tone: 'info' },
  RETURNED: { label: 'Returned', tone: 'neutral' },
};

const PAYMENT_STATUS_BADGE_MAP: Record<PaymentStatusInput, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Awaiting Payment', tone: 'warning' },
  AUTHORIZED: { label: 'Authorized', tone: 'info' },
  SETTLEMENT: { label: 'Settled', tone: 'success' },
  FAILED: { label: 'Payment Failed', tone: 'danger' },
  EXPIRED: { label: 'Session Expired', tone: 'neutral' },
  REFUND_PENDING: { label: 'Refund Pending', tone: 'warning' },
  PARTIALLY_REFUNDED: { label: 'Partially Refunded', tone: 'neutral' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
};

export function getOrderStatusMeta(status: OrderStatusInput): { label: string; tone: BadgeTone } {
  return ORDER_STATUS_BADGE_MAP[status] ?? {
    label: formatOrderStatusLabel(status),
    tone: 'neutral',
  };
}

export function getPaymentStatusMeta(
  status: PaymentStatusInput,
): { label: string; tone: BadgeTone } {
  return PAYMENT_STATUS_BADGE_MAP[status] ?? {
    label: formatOrderStatusLabel(status),
    tone: 'neutral',
  };
}

const RETURN_STATUS_BADGE_MAP: Record<ReturnStatusInput, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: 'Requested', tone: 'warning' },
  UNDER_REVIEW: { label: 'Under Review', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'info' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  RECEIVED: { label: 'Received & Inspected', tone: 'success' },
  REFUNDED: { label: 'Refunded', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

export function getReturnStatusMeta(
  status: ReturnStatusInput,
): { label: string; tone: BadgeTone } {
  return RETURN_STATUS_BADGE_MAP[status] ?? {
    label: formatOrderStatusLabel(status),
    tone: 'neutral',
  };
}

export const CUSTOMER_RETURN_REASONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'SIZE_FIT', label: 'Size or Fit Adjustment' },
  { value: 'DEFECTIVE_ITEM', label: 'Defective Craftsmanship or Stitching' },
  { value: 'WRONG_ITEM', label: 'Wrong Garment or Size Delivered' },
  { value: 'DAMAGED_IN_TRANSIT', label: 'Damaged During Transit' },
  { value: 'OTHER', label: 'Other Reason' },
];

export function isOrderReturnEligible(status: OrderStatusInput): boolean {
  return status === 'DELIVERED';
}

export function isOrderReturnInProgress(status: OrderStatusInput): boolean {
  return (
    status === 'RETURN_REQUESTED' ||
    status === 'RETURN_APPROVED' ||
    status === 'RETURNED'
  );
}

export function clampReturnQuantity(requested: number, purchasedQuantity: number): number {
  if (!Number.isFinite(requested) || !Number.isInteger(requested)) {
    return 1;
  }
  const maxQty = Math.max(1, purchasedQuantity);
  return Math.min(maxQty, Math.max(1, requested));
}
