import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";
import { revokeAllUserSessions } from "../auth/session";
import { NotFoundError } from "@/lib/errors";
import type { CreateUserInput, UpdateUserInput, UserResponse } from "@/types/auth";
import type { User } from "@prisma/client";

// ─── User Service ──────────────────────────────────────────────────────────────
// Admin-only operations for managing users. Follows the service pattern
// from approval.service.ts.

export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}

function toUserResponse(user: User): UserResponse {
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
 * Create a new user. Admin-only operation.
 */
export async function createUser(
  input: CreateUserInput
): Promise<UserResponse> {
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      role: input.role,
    },
  });

  return toUserResponse(user);
}

/**
 * Get a user by ID.
 */
export async function getUserById(userId: string): Promise<UserResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (user === null) {
    throw new NotFoundError("User not found", "user", userId);
  }

  return toUserResponse(user);
}

/**
 * List users with cursor-based pagination.
 */
export async function listUsers(
  params: PaginationParams
): Promise<PaginatedResult<UserResponse>> {
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: params.limit + 1,
      cursor: params.cursor !== undefined ? { id: params.cursor } : undefined,
      skip: params.cursor !== undefined ? 1 : 0,
    }),
    prisma.user.count(),
  ]);

  const hasMore = items.length > params.limit;
  const data = hasMore ? items.slice(0, -1) : items;
  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem !== undefined ? lastItem.id : null;

  return {
    data: data.map(toUserResponse),
    nextCursor,
    total,
  };
}

/**
 * Update a user's profile or role.
 */
export async function updateUser(
  userId: string,
  input: UpdateUserInput
): Promise<UserResponse> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (existing === null) {
    throw new NotFoundError("User not found", "user", userId);
  }

  const updateData: Record<string, unknown> = {};

  if (input.email !== undefined) {
    updateData.email = input.email.toLowerCase();
  }
  if (input.name !== undefined) {
    updateData.name = input.name;
  }
  if (input.role !== undefined) {
    updateData.role = input.role;
  }
  if (input.status !== undefined) {
    updateData.status = input.status;
  }
  if (input.password !== undefined) {
    updateData.passwordHash = await hashPassword(input.password);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  // If deactivating, revoke all sessions immediately
  if (input.status === "DEACTIVATED") {
    await revokeAllUserSessions(userId);
    await prisma.session.deleteMany({ where: { userId } });
  }

  // If password changed, revoke all sessions
  if (input.password !== undefined) {
    await revokeAllUserSessions(userId);
    await prisma.session.deleteMany({ where: { userId } });
  }

  return toUserResponse(user);
}

/**
 * Deactivate a user and revoke all their sessions.
 */
export async function deactivateUser(userId: string): Promise<UserResponse> {
  return updateUser(userId, { status: "DEACTIVATED" });
}
