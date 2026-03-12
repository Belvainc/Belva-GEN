import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

// ─── Password Hashing ──────────────────────────────────────────────────────────
// Uses Node.js built-in scrypt (OWASP recommended). No native addon needed.
// Output format: `${salt}:${hash}` where both are hex-encoded.

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err !== null) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Hash a plaintext password using scrypt.
 * Returns a string in the format `salt:hash` (hex-encoded).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (saltHex === undefined || hashHex === undefined) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedHash = Buffer.from(hashHex, "hex");
  const actualHash = await scryptAsync(password, salt, KEY_LENGTH);

  return timingSafeEqual(expectedHash, actualHash);
}
