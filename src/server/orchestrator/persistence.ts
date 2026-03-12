import { prisma } from "@/server/db/client";
import { Prisma } from "@prisma/client";
import type {
  EpicContext,
  DecompositionResult,
  TaskGraph,
  EpicState,
} from "./types";
import {
  EpicContextSchema,
  DecompositionResultSchema,
  TaskGraphSchema,
} from "./types";
import { createChildLogger } from "@/server/config/logger";
import type { PipelineStatus } from "@prisma/client";

const logger = createChildLogger({ module: "persistence" });

// ─── State Mapping ────────────────────────────────────────────────────────────

const STATE_TO_STATUS: Record<EpicState, PipelineStatus> = {
  funnel: "FUNNEL",
  refinement: "REFINEMENT",
  approved: "APPROVED",
  "in-progress": "IN_PROGRESS",
  review: "REVIEW",
  done: "DONE",
};

const STATUS_TO_STATE: Record<PipelineStatus, EpicState> = {
  FUNNEL: "funnel",
  REFINEMENT: "refinement",
  APPROVED: "approved",
  IN_PROGRESS: "in-progress",
  REVIEW: "review",
  DONE: "done",
};

// ─── Pipeline Operations ──────────────────────────────────────────────────────

/**
 * Save or update an epic's context to the database.
 * Creates the pipeline if it doesn't exist.
 */
export async function saveEpicContext(
  ticketRef: string,
  context: EpicContext
): Promise<void> {
  // Validate context before saving
  EpicContextSchema.parse(context);

  const status = STATE_TO_STATUS[context.currentState];

  await prisma.pipeline.upsert({
    where: { epicKey: ticketRef },
    update: {
      status,
      revisionCount: context.revisionCount,
      metadata: {
        assignedAgents: context.assignedAgents,
        activeTasks: context.activeTasks,
        completedTaskIds: context.completedTaskIds,
        taskResults: context.taskResults,
      },
      updatedAt: new Date(),
    },
    create: {
      epicKey: ticketRef,
      status,
      revisionCount: context.revisionCount,
      metadata: {
        assignedAgents: context.assignedAgents,
        activeTasks: context.activeTasks,
        completedTaskIds: context.completedTaskIds,
        taskResults: context.taskResults,
      },
    },
  });

  logger.debug({ ticketRef, state: context.currentState }, "Epic context saved");
}

/**
 * Load an epic's context from the database.
 * Returns null if the epic doesn't exist.
 */
export async function loadEpicContext(
  ticketRef: string
): Promise<EpicContext | null> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { epicKey: ticketRef },
    include: { decomposition: true },
  });

  if (pipeline === null) {
    return null;
  }

  const metadata = pipeline.metadata as Record<string, unknown> | null;

  const context: EpicContext = {
    ticketRef: pipeline.epicKey,
    currentState: STATUS_TO_STATE[pipeline.status],
    assignedAgents: (metadata?.assignedAgents as string[]) ?? [],
    revisionCount: pipeline.revisionCount,
    createdAt: pipeline.createdAt.toISOString(),
    updatedAt: pipeline.updatedAt.toISOString(),
    activeTasks: (metadata?.activeTasks as EpicContext["activeTasks"]) ?? [],
    completedTaskIds: (metadata?.completedTaskIds as string[]) ?? [],
    taskResults: (metadata?.taskResults as EpicContext["taskResults"]) ?? [],
  };

  // Load decomposition if present
  if (pipeline.decomposition !== null) {
    const decomp = pipeline.decomposition;
    context.taskGraph = TaskGraphSchema.parse(decomp.taskGraph);
    context.decomposition = {
      graph: context.taskGraph,
      totalEstimatedPoints: decomp.totalPoints,
      riskAreas: decomp.riskAreas,
      affectedFiles: decomp.affectedFiles,
    };
  }

  // Validate loaded context
  return EpicContextSchema.parse(context);
}

/**
 * Update only the state of an epic.
 * More efficient than saving the full context.
 */
export async function updateEpicState(
  ticketRef: string,
  state: EpicState
): Promise<void> {
  const status = STATE_TO_STATUS[state];

  await prisma.pipeline.update({
    where: { epicKey: ticketRef },
    data: { status, updatedAt: new Date() },
  });

  logger.debug({ ticketRef, state }, "Epic state updated");
}

// ─── Task Decomposition Operations ────────────────────────────────────────────

/**
 * Save a task decomposition for an epic.
 * Creates or updates the decomposition record.
 */
export async function saveDecomposition(
  ticketRef: string,
  decomposition: DecompositionResult
): Promise<void> {
  // Validate decomposition before saving
  DecompositionResultSchema.parse(decomposition);

  // Ensure pipeline exists
  const pipeline = await prisma.pipeline.findUnique({
    where: { epicKey: ticketRef },
    select: { id: true },
  });

  if (pipeline === null) {
    throw new Error(`Pipeline not found for ticket: ${ticketRef}`);
  }

  await prisma.taskDecomposition.upsert({
    where: { pipelineId: pipeline.id },
    update: {
      taskGraph: decomposition.graph,
      totalPoints: decomposition.totalEstimatedPoints,
      riskAreas: decomposition.riskAreas,
      affectedFiles: decomposition.affectedFiles,
      updatedAt: new Date(),
    },
    create: {
      pipelineId: pipeline.id,
      taskGraph: decomposition.graph,
      totalPoints: decomposition.totalEstimatedPoints,
      riskAreas: decomposition.riskAreas,
      affectedFiles: decomposition.affectedFiles,
    },
  });

  logger.info(
    {
      ticketRef,
      taskCount: decomposition.graph.nodes.length,
      totalPoints: decomposition.totalEstimatedPoints,
    },
    "Task decomposition saved"
  );
}

/**
 * Load a task decomposition for an epic.
 */
export async function loadDecomposition(
  ticketRef: string
): Promise<DecompositionResult | null> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { epicKey: ticketRef },
    include: { decomposition: true },
  });

  if (pipeline?.decomposition === null || pipeline?.decomposition === undefined) {
    return null;
  }

  const decomp = pipeline.decomposition;
  const graph = TaskGraphSchema.parse(decomp.taskGraph);

  return {
    graph,
    totalEstimatedPoints: decomp.totalPoints,
    riskAreas: decomp.riskAreas,
    affectedFiles: decomp.affectedFiles,
  };
}

// ─── Audit Logging ────────────────────────────────────────────────────────────

/**
 * Record an audit log entry for epic state changes.
 */
export async function auditLog(
  action: string,
  ticketRef: string,
  payload?: Record<string, unknown>,
  agentId?: string
): Promise<void> {
  // Get pipeline ID
  const pipeline = await prisma.pipeline.findUnique({
    where: { epicKey: ticketRef },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      action,
      entityType: "pipeline",
      entityId: pipeline?.id ?? ticketRef,
      agentId,
      payload: payload as Prisma.InputJsonValue | undefined,
    },
  });

  logger.debug({ action, ticketRef, agentId }, "Audit log recorded");
}

// ─── Batch Operations ─────────────────────────────────────────────────────────

/**
 * Load all active epics (not in done state).
 */
export async function loadActiveEpics(): Promise<EpicContext[]> {
  const pipelines = await prisma.pipeline.findMany({
    where: {
      status: { not: "DONE" },
    },
    include: { decomposition: true },
  });

  const contexts: EpicContext[] = [];

  for (const pipeline of pipelines) {
    const context = await loadEpicContext(pipeline.epicKey);
    if (context !== null) {
      contexts.push(context);
    }
  }

  return contexts;
}
