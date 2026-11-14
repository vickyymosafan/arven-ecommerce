import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  actorId?: string;
  sessionId?: string;
  sessionScope?: 'CUSTOMER' | 'ADMIN';
}

const requestStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Executes a callback inside an isolated async request correlation context.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestStorage.run({ ...context }, fn);
}

/**
 * Reads the current async request correlation context, if present.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestStorage.getStore();
}

/**
 * Reads the active correlation requestId from AsyncLocalStorage.
 */
export function getRequestId(): string | undefined {
  return requestStorage.getStore()?.requestId;
}

/**
 * Attaches authenticated actor metadata onto the active request context store.
 */
export function patchRequestContext(patch: Partial<RequestContext>): void {
  const store = requestStorage.getStore();
  if (!store) {
    return;
  }
  if (patch.actorId !== undefined) {
    store.actorId = patch.actorId;
  }
  if (patch.sessionId !== undefined) {
    store.sessionId = patch.sessionId;
  }
  if (patch.sessionScope !== undefined) {
    store.sessionScope = patch.sessionScope;
  }
}
