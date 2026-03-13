"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button/Button";
import { Spinner } from "@/components/atoms/Spinner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface QueueSummary {
  name: string;
  counts: QueueCounts;
}

interface FailedJob {
  id: string;
  name: string;
  failedReason: string;
  timestamp: number;
}

interface QueueDetail {
  name: string;
  counts: QueueCounts;
  failedJobs: FailedJob[];
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: { code: string; message: string };
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function countVariant(
  count: number,
  type: "warning" | "error"
): "default" | "warning" | "error" {
  if (count === 0) return "default";
  return type;
}

// ─── Components ─────────────────────────────────────────────────────────────

function QueueCard({
  queue,
  selected,
  onClick,
}: {
  queue: QueueSummary;
  selected: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/50"
      }`}
    >
      <Text variant="h4" className="mb-3">
        {queue.name}
      </Text>
      <div className="flex flex-wrap gap-2">
        <Badge variant={countVariant(queue.counts.waiting, "warning")}>
          {queue.counts.waiting} waiting
        </Badge>
        <Badge variant={countVariant(queue.counts.active, "warning")}>
          {queue.counts.active} active
        </Badge>
        <Badge variant={countVariant(queue.counts.failed, "error")}>
          {queue.counts.failed} failed
        </Badge>
      </div>
    </button>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function QueueMonitorPage(): ReactNode {
  const [queues, setQueues] = useState<QueueSummary[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [detail, setDetail] = useState<QueueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingJob, setRetryingJob] = useState<string | null>(null);
  const [draining, setDraining] = useState(false);

  const fetchQueues = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/queues");
      const json = (await res.json()) as ApiResponse<QueueSummary[]>;

      if (!json.success) {
        setError(json.error.message);
        return;
      }

      setQueues(json.data);
      setError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch queue data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (name: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/admin/queues/${encodeURIComponent(name)}`
      );
      const json = (await res.json()) as ApiResponse<QueueDetail>;

      if (!json.success) {
        setDetail(null);
        return;
      }

      setDetail(json.data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueues();
    const interval = setInterval(() => void fetchQueues(), 10_000);
    return () => clearInterval(interval);
  }, [fetchQueues]);

  useEffect(() => {
    if (selectedQueue !== null) {
      void fetchDetail(selectedQueue);
    } else {
      setDetail(null);
    }
  }, [selectedQueue, fetchDetail]);

  const handleSelectQueue = useCallback(
    (name: string) => {
      setSelectedQueue((prev) => (prev === name ? null : name));
    },
    []
  );

  const handleRetryJob = useCallback(
    async (queueName: string, jobId: string) => {
      setRetryingJob(jobId);
      try {
        await fetch(
          `/api/admin/queues/${encodeURIComponent(queueName)}/retry`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId }),
          }
        );
        await fetchDetail(queueName);
        await fetchQueues();
      } finally {
        setRetryingJob(null);
      }
    },
    [fetchDetail, fetchQueues]
  );

  const handleDrain = useCallback(
    async (queueName: string) => {
      const confirmed = confirm(
        `Are you sure you want to drain all waiting jobs from "${queueName}"? This cannot be undone.`
      );
      if (!confirmed) return;

      setDraining(true);
      try {
        await fetch(
          `/api/admin/queues/${encodeURIComponent(queueName)}/drain`,
          { method: "POST" }
        );
        await fetchDetail(queueName);
        await fetchQueues();
      } finally {
        setDraining(false);
      }
    },
    [fetchDetail, fetchQueues]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error !== null && queues.length === 0) {
    return (
      <div className="p-6">
        <Text variant="h2">Queue Monitor</Text>
        <div className="mt-4 rounded-lg border border-status-error bg-status-error/5 p-4">
          <Text variant="body" className="text-status-error">
            {error}
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <Text variant="h2">Queue Monitor</Text>

      {/* Queue Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {queues.map((queue) => (
          <QueueCard
            key={queue.name}
            queue={queue}
            selected={selectedQueue === queue.name}
            onClick={() => handleSelectQueue(queue.name)}
          />
        ))}
      </div>

      {/* Detail Panel */}
      {selectedQueue !== null && (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <Text variant="h3">{selectedQueue}</Text>
            <Button
              variant="danger"
              size="sm"
              loading={draining}
              onClick={() => void handleDrain(selectedQueue)}
            >
              Drain Queue
            </Button>
          </div>

          {detailLoading && (
            <div className="flex justify-center py-6">
              <Spinner size="md" />
            </div>
          )}

          {!detailLoading && detail !== null && (
            <>
              {/* Counts summary */}
              <div className="mb-6 flex flex-wrap gap-3">
                <Badge variant="default">
                  {detail.counts.waiting} waiting
                </Badge>
                <Badge variant="default">
                  {detail.counts.active} active
                </Badge>
                <Badge variant="success">
                  {detail.counts.completed} completed
                </Badge>
                <Badge variant="error">
                  {detail.counts.failed} failed
                </Badge>
                <Badge variant="default">
                  {detail.counts.delayed} delayed
                </Badge>
              </div>

              {/* Failed Jobs */}
              <Text variant="h4" className="mb-3">
                Failed Jobs
              </Text>
              {detail.failedJobs.length === 0 ? (
                <Text variant="muted">No failed jobs.</Text>
              ) : (
                <div className="space-y-3">
                  {detail.failedJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-start justify-between rounded-md border border-border bg-background p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Text variant="small" className="font-medium">
                            {job.name}
                          </Text>
                          <Text variant="muted">
                            {formatTimestamp(job.timestamp)}
                          </Text>
                        </div>
                        <Text variant="muted" className="mt-1">
                          {truncate(job.failedReason, 120)}
                        </Text>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="ml-3 shrink-0"
                        loading={retryingJob === job.id}
                        onClick={() =>
                          void handleRetryJob(selectedQueue, job.id)
                        }
                      >
                        Retry
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error !== null && queues.length > 0 && (
        <Text variant="muted" className="text-status-warning">
          Warning: Last refresh failed. Showing stale data.
        </Text>
      )}
    </div>
  );
}
