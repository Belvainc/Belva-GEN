import { prisma } from "@/server/db/client";
import { redis } from "@/server/config/redis";
import { getExecutor } from "@/server/agents/execution";
import { getAllCircuitBreakers } from "@/server/lib/circuit-breaker-registry";

// ─── Health Service ─────────────────────────────────────────────────────────
// Reusable health check logic for the system health dashboard.

interface ServiceCheckResult {
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}

interface CircuitBreakerInfo {
  name: string;
  state: "closed" | "open" | "half-open";
  failureCount: number;
}

interface SystemHealthResult {
  overallStatus: "healthy" | "degraded" | "unhealthy";
  services: {
    database: ServiceCheckResult;
    redis: ServiceCheckResult;
    executor: ServiceCheckResult;
  };
  circuitBreakers: CircuitBreakerInfo[];
  uptimeSeconds: number;
  version: string;
}

const startTime = Date.now();

/**
 * Check database connectivity via a simple query.
 */
export async function checkDatabase(): Promise<ServiceCheckResult> {
  const start = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Math.round(performance.now() - start) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      error: message,
    };
  }
}

/**
 * Check Redis connectivity via PING.
 */
export async function checkRedis(): Promise<ServiceCheckResult> {
  const start = performance.now();
  try {
    await redis.ping();
    return { status: "ok", latencyMs: Math.round(performance.now() - start) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown Redis error";
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      error: message,
    };
  }
}

/**
 * Check agent executor health.
 */
export async function checkExecutor(): Promise<ServiceCheckResult> {
  const start = performance.now();
  try {
    const executor = getExecutor();
    const result = await executor.healthCheck();
    const latencyMs = Math.round(performance.now() - start);

    if (result.status === "unhealthy") {
      return { status: "error", latencyMs, error: "Executor reports unhealthy" };
    }

    return { status: "ok", latencyMs };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown executor error";
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      error: message,
    };
  }
}

/**
 * Get complete system health including all services and circuit breakers.
 */
export async function getSystemHealth(): Promise<SystemHealthResult> {
  const [database, redisResult, executor] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkExecutor(),
  ]);

  // Collect circuit breaker info
  const breakers = getAllCircuitBreakers();
  const circuitBreakers: CircuitBreakerInfo[] = [];
  for (const [name, breaker] of breakers) {
    circuitBreakers.push({
      name,
      state: breaker.getState(),
      failureCount: breaker.getFailureCount(),
    });
  }

  // Determine overall status
  const services = { database, redis: redisResult, executor };
  const statuses = [database.status, redisResult.status, executor.status];
  const errorCount = statuses.filter((s) => s === "error").length;

  let overallStatus: "healthy" | "degraded" | "unhealthy";
  if (errorCount === 0) {
    overallStatus = "healthy";
  } else if (errorCount < statuses.length) {
    overallStatus = "degraded";
  } else {
    overallStatus = "unhealthy";
  }

  return {
    overallStatus,
    services,
    circuitBreakers,
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version ?? "0.0.0",
  };
}
