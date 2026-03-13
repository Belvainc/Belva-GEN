"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button/Button";
import { Textarea } from "@/components/atoms/Textarea";
import { Spinner } from "@/components/atoms/Spinner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PipelineSummary {
  id: string;
  epicKey: string;
  status: string;
}

interface ApprovalDetail {
  id: string;
  type: string;
  status: string;
  requestedBy: string;
  decidedById: string | null;
  decidedByLegacy: string | null;
  reason: string | null;
  riskLevel: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  planSummary: string | null;
  affectedFiles: string[];
  estimatedPoints: number | null;
  pipeline: PipelineSummary;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeVariant(
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

function riskBadgeVariant(
  level: string
): "success" | "warning" | "error" | "default" {
  switch (level) {
    case "low":
      return "success";
    case "medium":
      return "warning";
    case "high":
      return "error";
    default:
      return "default";
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ApprovalDetailPage(): ReactNode {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [approval, setApproval] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadApproval = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/approvals/${id}/detail`);
      const json = (await res.json()) as {
        success: boolean;
        data?: ApprovalDetail;
        error?: { message: string };
      };
      if (json.success && json.data !== undefined) {
        setApproval(json.data);
      } else {
        setError(json.error?.message ?? "Failed to load approval");
      }
    } catch {
      setError("Failed to load approval");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadApproval();
  }, [loadApproval]);

  async function handleDecision(
    decision: "approved" | "rejected" | "revision-requested"
  ): Promise<void> {
    if (decision !== "approved" && reason.trim().length === 0) {
      setError("A reason is required for rejection or revision requests");
      return;
    }

    const labels: Record<string, string> = {
      approved: "approve",
      rejected: "reject",
      "revision-requested": "request revision for",
    };

    const confirmed = confirm(
      `Are you sure you want to ${labels[decision]} this approval?`
    );
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/approvals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: reason.trim().length > 0 ? reason.trim() : undefined,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: { message: string };
      };
      if (json.success) {
        router.push("/admin/approvals");
      } else {
        setError(json.error?.message ?? "Decision failed");
      }
    } catch {
      setError("Decision failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error !== null && approval === null) {
    return (
      <div className="py-8 text-center text-status-error">{error}</div>
    );
  }

  if (approval === null) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Approval not found
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/admin/approvals"
        className="text-sm text-primary hover:underline"
      >
        &larr; Back to Approvals
      </Link>

      {/* Metadata Section */}
      <section>
        <Text variant="h2" as="h1" className="mb-4">
          Approval Detail
        </Text>
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex flex-wrap gap-6">
            <div>
              <Text variant="muted">Type</Text>
              <Badge variant="info" className="mt-1">
                {approval.type}
              </Badge>
            </div>
            <div>
              <Text variant="muted">Status</Text>
              <Badge
                variant={statusBadgeVariant(approval.status)}
                className="mt-1"
              >
                {approval.status}
              </Badge>
            </div>
            {approval.riskLevel !== null && (
              <div>
                <Text variant="muted">Risk Level</Text>
                <Badge
                  variant={riskBadgeVariant(approval.riskLevel)}
                  className="mt-1"
                >
                  {approval.riskLevel}
                </Badge>
              </div>
            )}
            <div>
              <Text variant="muted">Requested By</Text>
              <Text variant="body" className="mt-1">
                {approval.requestedBy}
              </Text>
            </div>
            <div>
              <Text variant="muted">Created</Text>
              <Text variant="body" className="mt-1">
                {formatDate(approval.createdAt)}
              </Text>
            </div>
            {approval.expiresAt !== null && (
              <div>
                <Text variant="muted">Expires</Text>
                <Text variant="body" className="mt-1">
                  {formatDate(approval.expiresAt)}
                </Text>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Pipeline Link */}
      <section>
        <Text variant="h3" as="h2" className="mb-4">
          Pipeline
        </Text>
        <div className="rounded-xl border border-border bg-surface p-6">
          <Link
            href={`/admin/pipelines/${approval.pipeline.id}`}
            className="inline-flex items-center gap-2 text-primary hover:underline"
          >
            <span className="font-medium">{approval.pipeline.epicKey}</span>
            <Badge variant={statusBadgeVariant(approval.pipeline.status)}>
              {approval.pipeline.status}
            </Badge>
          </Link>
        </div>
      </section>

      {/* Plan Details */}
      {(approval.planSummary !== null ||
        approval.affectedFiles.length > 0 ||
        approval.estimatedPoints !== null) && (
        <section>
          <Text variant="h3" as="h2" className="mb-4">
            Plan Details
          </Text>
          <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
            {approval.planSummary !== null && (
              <div>
                <Text variant="muted" className="mb-2">
                  Plan Summary
                </Text>
                <div className="rounded-md border border-border bg-surface-secondary p-4 text-sm text-foreground whitespace-pre-wrap">
                  {approval.planSummary}
                </div>
              </div>
            )}

            {approval.affectedFiles.length > 0 && (
              <div>
                <Text variant="muted" className="mb-2">
                  Affected Files
                </Text>
                <ul className="list-disc list-inside text-sm text-foreground space-y-1">
                  {approval.affectedFiles.map((file) => (
                    <li key={file} className="font-mono text-xs">
                      {file}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {approval.estimatedPoints !== null && (
              <div>
                <Text variant="muted">Estimated Points</Text>
                <Text variant="body" className="font-semibold">
                  {approval.estimatedPoints}
                </Text>
              </div>
            )}
          </div>
        </section>
      )}

      {error !== null && (
        <div
          role="alert"
          className="rounded-md border border-status-error/20 bg-status-error/10 px-4 py-3 text-sm text-status-error"
        >
          {error}
        </div>
      )}

      {/* Decision Panel (only for PENDING) */}
      {approval.status === "PENDING" && (
        <section>
          <Text variant="h3" as="h2" className="mb-4">
            Make Decision
          </Text>
          <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
            <div>
              <label
                htmlFor="decision-reason"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Reason (required for reject / revision)
              </label>
              <Textarea
                id="decision-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Provide rationale for your decision..."
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={() => handleDecision("approved")}
                loading={submitting}
                disabled={submitting}
              >
                Approve
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDecision("rejected")}
                loading={submitting}
                disabled={submitting}
              >
                Reject
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleDecision("revision-requested")}
                loading={submitting}
                disabled={submitting}
              >
                Request Revision
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Decision History (if decided) */}
      {approval.decidedAt !== null && (
        <section>
          <Text variant="h3" as="h2" className="mb-4">
            Decision History
          </Text>
          <div className="rounded-xl border border-border bg-surface p-6 space-y-2">
            <div className="flex flex-wrap gap-6">
              <div>
                <Text variant="muted">Decided By</Text>
                <Text variant="body" className="mt-1">
                  {approval.decidedById ?? approval.decidedByLegacy ?? "Unknown"}
                </Text>
              </div>
              <div>
                <Text variant="muted">Decided At</Text>
                <Text variant="body" className="mt-1">
                  {formatDate(approval.decidedAt)}
                </Text>
              </div>
            </div>
            {approval.reason !== null && (
              <div>
                <Text variant="muted" className="mt-2">
                  Reason
                </Text>
                <div className="mt-1 rounded-md border border-border bg-surface-secondary p-4 text-sm text-foreground whitespace-pre-wrap">
                  {approval.reason}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
