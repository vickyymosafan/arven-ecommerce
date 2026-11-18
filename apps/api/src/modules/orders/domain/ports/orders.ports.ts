export interface OrderAccessDescriptor {
  id: string;
  userId: string | null;
  guestTokenHash: string | null;
}

export interface VerifiedOrderActor {
  actorType: 'CUSTOMER' | 'GUEST';
  actorId: string | null;
  actorScope: string;
}
