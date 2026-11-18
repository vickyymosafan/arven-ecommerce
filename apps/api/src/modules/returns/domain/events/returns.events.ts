export const RETURN_EVENT_TYPES = {
  RETURN_REQUESTED: 'return.requested',
} as const;

export interface ReturnRequestedEventPayload {
  returnId: string;
  orderId: string;
  orderNumber: string;
  reason: string;
  itemCount: number;
  totalQuantity: number;
}
