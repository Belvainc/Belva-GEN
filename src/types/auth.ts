import { z } from "zod";

// ─── Auth Types & Zod Schemas ──────────────────────────────────────────────────

export const UserRoleSchema = z.enum(["USER", "ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(["ACTIVE", "DEACTIVATED"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

// ─── Request Schemas ───────────────────────────────────────────────────────────

export const LoginRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  role: UserRoleSchema.default("USER"),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  role: UserRoleSchema.optional(),
  status: UserStatusSchema.optional(),
  password: z.string().min(8).optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

// ─── Response Schemas ──────────────────────────────────────────────────────────

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

export const LoginResponseSchema = z.object({
  user: UserResponseSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// ─── JWT Schemas ───────────────────────────────────────────────────────────────

export const JwtPayloadSchema = z.object({
  userId: z.string().uuid(),
  role: UserRoleSchema,
  sessionId: z.string().uuid(),
  iat: z.number(),
  exp: z.number(),
});
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

// ─── Auth Context (extracted from middleware headers) ───────────────────────────

export interface AuthContext {
  userId: string;
  role: UserRole;
  sessionId: string;
}
