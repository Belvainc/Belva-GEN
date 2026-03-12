import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { UserRole } from "@/types/auth";

// ─── Request Context ─────────────────────────────────────────────────────────
// Per-request context using AsyncLocalStorage. Middleware sets this at the
// start of each request; all downstream code can access requestId, timing,
// and authenticated user info without passing them through every function call.

export interface RequestContext {
  readonly requestId: string;
  readonly startTime: number;
  readonly userId?: string;
  readonly userRole?: UserRole;
  readonly sessionId?: string;
  readonly projectId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context, or undefined if not in a request scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Get the current request ID, falling back to "no-request" outside request scope.
 */
export function getRequestId(): string {
  return getRequestContext()?.requestId ?? "no-request";
}

/**
 * Create a new RequestContext with a fresh UUID and current timestamp.
 */
export function createRequestContext(
  requestId?: string
): RequestContext {
  return {
    requestId: requestId ?? randomUUID(),
    startTime: Date.now(),
  };
}

/**
 * Run a function within a request context scope.
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return requestContext.run(context, fn);
}
