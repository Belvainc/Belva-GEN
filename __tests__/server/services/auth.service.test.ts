import { login, logout, refreshToken, changePassword } from "@/server/services/auth.service";
import { AuthenticationError } from "@/lib/errors";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUser = {
  id: "user-123",
  email: "test@belva.dev",
  name: "Test User",
  role: "ADMIN",
  status: "ACTIVE",
  passwordHash: "mocked-hash",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

jest.mock("@/server/db/client", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("@/server/auth/password", () => ({
  hashPassword: jest.fn().mockResolvedValue("new-hashed-password"),
  verifyPassword: jest.fn(),
}));

jest.mock("@/server/auth/jwt", () => ({
  signToken: jest.fn().mockResolvedValue("mock-jwt-token"),
}));

jest.mock("@/server/auth/session", () => ({
  createSession: jest.fn().mockResolvedValue("session-abc"),
  revokeSession: jest.fn().mockResolvedValue(undefined),
  revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
  getSession: jest.fn(),
  touchSession: jest.fn().mockResolvedValue(undefined),
}));

// Import mocked modules
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/auth/password";
import { signToken } from "@/server/auth/jwt";
import {
  createSession,
  revokeSession,
  getSession,
  touchSession,
  revokeAllUserSessions,
} from "@/server/auth/session";

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockVerifyPassword = verifyPassword as jest.Mock;
const mockSignToken = signToken as jest.Mock;
const mockCreateSession = createSession as jest.Mock;
const mockRevokeSession = revokeSession as jest.Mock;
const mockGetSession = getSession as jest.Mock;
const mockTouchSession = touchSession as jest.Mock;

describe("auth service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("login", () => {
    it("returns user and token on valid credentials", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);

      const result = await login("test@belva.dev", "correct-password");

      expect(result.user.id).toBe("user-123");
      expect(result.user.email).toBe("test@belva.dev");
      expect(result.token).toBe("mock-jwt-token");
      expect(mockCreateSession).toHaveBeenCalledWith("user-123");
    });

    it("normalizes email to lowercase", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);

      await login("Test@Belva.Dev", "correct-password");

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { email: "test@belva.dev" },
      });
    });

    it("throws AuthenticationError for non-existent user", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(login("unknown@belva.dev", "password")).rejects.toThrow(
        AuthenticationError
      );
    });

    it("throws AuthenticationError for deactivated user", async () => {
      mockFindUnique.mockResolvedValue({ ...mockUser, status: "DEACTIVATED" });

      await expect(login("test@belva.dev", "password")).rejects.toThrow(
        "deactivated"
      );
    });

    it("throws AuthenticationError for wrong password", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(false);

      await expect(login("test@belva.dev", "wrong")).rejects.toThrow(
        AuthenticationError
      );
    });

    it("creates both Redis and DB session records", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);

      await login("test@belva.dev", "correct-password");

      expect(mockCreateSession).toHaveBeenCalledWith("user-123");
      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: "session-abc",
            userId: "user-123",
          }),
        })
      );
    });

    it("signs JWT with correct payload", async () => {
      mockFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);

      await login("test@belva.dev", "correct-password");

      expect(mockSignToken).toHaveBeenCalledWith({
        userId: "user-123",
        role: "ADMIN",
        sessionId: "session-abc",
      });
    });
  });

  describe("logout", () => {
    it("revokes Redis session", async () => {
      await logout("session-abc", "user-123");
      expect(mockRevokeSession).toHaveBeenCalledWith("session-abc", "user-123");
    });

    it("deletes DB session record", async () => {
      await logout("session-abc", "user-123");
      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { id: "session-abc" },
      });
    });

    it("does not throw if DB session already deleted", async () => {
      (prisma.session.delete as jest.Mock).mockRejectedValue(
        new Error("not found")
      );
      // Should not throw
      await logout("session-abc", "user-123");
    });
  });

  describe("refreshToken", () => {
    it("returns new token when session is valid", async () => {
      mockGetSession.mockResolvedValue({
        userId: "user-123",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });

      const token = await refreshToken("session-abc", "user-123", "ADMIN");

      expect(token).toBe("mock-jwt-token");
      expect(mockTouchSession).toHaveBeenCalledWith("session-abc");
    });

    it("returns null when session is expired", async () => {
      mockGetSession.mockResolvedValue(null);

      const token = await refreshToken("session-abc", "user-123", "ADMIN");
      expect(token).toBeNull();
    });
  });

  describe("changePassword", () => {
    it("updates password hash and revokes all sessions", async () => {
      await changePassword("user-123", "new-password");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { passwordHash: "new-hashed-password" },
      });
      expect(revokeAllUserSessions).toHaveBeenCalledWith("user-123");
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
      });
    });
  });
});
