import type { AuthContext, UserRole } from "@/types/auth";

// ─── Middleware Helpers ────────────────────────────────────────────────────────
// Extracts auth context from middleware-injected request headers.
// These headers are set by src/middleware.ts after JWT verification
// and are trusted because middleware is the only entry point.

/**
 * Extract auth context from request headers injected by middleware.
 * Returns null if headers are missing (unauthenticated request).
 */
export function getAuthFromHeaders(headers: Headers): AuthContext | null {
  const userId = headers.get("x-user-id");
  const role = headers.get("x-user-role");
  const sessionId = headers.get("x-session-id");

  if (userId === null || role === null || sessionId === null) {
    return null;
  }

  return { userId, role: role as UserRole, sessionId };
}

/**
 * Get the request ID from headers (set by middleware).
 */
export function getRequestIdFromHeaders(headers: Headers): string {
  return headers.get("x-request-id") ?? crypto.randomUUID();
}
