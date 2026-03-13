"use client";

import { useState, useCallback, type ReactNode } from "react";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";

interface JiraSyncBarProps {
  projectId: string;
  lastSyncAt: string | null;
  syncStatus: string;
}

interface SyncResultData {
  totalFound: number;
  upserted: number;
  newPipelines: number;
  errors: string[];
  syncedAt: string;
}

/** Minimum time between manual syncs (1 minute). */
const SYNC_COOLDOWN_MS = 60 * 1000;

function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return date.toLocaleDateString();
}

export function JiraSyncBar({
  projectId,
  lastSyncAt,
  syncStatus,
}: JiraSyncBarProps): ReactNode {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResultData | null>(null);
  const [lastSync, setLastSync] = useState(lastSyncAt);
  const [error, setError] = useState<string | null>(null);

  const isCooldownActive =
    lastSync !== null &&
    Date.now() - new Date(lastSync).getTime() < SYNC_COOLDOWN_MS;

  const handleSync = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/sync`, { method: "POST" });
      const json = (await res.json()) as {
        success: boolean;
        data?: SyncResultData;
        error?: { message: string };
      };

      if (json.success && json.data !== undefined) {
        setResult(json.data);
        setLastSync(json.data.syncedAt);
      } else if (res.status === 429) {
        setError("Please wait before syncing again");
      } else {
        setError(json.error?.message ?? "Sync failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const displaySync = lastSync ?? lastSyncAt;
  const showNeverSynced = syncStatus === "never" && result === null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
      <Text variant="small" className="font-medium text-muted-foreground">
        Jira
      </Text>

      {showNeverSynced ? (
        <Badge variant="default">Never synced</Badge>
      ) : result !== null ? (
        <>
          <Badge variant={result.newPipelines > 0 ? "info" : "default"}>
            {result.totalFound} tickets
          </Badge>
          {result.newPipelines > 0 ? (
            <Badge variant="info">{result.newPipelines} new pipelines</Badge>
          ) : null}
        </>
      ) : syncStatus === "error" ? (
        <Badge variant="error">Sync error</Badge>
      ) : (
        <Badge variant="default">Synced</Badge>
      )}

      {displaySync !== null ? (
        <Text variant="small" className="text-muted-foreground">
          {formatSyncTime(displaySync)}
        </Text>
      ) : null}

      {error !== null ? (
        <Text variant="small" className="text-status-error">
          {error}
        </Text>
      ) : null}

      <div className="ml-auto">
        <Button
          variant="secondary"
          size="sm"
          loading={loading}
          disabled={isCooldownActive}
          onClick={handleSync}
        >
          Sync Now
        </Button>
      </div>
    </div>
  );
}
