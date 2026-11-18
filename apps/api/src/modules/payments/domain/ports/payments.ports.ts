export interface LockedOrderForPaymentSession {
  id: string;
  orderNumber: string;
  userId: string | null;
  guestEmail: string | null;
  guestTokenHash: string | null;
  status: string;
  grandTotalIdr: number;
  paymentExpiresAt: Date;
  addressRecipientName: string;
  addressPhone: string;
}

export interface LockedPaymentAndOrderRow {
  paymentId: string;
  paymentStatus: string;
  paymentAmountIdr: number;
  paymentMethod: string | null;
  paymentProviderTransactionId: string | null;
  orderId: string;
  orderNumber: string;
  orderUserId: string | null;
  orderStatus: string;
  orderGrandTotalIdr: number;
}
