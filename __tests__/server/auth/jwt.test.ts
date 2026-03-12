import { signToken, verifyToken, type TokenPayload } from "@/server/auth/jwt";

// ─── JWT Tests ───────────────────────────────────────────────────────────────

const TEST_SECRET = "test-jwt-secret-must-be-at-least-32-characters-long";

describe("JWT token management", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  const validPayload: TokenPayload = {
    userId: "user-123",
    role: "ADMIN",
    sessionId: "session-456",
  };

  describe("signToken", () => {
    it("returns a string token", async () => {
      const token = await signToken(validPayload);
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
    });

    it("produces different tokens for different payloads", async () => {
      const a = await signToken(validPayload);
      const b = await signToken({ ...validPayload, userId: "user-789" });
      expect(a).not.toBe(b);
    });
  });

  describe("verifyToken", () => {
    it("round-trips a payload through sign/verify", async () => {
      const token = await signToken(validPayload);
      const result = await verifyToken(token);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe(validPayload.userId);
      expect(result!.role).toBe(validPayload.role);
      expect(result!.sessionId).toBe(validPayload.sessionId);
    });

    it("returns null for invalid token", async () => {
      const result = await verifyToken("invalid.token.here");
      expect(result).toBeNull();
    });

    it("returns null for empty token", async () => {
      const result = await verifyToken("");
      expect(result).toBeNull();
    });

    it("returns null for token signed with different secret", async () => {
      const token = await signToken(validPayload);

      // Change the secret
      process.env.JWT_SECRET = "different-secret-that-is-also-at-least-32-chars";
      const result = await verifyToken(token);
      expect(result).toBeNull();

      // Restore
      process.env.JWT_SECRET = TEST_SECRET;
    });
  });

  describe("secret validation", () => {
    it("throws when JWT_SECRET is missing", async () => {
      const original = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      await expect(signToken(validPayload)).rejects.toThrow("JWT_SECRET");

      process.env.JWT_SECRET = original;
    });

    it("throws when JWT_SECRET is too short", async () => {
      const original = process.env.JWT_SECRET;
      process.env.JWT_SECRET = "short";

      await expect(signToken(validPayload)).rejects.toThrow("JWT_SECRET");

      process.env.JWT_SECRET = original;
    });
  });
});
