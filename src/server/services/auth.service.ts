import { prisma } from "../db/client";
import { hashPassword, verifyPassword } from "../auth/password";
import { signToken } from "../auth/jwt";
import { createSession, revokeSession, revokeAllUserSessions, getSession, touchSession } from "../auth/session";
import { AuthenticationError } from "@/lib/errors";
import type { UserResponse } from "@/types/auth";

// ─── Auth Service ──────────────────────────────────────────────────────────────
// Handles login, logout, and token refresh. Follows the deps-injection pattern
// from approval.service.ts but currently has no external deps.

function toUserResponse(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserResponse["role"],
    status: user.status as UserResponse["status"],
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Authenticate a user with email and password.
 * Returns user data and a signed JWT token.
 */
export async function login(
  email: string,
  password: string
): Promise<{ user: UserResponse; token: string }> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (user === null) {
    throw new AuthenticationError("Invalid email or password");
  }

  if (user.status === "DEACTIVATED") {
    throw new AuthenticationError("Account has been deactivated");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthenticationError("Invalid email or password");
  }

  const sessionId = await createSession(user.id);

  // Also persist session in DB for admin visibility
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    },
  });

  const token = await signToken({
    userId: user.id,
    role: user.role,
    sessionId,
  });

  return { user: toUserResponse(user), token };
}

/**
 * Log out by revoking the session.
 */
export async function logout(sessionId: string, userId: string): Promise<void> {
  await revokeSession(sessionId, userId);

  // Clean up DB session record
  await prisma.session.delete({
    where: { id: sessionId },
  }).catch(() => {
    // Session may not exist in DB (e.g., already cleaned up)
  });
}

/**
 * Refresh a token if the session is still valid.
 * Touches the session to reset idle timeout.
 * Returns a new JWT or null if session expired.
 */
export async function refreshToken(
  sessionId: string,
  userId: string,
  role: string
): Promise<string | null> {
  const session = await getSession(sessionId);
  if (session === null) {
    return null;
  }

  await touchSession(sessionId);

  return signToken({ userId, role, sessionId });
}

/**
 * Change a user's password. Revokes all existing sessions.
 */
export async function changePassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await revokeAllUserSessions(userId);

  // Clean up all DB session records
  await prisma.session.deleteMany({
    where: { userId },
  });
}
