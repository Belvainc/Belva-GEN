"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";

interface ServiceCheck {
  status: "ok" | "error";
  latencyMs?: number;
}

interface HealthData {
  overall: "healthy" | "degraded" | "unhealthy";
  services: Record<string, ServiceCheck>;
}

interface QueueCounts {
  waiting: number;
  active: number;
  failed: number;
}

interface QueueData {
  queues: Array<{ name: string; counts: QueueCounts }>;
}

export function AdminDashboardLive(): ReactNode {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [queues, setQueues] = useState<QueueData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, queuesRes] = await Promise.allSettled([
        fetch("/api/admin/system-health"),
        fetch("/api/admin/queues"),
      ]);

      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        const json = (await healthRes.value.json()) as { success: boolean; data: HealthData };
        if (json.success) setHealth(json.data);
      }

      if (queuesRes.status === "fulfilled" && queuesRes.value.ok) {
        const json = (await queuesRes.value.json()) as { success: boolean; data: QueueData };
        if (json.success) setQueues(json.data);
      }
    } catch {
      // Silently fail on dashboard — operational pages have full detail
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchData, 30_000);
    // Initial fetch via short timeout to avoid sync setState in effect
    const initial = setTimeout(fetchData, 0);
    return () => {
      clearInterval(interval);
      clearTimeout(initial);
    };
  }, [fetchData]);

  const totalFailed = queues?.queues?.reduce((sum, q) => sum + q.counts.failed, 0) ?? 0;

  return (
    <div className="mb-8 flex flex-wrap gap-4">
      {/* Health Status Strip */}
      <Link
        href="/admin/system-health"
        className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-4 py-3 hover:bg-surface"
      >
        <Text variant="small" className="font-medium">
          System
        </Text>
        {health === null ? (
          <Badge variant="default">Loading...</Badge>
        ) : (
          <>
            {Object.entries(health.services).map(([name, check]) => (
              <span key={name} className="flex items-center gap-1">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    check.status === "ok" ? "bg-status-success" : "bg-status-error"
                  }`}
                />
                <Text variant="small" className="text-muted-foreground capitalize">
                  {name}
                </Text>
              </span>
            ))}
          </>
        )}
      </Link>

      {/* Queue Alert */}
      <Link
        href="/admin/queues"
        className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-4 py-3 hover:bg-surface"
      >
        <Text variant="small" className="font-medium">
          Queues
        </Text>
        {queues === null ? (
          <Badge variant="default">Loading...</Badge>
        ) : totalFailed > 0 ? (
          <Badge variant="error">{totalFailed} failed</Badge>
        ) : (
          <Badge variant="default">All clear</Badge>
        )}
      </Link>
    </div>
  );
}
