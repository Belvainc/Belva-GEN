import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { AuthContext } from "@/types/auth";
import { getAuthFromHeaders } from "./middleware-helpers";

// ─── Auth Guards ───────────────────────────────────────────────────────────────
// Convenience functions for route handlers to enforce auth requirements.
// These throw errors that map directly to HTTP status codes.

/**
 * Require authentication. Returns the auth context or throws 401.
 */
export function requireAuth(headers: Headers): AuthContext {
  const auth = getAuthFromHeaders(headers);
  if (auth === null) {
    throw new AuthenticationError();
  }
  return auth;
}

/**
 * Require admin role. Returns the auth context or throws 403.
 */
export function requireAdmin(headers: Headers): AuthContext {
  const auth = requireAuth(headers);
  if (auth.role !== "ADMIN") {
    throw new AuthorizationError("Admin access required");
  }
  return auth;
}

/**
 * Require that the authenticated user has access to a specific project.
 * Checks the user-project assignment in the database.
 */
export async function requireProjectAccess(
  headers: Headers,
  projectId: string
): Promise<AuthContext> {
  const auth = requireAuth(headers);

  // Admins have access to all projects
  if (auth.role === "ADMIN") {
    return auth;
  }

  // Lazy import to avoid circular dependency
  const { prisma } = await import("@/server/db/client");

  const assignment = await prisma.userProject.findUnique({
    where: {
      userId_projectId: {
        userId: auth.userId,
        projectId,
      },
    },
  });

  if (assignment === null) {
    throw new AuthorizationError("You do not have access to this project");
  }

  return auth;
}
