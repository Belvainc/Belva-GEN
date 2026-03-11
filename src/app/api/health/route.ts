import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { redis } from "@/server/config/redis";

// ─── Health Check Types ──────────────────────────────────────────────────────

interface HealthCheck {
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, HealthCheck>;
  uptime: number;
  version: string;
  timestamp: string;
}

// ─── Server Start Time ───────────────────────────────────────────────────────

const startTime = Date.now();

// ─── Dependency Checks ───────────────────────────────────────────────────────

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await redis.ping();
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ─── GET /api/health ─────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const [database, redisCheck] = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
  ]);

  const checks: Record<string, HealthCheck> = {
    database:
      database.status === "fulfilled"
        ? database.value
        : { status: "error", error: String(database.reason) },
    redis:
      redisCheck.status === "fulfilled"
        ? redisCheck.value
        : { status: "error", error: String(redisCheck.reason) },
  };

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const anyError = Object.values(checks).some((c) => c.status === "error");

  const status: HealthResponse["status"] = allOk
    ? "healthy"
    : anyError
      ? "unhealthy"
      : "degraded";

  const response: HealthResponse = {
    status,
    checks,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  };

  const httpStatus = status === "healthy" ? 200 : 503;

  return NextResponse.json(response, { status: httpStatus });
}
