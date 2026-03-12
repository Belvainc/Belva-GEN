import { redis } from "@/server/config/redis";
import { randomUUID } from "node:crypto";

// ─── Redis Session Store ───────────────────────────────────────────────────────
// Server-side session management for JWT revocation and idle timeout tracking.
// SOC2 compliant: 24h absolute timeout, 30min idle timeout.

const SESSION_PREFIX = "session:";
const ABSOLUTE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const IDLE_TIMEOUT_SECONDS = 30 * 60; // 30 minutes

export interface SessionData {
  userId: string;
  createdAt: number; // Unix timestamp ms
  lastActiveAt: number; // Unix timestamp ms
}

function sessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

function userSessionsKey(userId: string): string {
  return `user-sessions:${userId}`;
}

/**
 * Create a new session in Redis. Returns the session ID.
 */
export async function createSession(userId: string): Promise<string> {
  const sessionId = randomUUID();
  const now = Date.now();
  const data: SessionData = {
    userId,
    createdAt: now,
    lastActiveAt: now,
  };

  await redis.set(
    sessionKey(sessionId),
    JSON.stringify(data),
    "EX",
    ABSOLUTE_TTL_SECONDS
  );

  // Track session in user's session set (for revokeAll)
  await redis.sadd(userSessionsKey(userId), sessionId);

  return sessionId;
}

/**
 * Get session data. Returns null if session doesn't exist or has expired.
 * Checks both absolute and idle timeouts.
 */
export async function getSession(
  sessionId: string
): Promise<SessionData | null> {
  const raw = await redis.get(sessionKey(sessionId));
  if (raw === null) {
    return null;
  }

  const data = JSON.parse(raw) as SessionData;
  const now = Date.now();

  // Check absolute timeout (24h from creation)
  if (now - data.createdAt > ABSOLUTE_TTL_SECONDS * 1000) {
    await revokeSession(sessionId, data.userId);
    return null;
  }

  // Check idle timeout (30min since last activity)
  if (now - data.lastActiveAt > IDLE_TIMEOUT_SECONDS * 1000) {
    await revokeSession(sessionId, data.userId);
    return null;
  }

  return data;
}

/**
 * Touch a session to update its last activity timestamp.
 * Called on each authenticated request to reset the idle timeout.
 */
export async function touchSession(sessionId: string): Promise<void> {
  const raw = await redis.get(sessionKey(sessionId));
  if (raw === null) return;

  const data = JSON.parse(raw) as SessionData;
  data.lastActiveAt = Date.now();

  // Preserve remaining absolute TTL
  const ttl = await redis.ttl(sessionKey(sessionId));
  if (ttl > 0) {
    await redis.set(
      sessionKey(sessionId),
      JSON.stringify(data),
      "EX",
      ttl
    );
  }
}

/**
 * Revoke a single session.
 */
export async function revokeSession(
  sessionId: string,
  userId?: string
): Promise<void> {
  await redis.del(sessionKey(sessionId));
  if (userId !== undefined) {
    await redis.srem(userSessionsKey(userId), sessionId);
  }
}

/**
 * Revoke all sessions for a user (e.g., on deactivation or password change).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const sessionIds = await redis.smembers(userSessionsKey(userId));

  if (sessionIds.length > 0) {
    const keys = sessionIds.map((id) => sessionKey(id));
    await redis.del(...keys);
  }

  await redis.del(userSessionsKey(userId));
}
