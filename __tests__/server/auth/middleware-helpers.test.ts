import {
  getAuthFromHeaders,
  getRequestIdFromHeaders,
} from "@/server/auth/middleware-helpers";

// ─── Middleware Helpers Tests ──────────────────────────────────────────────────

describe("middleware helpers", () => {
  describe("getAuthFromHeaders", () => {
    it("extracts auth context from valid headers", () => {
      const headers = new Headers();
      headers.set("x-user-id", "user-123");
      headers.set("x-user-role", "ADMIN");
      headers.set("x-session-id", "session-456");

      const auth = getAuthFromHeaders(headers);

      expect(auth).not.toBeNull();
      expect(auth!.userId).toBe("user-123");
      expect(auth!.role).toBe("ADMIN");
      expect(auth!.sessionId).toBe("session-456");
    });

    it("returns null when x-user-id is missing", () => {
      const headers = new Headers();
      headers.set("x-user-role", "ADMIN");
      headers.set("x-session-id", "session-456");

      expect(getAuthFromHeaders(headers)).toBeNull();
    });

    it("returns null when x-user-role is missing", () => {
      const headers = new Headers();
      headers.set("x-user-id", "user-123");
      headers.set("x-session-id", "session-456");

      expect(getAuthFromHeaders(headers)).toBeNull();
    });

    it("returns null when x-session-id is missing", () => {
      const headers = new Headers();
      headers.set("x-user-id", "user-123");
      headers.set("x-user-role", "ADMIN");

      expect(getAuthFromHeaders(headers)).toBeNull();
    });

    it("returns null for empty headers", () => {
      expect(getAuthFromHeaders(new Headers())).toBeNull();
    });
  });

  describe("getRequestIdFromHeaders", () => {
    it("returns x-request-id when present", () => {
      const headers = new Headers();
      headers.set("x-request-id", "req-abc-123");

      expect(getRequestIdFromHeaders(headers)).toBe("req-abc-123");
    });

    it("generates a UUID when x-request-id is missing", () => {
      const result = getRequestIdFromHeaders(new Headers());
      // Should be a UUID-like string
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
