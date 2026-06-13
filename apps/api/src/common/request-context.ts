import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestStore {
  userId?: string;
}

// Carries the current request's actor (JWT sub) down to the Prisma audit hook,
// which has no access to the HTTP request otherwise.
export const requestContext = new AsyncLocalStorage<RequestStore>();

export function currentUserId(): string | undefined {
  return requestContext.getStore()?.userId;
}
