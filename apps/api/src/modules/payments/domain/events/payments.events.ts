export const PAYMENT_EVENT_TYPES = {
  PAYMENT_PENDING: 'payment.pending',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
} as const;

export interface PaymentPendingEventPayload {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  providerReference: string;
  amountIdr: number;
  expiresAt: string;
}

export interface PaymentOutcomeEventPayload {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  providerReference: string;
  amountIdr: number;
  status: string;
  reason?: string;
}
