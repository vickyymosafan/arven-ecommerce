export const RETURNS_REPOSITORY = Symbol('RETURNS_REPOSITORY');

export interface LockedReturnRow {
  id: string;
  orderId: string;
  userId: string | null;
  status: string;
  adminNotes: string | null;
}

export interface LockedOrderForReturn {
  id: string;
  orderNumber: string;
  userId: string | null;
  guestTokenHash: string | null;
  status: string;
  updatedAt: Date;
}
