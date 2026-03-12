import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

// ─── AES-256-GCM Encryption ───────────────────────────────────────────────────
// Encrypts sensitive data (e.g., project credentials) at rest in PostgreSQL.
// Bridge solution until AWS Secrets Manager vault abstraction is ready.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment. Must be 64 hex chars (32 bytes).
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (keyHex === undefined || keyHex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be set as a 64-character hex string (32 bytes)"
    );
  }
  return Buffer.from(keyHex, "hex");
}

export interface EncryptedData {
  encryptedValue: string; // hex
  iv: string; // hex
  authTag: string; // hex
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns encrypted value, IV, and auth tag (all hex-encoded).
 */
export function encrypt(plaintext: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

/**
 * Decrypt data encrypted with AES-256-GCM.
 * Requires the encrypted value, IV, and auth tag (all hex-encoded).
 */
export function decrypt(data: EncryptedData): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(data.iv, "hex");
  const authTag = Buffer.from(data.authTag, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(data.encryptedValue, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
