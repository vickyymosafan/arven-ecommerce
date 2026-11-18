import type { BadgeTone } from '@arven/ui';
import type { OrderStatusInput, PaymentStatusInput } from '@arven/contracts';

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
