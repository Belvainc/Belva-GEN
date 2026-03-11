import Redis from "ioredis";
import { getEnv } from "./env";

// ─── Redis Client Singleton ──────────────────────────────────────────────────
// Shared Redis connection for cache, rate limiting, and BullMQ backing store.
// Uses lazy connect so the app doesn't block on Redis during startup.

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const env = getEnv();

  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number {
      return Math.min(times * 200, 5000);
    },
    lazyConnect: true,
  });
}

export const redis: Redis =
  globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Gracefully disconnect Redis. Called during shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
