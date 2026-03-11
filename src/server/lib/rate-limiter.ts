import { redis } from "@/server/config/redis";

// ─── Redis-Backed Sliding Window Rate Limiter ────────────────────────────────

export interface RateLimitOptions {
  /** Maximum number of requests in the window. */
  readonly maxRequests: number;
  /** Window size in seconds. */
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAtMs: number;
}

/**
 * Check and increment the rate limit for a given key.
 * Uses Redis sorted sets for a sliding window approach.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - options.windowSeconds * 1000;
  const redisKey = `rate-limit:${key}`;

  // Atomic pipeline: remove old entries, add current, count, set TTL
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart);
  pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
  pipeline.zcard(redisKey);
  pipeline.pexpire(redisKey, options.windowSeconds * 1000);

  const results = await pipeline.exec();

  // zcard result is at index 2
  const count = (results?.[2]?.[1] as number | undefined) ?? 0;
  const allowed = count <= options.maxRequests;
  const remaining = Math.max(0, options.maxRequests - count);
  const resetAtMs = now + options.windowSeconds * 1000;

  return { allowed, remaining, resetAtMs };
}

/**
 * Create a rate limiter function for a specific route/action.
 */
export function createRateLimiter(options: RateLimitOptions) {
  return async function rateLimit(key: string): Promise<RateLimitResult> {
    return checkRateLimit(key, options);
  };
}

// ─── Pre-configured Limiters ─────────────────────────────────────────────────

/** API endpoint rate limiter: 100 requests per minute per IP. */
export const apiRateLimiter = createRateLimiter({
  maxRequests: 100,
  windowSeconds: 60,
});

/** Webhook rate limiter: 30 requests per minute per source. */
export const webhookRateLimiter = createRateLimiter({
  maxRequests: 30,
  windowSeconds: 60,
});
