import { PaymentsDomainError } from '../errors/payments-domain.error.js';

export type PaymentDomainStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'SETTLEMENT'
  | 'FAILED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type ProviderStatusInput =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'SETTLEMENT'
  | 'FAILED'
  | 'EXPIRED'
  | 'REFUNDED';

export type WebhookTransitionAction =
  | 'SETTLE'
  | 'AUTHORIZE'
  | 'FAIL'
  | 'EXPIRE'
  | 'LATE_SETTLEMENT_CONFLICT'
  | 'AMOUNT_MISMATCH'
  | 'NOOP';

const CLOSED_OR_CANCELLED_ORDER_STATUSES = new Set(['EXPIRED', 'CANCELLED']);

export function assertOrderEligibleForPaymentSession(
  orderStatus: string,
  paymentExpiresAt: Date,
  now: Date,
): void {
  if (orderStatus !== 'PENDING_PAYMENT') {
    throw new PaymentsDomainError(
      409,
      'ORDER_PAYMENT_NOT_ELIGIBLE',
      `Cannot create payment session for order in status ${orderStatus}`,
      [{ field: 'status', issue: `Order status ${orderStatus} is not eligible` }],
    );
  }

  if (paymentExpiresAt.getTime() <= now.getTime()) {
    throw new PaymentsDomainError(
      409,
      'ORDER_PAYMENT_EXPIRED',
      'Order payment reservation window has expired',
    );
  }
}

export function isReusablePendingPayment(
  paymentStatus: string,
  paymentExpiresAt: Date,
  paymentAmountIdr: number,
  orderGrandTotalIdr: number,
  now: Date,
): boolean {
  return (
    paymentStatus === 'PENDING' &&
    paymentExpiresAt.getTime() > now.getTime() &&
    paymentAmountIdr === orderGrandTotalIdr
  );
}

export function evaluateWebhookTransition(params: {
  orderStatus: string;
  paymentStatus: string;
  providerStatus: ProviderStatusInput;
  providerAmountIdr: number;
  expectedAmountIdr: number;
}): WebhookTransitionAction {
  if (params.providerAmountIdr !== params.expectedAmountIdr) {
    return 'AMOUNT_MISMATCH';
  }

  if (params.providerStatus === 'SETTLEMENT') {
    if (params.orderStatus === 'PENDING_PAYMENT') {
      return 'SETTLE';
    }
    if (CLOSED_OR_CANCELLED_ORDER_STATUSES.has(params.orderStatus)) {
      return 'LATE_SETTLEMENT_CONFLICT';
    }
    return 'NOOP';
  }

  if (params.providerStatus === 'AUTHORIZED') {
    if (params.orderStatus === 'PENDING_PAYMENT' && params.paymentStatus === 'PENDING') {
      return 'AUTHORIZE';
    }
    return 'NOOP';
  }

  if (params.providerStatus === 'FAILED') {
    if (
      params.orderStatus === 'PENDING_PAYMENT' &&
      (params.paymentStatus === 'PENDING' || params.paymentStatus === 'AUTHORIZED')
    ) {
      return 'FAIL';
    }
    return 'NOOP';
  }

  if (params.providerStatus === 'EXPIRED') {
    if (
      params.orderStatus === 'PENDING_PAYMENT' &&
      (params.paymentStatus === 'PENDING' || params.paymentStatus === 'AUTHORIZED')
    ) {
      return 'EXPIRE';
    }
    return 'NOOP';
  }

  return 'NOOP';
}
