import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/config/env";

// ─── Webhook HMAC-SHA256 Authentication ──────────────────────────────────────

/**
 * Verify an HMAC-SHA256 webhook signature.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param payload - The raw request body string
 * @param signature - The signature from the request header (hex-encoded)
 * @param secret - The shared secret (defaults to WEBHOOK_SECRET from env)
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret?: string
): boolean {
  const webhookSecret = secret ?? getEnv().WEBHOOK_SECRET;

  const expected = createHmac("sha256", webhookSecret)
    .update(payload, "utf-8")
    .digest("hex");

  // Signatures must be same length for timing-safe comparison
  if (signature.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}

/**
 * Generate an HMAC-SHA256 signature for a payload.
 * Used in testing and outbound webhook calls.
 */
export function generateWebhookSignature(
  payload: string,
  secret?: string
): string {
  const webhookSecret = secret ?? getEnv().WEBHOOK_SECRET;

  return createHmac("sha256", webhookSecret)
    .update(payload, "utf-8")
    .digest("hex");
}
