"use client";

import { useState, useCallback, type ReactNode } from "react";
import type { Approval } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  /** The approval record to display */
  approval: Approval;
  /** Identity of the current reviewer (passed from server component) */
  reviewerIdentity: string;
  /** Callback when approval action is completed */
  onActionComplete?: () => void;
}

type ActionType = "approve" | "reject" | "revision";

// ─── Risk Badge ───────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string | null }): ReactNode {
  const config = {
    low: { bg: "bg-risk-low/10", text: "text-risk-low", label: "Low Risk" },
    medium: { bg: "bg-risk-medium/10", text: "text-risk-medium", label: "Medium Risk" },
    high: { bg: "bg-risk-high/10", text: "text-risk-high", label: "High Risk" },
  } as const;

  const normalizedLevel = (level ?? "low") as keyof typeof config;
  const { bg, text, label } = config[normalizedLevel in config ? normalizedLevel : "low"];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${bg} ${text}`}
      role="status"
    >
      <span className="sr-only">Risk level:</span>
      {label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ApprovalCard({
  approval,
  reviewerIdentity,
  onActionComplete,
}: ApprovalCardProps): ReactNode {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = useCallback(
    async (action: ActionType) => {
      setIsSubmitting(true);
      setError(null);

      try {
        const response = await fetch(`/api/approvals/${approval.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision:
              action === "approve"
                ? "approved"
                : action === "reject"
                  ? "rejected"
                  : "revision-requested",
            reviewerIdentity,
            comment: comment || undefined,
          }),
        });

        if (!response.ok) {
          const data = await response.json() as { error?: { message?: string } };
          throw new Error(data.error?.message ?? "Action failed");
        }

        onActionComplete?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsSubmitting(false);
      }
    },
    [approval.id, comment, reviewerIdentity, onActionComplete]
  );

  // Format expiration time
  const expiresAt = approval.expiresAt
    ? new Date(approval.expiresAt).toLocaleString()
    : "No expiration";

  const isExpiringSoon =
    approval.expiresAt &&
    new Date(approval.expiresAt).getTime() - Date.now() < 4 * 60 * 60 * 1000; // 4 hours

  return (
    <article
      className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm"
      aria-labelledby={`approval-title-${approval.id}`}
    >
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id={`approval-title-${approval.id}`}
            className="text-lg font-semibold text-text-primary"
          >
            {approval.pipelineId}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RiskBadge level={approval.riskLevel} />
            {approval.estimatedPoints !== null && (
              <span className="text-sm text-text-secondary">
                {approval.estimatedPoints} points
              </span>
            )}
          </div>
        </div>
        <time
          dateTime={approval.expiresAt?.toISOString?.() ?? ""}
          className={`text-sm ${isExpiringSoon ? "font-medium text-risk-high" : "text-text-muted"}`}
        >
          {isExpiringSoon && (
            <span className="mr-1" aria-label="Warning: expiring soon">
              ⏰
            </span>
          )}
          Expires: {expiresAt}
        </time>
      </header>

      {/* Plan Summary */}
      <section className="mb-4" aria-label="Plan Summary">
        <h3 className="mb-2 text-sm font-medium text-text-primary">
          Plan Summary
        </h3>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-4 text-sm text-text-secondary">
          {approval.planSummary ?? "No summary available"}
        </pre>
      </section>

      {/* Affected Files */}
      {approval.affectedFiles.length > 0 && (
        <section className="mb-4" aria-label="Affected Files">
          <h3 className="mb-2 text-sm font-medium text-text-primary">
            Affected Files ({approval.affectedFiles.length})
          </h3>
          <ul className="max-h-40 space-y-1 overflow-auto text-sm text-text-secondary">
            {approval.affectedFiles.slice(0, 15).map((file) => (
              <li key={file} className="font-mono">
                {file}
              </li>
            ))}
            {approval.affectedFiles.length > 15 && (
              <li className="text-text-muted">
                ... and {approval.affectedFiles.length - 15} more
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Comment Input */}
      <section className="mb-4" aria-label="Comment">
        <label
          htmlFor={`comment-${approval.id}`}
          className="mb-2 block text-sm font-medium text-text-primary"
        >
          Comment (optional)
        </label>
        <textarea
          id={`comment-${approval.id}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-status-idle focus:ring-offset-2"
          placeholder="Add feedback or reason for your decision..."
          rows={3}
          disabled={isSubmitting}
          aria-describedby={error ? `error-${approval.id}` : undefined}
        />
      </section>

      {/* Error Display */}
      {error && (
        <div
          id={`error-${approval.id}`}
          role="alert"
          className="mb-4 rounded-md bg-risk-high/10 p-3 text-sm text-risk-high"
        >
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <footer className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleAction("approve")}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-status-idle px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-status-idle/90 focus:outline-none focus:ring-2 focus:ring-status-idle focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-busy={isSubmitting}
        >
          <span aria-hidden="true">✓</span>
          Approve
        </button>
        <button
          type="button"
          onClick={() => handleAction("revision")}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-status-busy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-status-busy/90 focus:outline-none focus:ring-2 focus:ring-status-busy focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-busy={isSubmitting}
        >
          <span aria-hidden="true">📝</span>
          Request Revision
        </button>
        <button
          type="button"
          onClick={() => handleAction("reject")}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-status-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-status-error/90 focus:outline-none focus:ring-2 focus:ring-status-error focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-busy={isSubmitting}
        >
          <span aria-hidden="true">✗</span>
          Reject
        </button>
      </footer>
    </article>
  );
}
