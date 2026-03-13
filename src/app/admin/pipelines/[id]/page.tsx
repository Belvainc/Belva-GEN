"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button/Button";
import { Select } from "@/components/atoms/Select";
import { Spinner } from "@/components/atoms/Spinner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentSummary {
  id: string;
  name: string;
}

interface PipelineStage {
  id: string;
  name: string;
  status: string;
  order: number;
  agent: AgentSummary | null;
}

interface PipelineApproval {
  id: string;
  type: string;
  status: string;
  requestedBy: string;
  decidedAt: string | null;
  createdAt: string;
}

interface TaskDecomposition {
  id: string;
  totalPoints: number;
  riskAreas: string[];
  affectedFiles: string[];
  taskGraph: unknown;
}

interface ProjectSummary {
  name: string;
  slug: string;
}

interface PipelineDetail {
  id: string;
  epicKey: string;
  status: string;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
  stages: PipelineStage[];
  approvals: PipelineApproval[];
  decomposition: TaskDecomposition | null;
  project: ProjectSummary | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PIPELINE_STATUSES = [
  "FUNNEL",
  "REFINEMENT",
  "APPROVED",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
] as const;

function statusBadgeVariant(
  status: string
): "success" | "warning" | "error" | "info" | "default" {
  switch (status) {
    case "DONE":
      return "success";
    case "IN_PROGRESS":
    case "REVIEW":
      return "info";
    case "APPROVED":
    case "REFINEMENT":
      return "warning";
    case "FUNNEL":
      return "default";
    default:
      return "default";
  }
}

function stageDotColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-status-success";
    case "in-progress":
      return "bg-status-info";
    case "failed":
      return "bg-status-error";
    case "pending":
    default:
      return "bg-gray-400";
  }
}

function approvalStatusVariant(
  status: string
): "success" | "warning" | "error" | "info" | "default" {
  switch (status) {
    case "APPROVED":
      return "success";
    case "PENDING":
      return "warning";
    case "REJECTED":
      return "error";
    case "EXPIRED":
      return "default";
    default:
      return "default";
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PipelineDetailPage(): ReactNode {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [pipeline, setPipeline] = useState<PipelineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>(PIPELINE_STATUSES[0]);
  const [transitioning, setTransitioning] = useState(false);
  const [taskGraphExpanded, setTaskGraphExpanded] = useState(false);

  const loadPipeline = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/pipelines/${id}/detail`);
      const json = (await res.json()) as {
        success: boolean;
        data?: PipelineDetail;
        error?: { message: string };
      };
      if (json.success && json.data !== undefined) {
        setPipeline(json.data);
        setTargetStatus(json.data.status);
      } else {
        setError(json.error?.message ?? "Failed to load pipeline");
      }
    } catch {
      setError("Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  async function handleTransition(): Promise<void> {
    if (pipeline === null) return;
    if (targetStatus === pipeline.status) return;

    const confirmed = confirm(
      `Transition pipeline from ${pipeline.status} to ${targetStatus}?`
    );
    if (!confirmed) return;

    setTransitioning(true);
    try {
      const res = await fetch(`/api/admin/pipelines/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: { message: string };
      };
      if (json.success) {
        await loadPipeline();
      } else {
        setError(json.error?.message ?? "Transition failed");
      }
    } catch {
      setError("Transition failed");
    } finally {
      setTransitioning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error !== null && pipeline === null) {
    return (
      <div className="py-8 text-center text-status-error">{error}</div>
    );
  }

  if (pipeline === null) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Pipeline not found
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/admin/pipelines"
        className="text-sm text-primary hover:underline"
      >
        &larr; Back to Pipelines
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Text variant="h2" as="h1">
              {pipeline.epicKey}
            </Text>
            <Badge
              variant={statusBadgeVariant(pipeline.status)}
              className="text-sm px-3 py-1"
            >
              {pipeline.status}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Revisions: {pipeline.revisionCount}</span>
            {pipeline.project !== null && (
              <span>Project: {pipeline.project.name}</span>
            )}
            <span>Created: {formatDate(pipeline.createdAt)}</span>
            <span>Updated: {formatDate(pipeline.updatedAt)}</span>
          </div>
        </div>
      </div>

      {error !== null && (
        <div
          role="alert"
          className="rounded-md border border-status-error/20 bg-status-error/10 px-4 py-3 text-sm text-status-error"
        >
          {error}
        </div>
      )}

      {/* Stages Timeline */}
      <section>
        <Text variant="h3" as="h2" className="mb-4">
          Stages
        </Text>
        <div className="rounded-xl border border-border bg-surface p-6">
          {pipeline.stages.length === 0 ? (
            <Text variant="muted">No stages defined</Text>
          ) : (
            <div className="space-y-4">
              {pipeline.stages.map((stage, idx) => (
                <div key={stage.id} className="flex items-start gap-4">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-3 w-3 rounded-full ${stageDotColor(stage.status)}`}
                    />
                    {idx < pipeline.stages.length - 1 && (
                      <div className="h-8 w-0.5 bg-border" />
                    )}
                  </div>
                  {/* Stage info */}
                  <div className="flex-1 -mt-0.5">
                    <div className="flex items-center gap-2">
                      <Text variant="body" className="font-medium">
                        {stage.name}
                      </Text>
                      {stage.agent !== null && (
                        <Badge variant="info">{stage.agent.name}</Badge>
                      )}
                    </div>
                    <Text variant="muted" className="capitalize">
                      {stage.status}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Task Decomposition */}
      {pipeline.decomposition !== null && (
        <section>
          <Text variant="h3" as="h2" className="mb-4">
            Task Decomposition
          </Text>
          <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
            <div className="flex flex-wrap gap-4">
              <div>
                <Text variant="muted">Total Points</Text>
                <Text variant="body" className="font-semibold">
                  {pipeline.decomposition.totalPoints}
                </Text>
              </div>
            </div>

            {pipeline.decomposition.riskAreas.length > 0 && (
              <div>
                <Text variant="muted" className="mb-2">
                  Risk Areas
                </Text>
                <div className="flex flex-wrap gap-2">
                  {pipeline.decomposition.riskAreas.map((risk) => (
                    <Badge key={risk} variant="warning">
                      {risk}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {pipeline.decomposition.affectedFiles.length > 0 && (
              <div>
                <Text variant="muted" className="mb-2">
                  Affected Files
                </Text>
                <ul className="list-disc list-inside text-sm text-foreground space-y-1">
                  {pipeline.decomposition.affectedFiles.map((file) => (
                    <li key={file} className="font-mono text-xs">
                      {file}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setTaskGraphExpanded((prev) => !prev)}
                className="text-sm text-primary hover:underline"
              >
                {taskGraphExpanded ? "Hide" : "Show"} Task Graph JSON
              </button>
              {taskGraphExpanded && (
                <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-surface-secondary p-4 text-xs font-mono">
                  {JSON.stringify(pipeline.decomposition.taskGraph, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Related Approvals */}
      <section>
        <Text variant="h3" as="h2" className="mb-4">
          Related Approvals
        </Text>
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          {pipeline.approvals.length === 0 ? (
            <div className="p-6">
              <Text variant="muted">No approvals</Text>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Requested By
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Decided At
                  </th>
                </tr>
              </thead>
              <tbody>
                {pipeline.approvals.map((approval) => (
                  <tr
                    key={approval.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50 cursor-pointer transition-colors"
                    onClick={() =>
                      router.push(`/admin/approvals/${approval.id}`)
                    }
                  >
                    <td className="px-4 py-3">
                      <Badge variant="info">{approval.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={approvalStatusVariant(approval.status)}>
                        {approval.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {approval.requestedBy}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {approval.decidedAt !== null
                        ? formatDate(approval.decidedAt)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Admin Actions */}
      <section>
        <Text variant="h3" as="h2" className="mb-4">
          Admin Actions
        </Text>
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <label
                htmlFor="target-status"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Target Status
              </label>
              <Select
                id="target-status"
                options={PIPELINE_STATUSES.map((s) => ({
                  value: s,
                  label: s,
                }))}
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
              />
            </div>
            <Button
              variant="primary"
              onClick={handleTransition}
              loading={transitioning}
              disabled={
                transitioning || targetStatus === pipeline.status
              }
            >
              Apply Transition
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
