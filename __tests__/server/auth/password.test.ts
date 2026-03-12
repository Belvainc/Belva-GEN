import { hashPassword, verifyPassword } from "@/server/auth/password";

// ─── Password Hashing Tests ──────────────────────────────────────────────────

describe("password hashing", () => {
  describe("hashPassword", () => {
    it("returns a salt:hash formatted string", async () => {
      const result = await hashPassword("test-password");
      const parts = result.split(":");

      expect(parts).toHaveLength(2);
      expect(parts[0]).toHaveLength(64); // 32-byte salt = 64 hex chars
      expect(parts[1]).toHaveLength(128); // 64-byte hash = 128 hex chars
    });

    it("produces different hashes for the same password (random salt)", async () => {
      const a = await hashPassword("same-password");
      const b = await hashPassword("same-password");
      expect(a).not.toBe(b);
    });

    it("produces different hashes for different passwords", async () => {
      const a = await hashPassword("password-one");
      const b = await hashPassword("password-two");

      const hashA = a.split(":")[1];
      const hashB = b.split(":")[1];
      expect(hashA).not.toBe(hashB);
    });
  });

  describe("verifyPassword", () => {
    it("returns true for correct password", async () => {
      const hash = await hashPassword("correct-password");
      const result = await verifyPassword("correct-password", hash);
      expect(result).toBe(true);
    });

    it("returns false for incorrect password", async () => {
      const hash = await hashPassword("correct-password");
      const result = await verifyPassword("wrong-password", hash);
      expect(result).toBe(false);
    });

    it("returns false for malformed hash (no colon)", async () => {
      const result = await verifyPassword("test", "malformed-hash");
      expect(result).toBe(false);
    });

    it("returns false for empty stored hash", async () => {
      const result = await verifyPassword("test", "");
      expect(result).toBe(false);
    });

    it("works with special characters in password", async () => {
      const password = "p@$$w0rd!#%^&*()_+{}[]";
      const hash = await hashPassword(password);
      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword(password + "x", hash)).toBe(false);
    });

    it("works with unicode passwords", async () => {
      const password = "密码Пароль🔐";
      const hash = await hashPassword(password);
      expect(await verifyPassword(password, hash)).toBe(true);
    });
  });
});
