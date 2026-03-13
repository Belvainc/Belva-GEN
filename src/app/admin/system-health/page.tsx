"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button/Button";
import { Spinner } from "@/components/atoms/Spinner";

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface SystemHealthData {
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

interface ApiSuccessResponse {
  success: true;
  data: SystemHealthData;
}

interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string };
}

type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function overallStatusVariant(
  status: SystemHealthData["overallStatus"]
): "success" | "warning" | "error" {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
      return "warning";
    case "unhealthy":
      return "error";
  }
}

function overallStatusLabel(
  status: SystemHealthData["overallStatus"]
): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "unhealthy":
      return "Unhealthy";
  }
}

function circuitBreakerVariant(
  state: CircuitBreakerInfo["state"]
): "success" | "error" | "warning" {
  switch (state) {
    case "closed":
      return "success";
    case "open":
      return "error";
    case "half-open":
      return "warning";
  }
}

// ─── Components ─────────────────────────────────────────────────────────────

function ServiceCard({
  label,
  check,
}: {
  label: string;
  check: ServiceCheckResult;
}): ReactNode {
  const dotColor = check.status === "ok" ? "bg-green-500" : "bg-red-500";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span
          className={`inline-block h-3 w-3 rounded-full ${dotColor}`}
          aria-label={`${label} status: ${check.status}`}
        />
        <Text variant="h4">{label}</Text>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Text variant="muted">Latency:</Text>
        <Text variant="small">{check.latencyMs}ms</Text>
      </div>
      {check.error !== undefined && (
        <Text variant="muted" className="mt-1 text-status-error">
          {check.error}
        </Text>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SystemHealthPage(): ReactNode {
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resettingBreaker, setResettingBreaker] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/system-health");
      const json = (await res.json()) as ApiResponse;

      if (!json.success) {
        setError(json.error.message);
        return;
      }

      setHealth(json.data);
      setError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch health data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(() => void fetchHealth(), 15_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const handleResetBreaker = useCallback(
    async (name: string) => {
      setResettingBreaker(name);
      try {
        await fetch("/api/admin/system-health/circuit-breakers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        await fetchHealth();
      } finally {
        setResettingBreaker(null);
      }
    },
    [fetchHealth]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error !== null && health === null) {
    return (
      <div className="p-6">
        <Text variant="h2">System Health</Text>
        <div className="mt-4 rounded-lg border border-status-error bg-status-error/5 p-4">
          <Text variant="body" className="text-status-error">
            {error}
          </Text>
        </div>
      </div>
    );
  }

  if (health === null) {
    return null;
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Text variant="h2">System Health</Text>
        <div className="flex items-center gap-3">
          <Badge
            variant={overallStatusVariant(health.overallStatus)}
            className="px-4 py-1.5 text-sm"
          >
            {overallStatusLabel(health.overallStatus)}
          </Badge>
        </div>
      </div>

      {/* Uptime and Version */}
      <div className="flex items-center gap-6">
        <div>
          <Text variant="muted">Uptime</Text>
          <Text variant="body">{formatUptime(health.uptimeSeconds)}</Text>
        </div>
        <div>
          <Text variant="muted">Version</Text>
          <Text variant="body">{health.version}</Text>
        </div>
      </div>

      {/* Service Cards */}
      <div>
        <Text variant="h3" className="mb-4">
          Services
        </Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ServiceCard label="Database" check={health.services.database} />
          <ServiceCard label="Redis" check={health.services.redis} />
          <ServiceCard label="Executor" check={health.services.executor} />
        </div>
      </div>

      {/* Circuit Breakers */}
      {health.circuitBreakers.length > 0 && (
        <div>
          <Text variant="h3" className="mb-4">
            Circuit Breakers
          </Text>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {health.circuitBreakers.map((breaker) => (
              <div
                key={breaker.name}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between">
                  <Text variant="h4">{breaker.name}</Text>
                  <Badge variant={circuitBreakerVariant(breaker.state)}>
                    {breaker.state}
                  </Badge>
                </div>
                <div className="mt-2">
                  <Text variant="muted">
                    Failures: {breaker.failureCount}
                  </Text>
                </div>
                {breaker.state !== "closed" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    loading={resettingBreaker === breaker.name}
                    onClick={() => void handleResetBreaker(breaker.name)}
                  >
                    Reset
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {error !== null && (
        <Text variant="muted" className="text-status-warning">
          Warning: Last refresh failed. Showing stale data.
        </Text>
      )}
    </div>
  );
}
