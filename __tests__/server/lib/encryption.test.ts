import { encrypt, decrypt, type EncryptedData } from "@/server/lib/encryption";

// ─── Encryption Tests ─────────────────────────────────────────────────────────

// Use a fixed 32-byte key (64 hex chars) for testing
const TEST_KEY = "a".repeat(64);

describe("encryption", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe("encrypt", () => {
    it("returns encrypted data with iv and authTag", () => {
      const result = encrypt("hello world");

      expect(result.encryptedValue).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
      expect(result.encryptedValue).not.toBe("hello world");
    });

    it("produces different ciphertexts for the same plaintext (random IV)", () => {
      const a = encrypt("same input");
      const b = encrypt("same input");

      expect(a.encryptedValue).not.toBe(b.encryptedValue);
      expect(a.iv).not.toBe(b.iv);
    });

    it("handles empty string", () => {
      const result = encrypt("");
      const decrypted = decrypt(result);
      expect(decrypted).toBe("");
    });

    it("handles unicode content", () => {
      const input = "🔑 Ünîcödé tëst 日本語";
      const result = encrypt(input);
      const decrypted = decrypt(result);
      expect(decrypted).toBe(input);
    });

    it("handles long content", () => {
      const input = "x".repeat(10000);
      const result = encrypt(input);
      const decrypted = decrypt(result);
      expect(decrypted).toBe(input);
    });
  });

  describe("decrypt", () => {
    it("round-trips plaintext through encrypt/decrypt", () => {
      const plaintext = "my-secret-api-key-12345";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("throws on tampered ciphertext", () => {
      const encrypted = encrypt("original");
      const tampered: EncryptedData = {
        ...encrypted,
        encryptedValue: "ff" + encrypted.encryptedValue.slice(2),
      };

      expect(() => decrypt(tampered)).toThrow();
    });

    it("throws on wrong auth tag", () => {
      const encrypted = encrypt("original");
      const tampered: EncryptedData = {
        ...encrypted,
        authTag: "00".repeat(16),
      };

      expect(() => decrypt(tampered)).toThrow();
    });

    it("throws on wrong IV", () => {
      const encrypted = encrypt("original");
      const tampered: EncryptedData = {
        ...encrypted,
        iv: "00".repeat(16),
      };

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe("key validation", () => {
    it("throws when ENCRYPTION_KEY is missing", () => {
      const original = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY must be set");

      process.env.ENCRYPTION_KEY = original;
    });

    it("throws when ENCRYPTION_KEY is wrong length", () => {
      const original = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = "tooshort";

      expect(() => encrypt("test")).toThrow("64-character hex string");

      process.env.ENCRYPTION_KEY = original;
    });
  });
});
