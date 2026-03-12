import type { OrchestratorEngine } from "../orchestrator/engine";
import { prisma } from "../db/client";
import type { Approval } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApprovalServiceDeps {
  engine: OrchestratorEngine;
}

export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Get pending approvals with cursor-based pagination.
 */
export async function getPendingApprovals(
  _deps: ApprovalServiceDeps,
  params: PaginationParams
): Promise<PaginatedResult<Approval>> {
  const items = await prisma.approval.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: params.limit + 1,
    cursor: params.cursor !== undefined ? { id: params.cursor } : undefined,
    skip: params.cursor !== undefined ? 1 : 0,
  });

  const hasMore = items.length > params.limit;
  const data = hasMore ? items.slice(0, -1) : items;
  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem !== undefined ? lastItem.id : null;

  return { data, nextCursor };
}

/**
 * Get a single approval by ID.
 */
export async function getApproval(
  _deps: ApprovalServiceDeps,
  approvalId: string
): Promise<Approval> {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
  });
  if (approval === null) {
    throw new NotFoundError("Approval not found", "approval", approvalId);
  }
  return approval;
}

/**
 * Approve a pending request.
 * Emits plan-approved event to orchestrator.
 */
export async function approveRequest(
  deps: ApprovalServiceDeps,
  approvalId: string,
  userId: string,
  planHash: string,
  comment?: string
): Promise<Approval> {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
  });
  if (approval === null) {
    throw new NotFoundError("Approval not found", "approval", approvalId);
  }

  const updated = await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: "APPROVED",
      decidedById: userId,
      decidedAt: new Date(),
      reason: comment,
    },
  });

  // Emit event to orchestrator (matches PlanApprovedEventSchema)
  await deps.engine.handleEvent({
    kind: "plan-approved",
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef: approval.pipelineId,
    approverIdentity: userId,
    planHash,
  });

  return updated;
}

/**
 * Reject a pending request.
 * Emits plan-rejected event to orchestrator.
 */
export async function rejectRequest(
  deps: ApprovalServiceDeps,
  approvalId: string,
  userId: string,
  reason: string
): Promise<Approval> {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
  });
  if (approval === null) {
    throw new NotFoundError("Approval not found", "approval", approvalId);
  }

  const updated = await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: "REJECTED",
      decidedById: userId,
      decidedAt: new Date(),
      reason,
    },
  });

  // Emit event to orchestrator (matches PlanRejectedEventSchema)
  await deps.engine.handleEvent({
    kind: "plan-rejected",
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef: approval.pipelineId,
    reviewerIdentity: userId,
    reason,
  });

  return updated;
}

/**
 * Request revision of a pending plan.
 * Emits plan-revision-requested event to orchestrator.
 */
export async function requestRevision(
  deps: ApprovalServiceDeps,
  approvalId: string,
  userId: string,
  feedback: string
): Promise<Approval> {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { pipeline: true },
  });
  if (approval === null) {
    throw new NotFoundError("Approval not found", "approval", approvalId);
  }

  const revisionCount = (approval.pipeline?.revisionCount ?? 0) + 1;

  // Emit event to orchestrator (matches PlanRevisionRequestedEventSchema)
  await deps.engine.handleEvent({
    kind: "plan-revision-requested",
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef: approval.pipelineId,
    reviewerIdentity: userId,
    feedback,
    revisionCount,
  });

  return approval;
}
