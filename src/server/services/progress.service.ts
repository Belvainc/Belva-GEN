import { z } from "zod";
import type { TaskGraph } from "@/server/orchestrator/task-graph";
import { TaskGraphSchema } from "@/server/orchestrator/task-graph";
import { prisma } from "@/server/db/client";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "progress-service" });

// ─── Pipeline Progress ──────────────────────────────────────────────────────

export const PipelineProgressSchema = z.object({
  pipelineId: z.string().uuid(),
  ticketRef: z.string().min(1),
  stage: z.string(),
  totalTasks: z.number().int().min(0),
  completedTasks: z.number().int().min(0),
  activeTasks: z.number().int().min(0),
  failedTasks: z.number().int().min(0),
  blockedTasks: z.number().int().min(0),
  totalPoints: z.number().int().min(0),
  completedPoints: z.number().int().min(0),
  lastUpdated: z.string().datetime(),
});
export type PipelineProgress = z.infer<typeof PipelineProgressSchema>;

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Persist a task graph decomposition to the database.
 * Uses upsert so it's safe to call multiple times.
 */
export async function persistDecomposition(
  pipelineId: string,
  graph: TaskGraph
): Promise<void> {
  await prisma.taskDecomposition.upsert({
    where: { pipelineId },
    create: {
      pipelineId,
      taskGraph: JSON.parse(JSON.stringify(graph)),
      totalPoints: graph.totalEstimatedPoints,
      riskAreas: graph.riskAreas,
      affectedFiles: graph.nodes.flatMap((n) => n.affectedFiles),
    },
    update: {
      taskGraph: JSON.parse(JSON.stringify(graph)),
      totalPoints: graph.totalEstimatedPoints,
      riskAreas: graph.riskAreas,
      affectedFiles: graph.nodes.flatMap((n) => n.affectedFiles),
    },
  });

  logger.info(
    { pipelineId, taskCount: graph.nodes.length },
    "Task decomposition persisted"
  );
}

/**
 * Load a task graph from the database and validate with Zod.
 */
export async function loadDecomposition(
  pipelineId: string
): Promise<TaskGraph | null> {
  const record = await prisma.taskDecomposition.findUnique({
    where: { pipelineId },
  });

  if (!record) return null;

  return TaskGraphSchema.parse(record.taskGraph);
}

// ─── Progress Calculation ───────────────────────────────────────────────────

/**
 * Calculate pipeline progress from task execution state.
 */
export async function calculateProgress(
  pipelineId: string,
  completedNodeIds: Set<string>,
  activeNodeIds: Set<string>,
  failedNodeIds: Set<string>,
  blockedNodeIds: Set<string>
): Promise<PipelineProgress> {
  const pipeline = await prisma.pipeline.findUniqueOrThrow({
    where: { id: pipelineId },
    include: { decomposition: true },
  });

  const graph = pipeline.decomposition
    ? TaskGraphSchema.parse(pipeline.decomposition.taskGraph)
    : null;

  const completedPoints = graph
    ? graph.nodes
        .filter((n) => completedNodeIds.has(n.id))
        .reduce((sum, n) => sum + n.estimatedPoints, 0)
    : 0;

  return {
    pipelineId,
    ticketRef: pipeline.epicKey,
    stage: pipeline.status,
    totalTasks: graph?.nodes.length ?? 0,
    completedTasks: completedNodeIds.size,
    activeTasks: activeNodeIds.size,
    failedTasks: failedNodeIds.size,
    blockedTasks: blockedNodeIds.size,
    totalPoints: graph?.totalEstimatedPoints ?? 0,
    completedPoints,
    lastUpdated: new Date().toISOString(),
  };
}
