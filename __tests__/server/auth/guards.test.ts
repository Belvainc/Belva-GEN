import { requireAuth, requireAdmin, requireProjectAccess } from "@/server/auth/guards";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";

// Mock Prisma for requireProjectAccess
jest.mock("@/server/db/client", () => ({
  prisma: {
    userProject: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from "@/server/db/client";
const mockFindUnique = prisma.userProject.findUnique as jest.Mock;

// ─── Auth Guards Tests ────────────────────────────────────────────────────────

describe("auth guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeHeaders(overrides: Record<string, string> = {}): Headers {
    const headers = new Headers();
    headers.set("x-user-id", "user-123");
    headers.set("x-user-role", "USER");
    headers.set("x-session-id", "session-456");
    for (const [key, value] of Object.entries(overrides)) {
      if (value === "") {
        headers.delete(key);
      } else {
        headers.set(key, value);
      }
    }
    return headers;
  }

  describe("requireAuth", () => {
    it("returns auth context from valid headers", () => {
      const auth = requireAuth(makeHeaders());

      expect(auth.userId).toBe("user-123");
      expect(auth.role).toBe("USER");
      expect(auth.sessionId).toBe("session-456");
    });

    it("throws AuthenticationError when x-user-id is missing", () => {
      const headers = makeHeaders();
      headers.delete("x-user-id");

      expect(() => requireAuth(headers)).toThrow(AuthenticationError);
    });

    it("throws AuthenticationError when x-user-role is missing", () => {
      const headers = makeHeaders();
      headers.delete("x-user-role");

      expect(() => requireAuth(headers)).toThrow(AuthenticationError);
    });

    it("throws AuthenticationError when x-session-id is missing", () => {
      const headers = makeHeaders();
      headers.delete("x-session-id");

      expect(() => requireAuth(headers)).toThrow(AuthenticationError);
    });

    it("throws when all auth headers are missing", () => {
      expect(() => requireAuth(new Headers())).toThrow(AuthenticationError);
    });
  });

  describe("requireAdmin", () => {
    it("returns auth context for ADMIN user", () => {
      const auth = requireAdmin(makeHeaders({ "x-user-role": "ADMIN" }));

      expect(auth.userId).toBe("user-123");
      expect(auth.role).toBe("ADMIN");
    });

    it("throws AuthorizationError for non-admin user", () => {
      expect(() => requireAdmin(makeHeaders({ "x-user-role": "USER" }))).toThrow(
        AuthorizationError
      );
    });

    it("throws AuthenticationError when unauthenticated", () => {
      expect(() => requireAdmin(new Headers())).toThrow(AuthenticationError);
    });
  });

  describe("requireProjectAccess", () => {
    it("returns auth context for admin (bypasses project check)", async () => {
      const auth = await requireProjectAccess(
        makeHeaders({ "x-user-role": "ADMIN" }),
        "project-123"
      );

      expect(auth.role).toBe("ADMIN");
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("returns auth context for user with project assignment", async () => {
      mockFindUnique.mockResolvedValue({
        userId: "user-123",
        projectId: "project-123",
      });

      const auth = await requireProjectAccess(
        makeHeaders({ "x-user-role": "USER" }),
        "project-123"
      );

      expect(auth.userId).toBe("user-123");
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: {
          userId_projectId: {
            userId: "user-123",
            projectId: "project-123",
          },
        },
      });
    });

    it("throws AuthorizationError for user without project assignment", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        requireProjectAccess(
          makeHeaders({ "x-user-role": "USER" }),
          "project-123"
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it("throws AuthenticationError when unauthenticated", async () => {
      await expect(
        requireProjectAccess(new Headers(), "project-123")
      ).rejects.toThrow(AuthenticationError);
    });
  });
});
