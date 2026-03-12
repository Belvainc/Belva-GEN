import {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deactivateUser,
} from "@/server/services/user.service";
import { NotFoundError } from "@/lib/errors";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUser = {
  id: "user-123",
  email: "test@belva.dev",
  name: "Test User",
  role: "USER",
  status: "ACTIVE",
  passwordHash: "hash",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

jest.mock("@/server/db/client", () => ({
  prisma: {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    session: {
      deleteMany: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("@/server/auth/password", () => ({
  hashPassword: jest.fn().mockResolvedValue("hashed-pw"),
}));

jest.mock("@/server/auth/session", () => ({
  revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/server/db/client";
import { revokeAllUserSessions } from "@/server/auth/session";

const mockCreate = prisma.user.create as jest.Mock;
const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockFindMany = prisma.user.findMany as jest.Mock;
const mockCount = prisma.user.count as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;

describe("user service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createUser", () => {
    it("creates user with hashed password and lowercase email", async () => {
      mockCreate.mockResolvedValue(mockUser);

      const result = await createUser({
        email: "Test@BELVA.dev",
        password: "secure-pass",
        name: "Test User",
        role: "USER",
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: "test@belva.dev",
          passwordHash: "hashed-pw",
          name: "Test User",
          role: "USER",
        }),
      });
      expect(result.id).toBe("user-123");
      expect(result.email).toBe("test@belva.dev");
      // Should not include passwordHash in response
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe("getUserById", () => {
    it("returns user response for existing user", async () => {
      mockFindUnique.mockResolvedValue(mockUser);

      const result = await getUserById("user-123");
      expect(result.id).toBe("user-123");
      expect(result.email).toBe("test@belva.dev");
    });

    it("throws NotFoundError for non-existent user", async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(getUserById("non-existent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("listUsers", () => {
    it("returns paginated results", async () => {
      mockFindMany.mockResolvedValue([mockUser]);
      mockCount.mockResolvedValue(1);

      const result = await listUsers({ limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.nextCursor).toBeNull();
    });

    it("detects when there are more pages", async () => {
      // Return limit + 1 items to indicate more pages
      const users = Array.from({ length: 3 }, (_, i) => ({
        ...mockUser,
        id: `user-${i}`,
      }));
      mockFindMany.mockResolvedValue(users);
      mockCount.mockResolvedValue(10);

      const result = await listUsers({ limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBe("user-1");
      expect(result.total).toBe(10);
    });

    it("supports cursor pagination", async () => {
      mockFindMany.mockResolvedValue([mockUser]);
      mockCount.mockResolvedValue(5);

      await listUsers({ limit: 10, cursor: "cursor-id" });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: "cursor-id" },
          skip: 1,
        })
      );
    });
  });

  describe("updateUser", () => {
    it("updates user fields", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockUpdate.mockResolvedValue({ ...mockUser, name: "Updated Name" });

      const result = await updateUser("user-123", { name: "Updated Name" });
      expect(result.name).toBe("Updated Name");
    });

    it("normalizes email to lowercase on update", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockUpdate.mockResolvedValue({ ...mockUser, email: "new@belva.dev" });

      await updateUser("user-123", { email: "New@BELVA.dev" });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "new@belva.dev",
          }),
        })
      );
    });

    it("throws NotFoundError for non-existent user", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        updateUser("non-existent", { name: "Test" })
      ).rejects.toThrow(NotFoundError);
    });

    it("revokes all sessions when deactivating", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockUpdate.mockResolvedValue({
        ...mockUser,
        status: "DEACTIVATED",
      });

      await updateUser("user-123", { status: "DEACTIVATED" });

      expect(revokeAllUserSessions).toHaveBeenCalledWith("user-123");
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
      });
    });

    it("revokes all sessions when password changes", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockUpdate.mockResolvedValue(mockUser);

      await updateUser("user-123", { password: "new-password" });

      expect(revokeAllUserSessions).toHaveBeenCalledWith("user-123");
    });
  });

  describe("deactivateUser", () => {
    it("delegates to updateUser with DEACTIVATED status", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockUpdate.mockResolvedValue({
        ...mockUser,
        status: "DEACTIVATED",
      });

      const result = await deactivateUser("user-123");
      expect(result.status).toBe("DEACTIVATED");
    });
  });
});
