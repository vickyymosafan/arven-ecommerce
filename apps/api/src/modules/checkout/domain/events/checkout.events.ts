export const CHECKOUT_EVENT_TYPES = {
  INVENTORY_RESERVED: 'inventory.reserved',
  ORDER_CREATED: 'order.created',
} as const;

export interface InventoryReservedEventPayload {
  orderId: string;
  orderNumber: string;
  warehouseId: string;
  expiresAt: string;
  items: ReadonlyArray<{ variantId: string; quantity: number }>;
}

export interface OrderCreatedEventPayload {
  orderId: string;
  orderNumber: string;
  isGuest: boolean;
  grandTotalIdr: number;
  currency: 'IDR';
  shippingProvider: string;
  shippingService: string;
  paymentExpiresAt: string;
}
