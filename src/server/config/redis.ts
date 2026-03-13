import Redis from "ioredis";
import { getEnv } from "./env";
import { getLogger } from "./logger";

// ─── Redis Client Singleton ──────────────────────────────────────────────────
// Shared Redis connection for cache, rate limiting, and BullMQ backing store.
// Connects eagerly so the connection is ready before the first command.

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const env = getEnv();

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times: number): number {
      return Math.min(times * 200, 5000);
    },
  });

  client.on("error", (err: Error) => {
    getLogger().error({ err }, "Redis connection error");
  });

  return client;
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
