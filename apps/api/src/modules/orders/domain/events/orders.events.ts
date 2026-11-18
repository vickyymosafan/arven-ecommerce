export const ORDER_EVENT_TYPES = {
  INVENTORY_RELEASED: 'inventory.released',
  ORDER_CANCELLED: 'order.cancelled',
} as const;

export interface InventoryReleasedEventPayload {
  orderId: string;
  orderNumber: string;
  targetStatus: 'RELEASED' | 'EXPIRED';
  releasedReservationsCount: number;
  reason: string;
}
