"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button/Button";
import { Input } from "@/components/atoms/Input/Input";
import { Spinner } from "@/components/atoms/Spinner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentCapabilities {
  taskTypes?: string[];
  maxConcurrentTasks?: number;
  ruleReferences?: string[];
}

interface AgentDetail {
  id: string;
  name: string;
  description: string;
  role: string;
  status: string;
  currentTask: string | null;
  capabilities: unknown;
  ownedPaths: string[];
  preferredModel: string | null;
  isActive: boolean;
  lastHeartbeat: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeVariant(
  status: string
): "success" | "warning" | "error" | "info" | "default" {
  switch (status) {
    case "IDLE":
      return "success";
    case "BUSY":
      return "info";
    case "ERROR":
      return "error";
    case "OFFLINE":
      return "default";
    default:
      return "default";
  }
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

function parseCapabilities(raw: unknown): AgentCapabilities {
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return {
      taskTypes: Array.isArray(obj.taskTypes)
        ? (obj.taskTypes as string[])
        : undefined,
      maxConcurrentTasks:
        typeof obj.maxConcurrentTasks === "number"
          ? obj.maxConcurrentTasks
          : undefined,
      ruleReferences: Array.isArray(obj.ruleReferences)
        ? (obj.ruleReferences as string[])
        : undefined,
    };
  }
  return {};
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentDetailPage(): ReactNode {
  const params = useParams();
  const id = params.id as string;

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Config form state
  const [preferredModel, setPreferredModel] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadAgent = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/agents/${id}/detail`);
      const json = (await res.json()) as {
        success: boolean;
        data?: AgentDetail;
        error?: { message: string };
      };
      if (json.success && json.data !== undefined) {
        setAgent(json.data);
        setPreferredModel(json.data.preferredModel ?? "");
        setIsActive(json.data.isActive);
      } else {
        setError(json.error?.message ?? "Failed to load agent");
      }
    } catch {
      setError("Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAgent();
  }, [loadAgent]);

  async function handleSaveConfig(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredModel:
            preferredModel.trim().length > 0 ? preferredModel.trim() : null,
          isActive,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: { message: string };
      };
      if (json.success) {
        await loadAgent();
      } else {
        setError(json.error?.message ?? "Failed to save configuration");
      }
    } catch {
      setError("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(): Promise<void> {
    const confirmed = confirm(
      "Are you sure you want to reset this agent to IDLE? This will clear its current task."
    );
    if (!confirmed) return;

    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agents/${id}/reset`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: { message: string };
      };
      if (json.success) {
        await loadAgent();
      } else {
        setError(json.error?.message ?? "Reset failed");
      }
    } catch {
      setError("Reset failed");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error !== null && agent === null) {
    return (
      <div className="py-8 text-center text-status-error">{error}</div>
    );
  }

  if (agent === null) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Agent not found
      </div>
    );
  }

  const capabilities = parseCapabilities(agent.capabilities);

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/admin/agents"
        className="text-sm text-primary hover:underline"
      >
        &larr; Back to Agents
      </Link>

      {/* Status Header */}
      <section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Text variant="h2" as="h1">
                {agent.name}
              </Text>
              <Badge
                variant={statusBadgeVariant(agent.status)}
                className="text-sm px-3 py-1"
              >
                {agent.status}
              </Badge>
            </div>
            <Text variant="muted">{agent.description}</Text>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Last heartbeat: {relativeTime(agent.lastHeartbeat)}</span>
              {agent.currentTask !== null && (
                <span>Current task: {agent.currentTask}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {error !== null && (
        <div
          role="alert"
          className="rounded-md border border-status-error/20 bg-status-error/10 px-4 py-3 text-sm text-status-error"
        >
          {error}
        </div>
      )}

      {/* Configuration Section */}
      <section>
        <Text variant="h3" as="h2" className="mb-4">
          Configuration
        </Text>
        <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
          <div className="max-w-md space-y-4">
            <div>
              <label
                htmlFor="preferred-model"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Preferred Model
              </label>
              <Input
                id="preferred-model"
                type="text"
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                placeholder="e.g. claude-sonnet-4-6"
              />
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm font-medium text-foreground">
                  Active
                </span>
                <span className="text-sm text-muted-foreground">
                  ({isActive ? "Enabled" : "Disabled"})
                </span>
              </label>
            </div>
          </div>
          <div>
            <Button
              variant="primary"
              onClick={handleSaveConfig}
              loading={saving}
              disabled={saving}
            >
              Save Configuration
            </Button>
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section>
        <Text variant="h3" as="h2" className="mb-4">
          Capabilities
        </Text>
        <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
          {capabilities.taskTypes !== undefined &&
            capabilities.taskTypes.length > 0 && (
              <div>
                <Text variant="muted" className="mb-2">
                  Task Types
                </Text>
                <div className="flex flex-wrap gap-2">
                  {capabilities.taskTypes.map((type) => (
                    <Badge key={type} variant="info">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

          {capabilities.maxConcurrentTasks !== undefined && (
            <div>
              <Text variant="muted">Max Concurrent Tasks</Text>
              <Text variant="body" className="font-semibold">
                {capabilities.maxConcurrentTasks}
              </Text>
            </div>
          )}

          {capabilities.ruleReferences !== undefined &&
            capabilities.ruleReferences.length > 0 && (
              <div>
                <Text variant="muted" className="mb-2">
                  Rule References
                </Text>
                <ul className="list-disc list-inside text-sm text-foreground space-y-1">
                  {capabilities.ruleReferences.map((ref) => (
                    <li key={ref} className="font-mono text-xs">
                      {ref}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {capabilities.taskTypes === undefined &&
            capabilities.maxConcurrentTasks === undefined &&
            capabilities.ruleReferences === undefined && (
              <Text variant="muted">No capabilities configured</Text>
            )}
        </div>
      </section>

      {/* Owned Paths Section */}
      <section>
        <Text variant="h3" as="h2" className="mb-4">
          Owned Paths
        </Text>
        <div className="rounded-xl border border-border bg-surface p-6">
          {agent.ownedPaths.length === 0 ? (
            <Text variant="muted">No owned paths</Text>
          ) : (
            <ul className="list-disc list-inside text-sm text-foreground space-y-1">
              {agent.ownedPaths.map((path) => (
                <li key={path} className="font-mono text-xs">
                  {path}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Actions */}
      {agent.status === "ERROR" && (
        <section>
          <Text variant="h3" as="h2" className="mb-4">
            Actions
          </Text>
          <div className="rounded-xl border border-border bg-surface p-6">
            <Button
              variant="danger"
              onClick={handleReset}
              loading={resetting}
              disabled={resetting}
            >
              Reset to IDLE
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
