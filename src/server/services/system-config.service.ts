import { prisma } from "@/server/db/client";
import { redis } from "@/server/config/redis";
import { createChildLogger } from "@/server/config/logger";
import { z } from "zod";

const logger = createChildLogger({ module: "system-config" });

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_PREFIX = "sysconfig:";
const CACHE_TTL_SECONDS = 300; // 5 minutes

// ─── Known Config Keys ──────────────────────────────────────────────────────

export const SystemConfigKeySchema = z.enum([
  "approvalTimeoutMs",
  "maxRevisionCycles",
  "maxConcurrentTasksPerEpic",
  "enableSlackNotifications",
  "taskTimeoutMs",
  "jiraSyncIntervalMs",
]);
export type SystemConfigKey = z.infer<typeof SystemConfigKeySchema>;

/** Default values for system config keys. */
const DEFAULTS: Record<SystemConfigKey, unknown> = {
  approvalTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRevisionCycles: 3,
  maxConcurrentTasksPerEpic: 3,
  enableSlackNotifications: true,
  taskTimeoutMs: 600_000, // 10 minutes
  jiraSyncIntervalMs: 15 * 60 * 1000, // 15 minutes
};

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Get a system config value by key.
 * Checks Redis cache first, falls back to DB, then to default.
 */
export async function getConfigValue<T>(key: SystemConfigKey): Promise<T> {
  // 1. Check cache
  try {
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Cache miss or error — fall through to DB
  }

  // 2. Check DB
  const record = await prisma.systemConfig.findUnique({
    where: { key },
  });

  if (record !== null) {
    const value = record.value as T;
    // Populate cache
    await cacheValue(key, value);
    return value;
  }

  // 3. Return default
  return DEFAULTS[key] as T;
}

/**
 * Get all system config values as a typed object.
 */
export async function getAllConfigValues(): Promise<Record<SystemConfigKey, unknown>> {
  const records = await prisma.systemConfig.findMany();
  const result = { ...DEFAULTS };

  for (const record of records) {
    const parsed = SystemConfigKeySchema.safeParse(record.key);
    if (parsed.success) {
      result[parsed.data] = record.value;
    }
  }

  return result;
}

// ─── Write ──────────────────────────────────────────────────────────────────

/**
 * Set a system config value. Creates or updates the record.
 */
export async function setConfigValue(
  key: SystemConfigKey,
  value: unknown,
  updatedBy?: string
): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key },
    update: {
      value: value as never,
      updatedBy: updatedBy ?? null,
    },
    create: {
      key,
      value: value as never,
      updatedBy: updatedBy ?? null,
    },
  });

  await cacheValue(key, value);

  logger.info({ key, updatedBy }, "System config updated");
}

/**
 * Delete a system config value (reverts to default).
 */
export async function deleteConfigValue(key: SystemConfigKey): Promise<void> {
  await prisma.systemConfig.deleteMany({ where: { key } });
  await redis.del(`${CACHE_PREFIX}${key}`);

  logger.info({ key }, "System config deleted (reverted to default)");
}

// ─── Cache Helpers ──────────────────────────────────────────────────────────

async function cacheValue(key: string, value: unknown): Promise<void> {
  try {
    await redis.setex(
      `${CACHE_PREFIX}${key}`,
      CACHE_TTL_SECONDS,
      JSON.stringify(value)
    );
  } catch {
    // Non-critical — log and continue
    logger.warn({ key }, "Failed to cache system config value");
  }
}

/**
 * Invalidate all system config cache entries.
 */
export async function invalidateConfigCache(): Promise<void> {
  const keys = SystemConfigKeySchema.options;
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.del(`${CACHE_PREFIX}${key}`);
  }
  await pipeline.exec();
}
