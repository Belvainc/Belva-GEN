import type { OrchestratorEngine } from "../orchestrator/engine";
import type { EpicContext } from "../orchestrator/types";
import type { EpicState } from "@/types/events";
import { NotFoundError } from "@/lib/errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineServiceDeps {
  engine: OrchestratorEngine;
}

export interface EpicSummary {
  ticketRef: string;
  state: EpicState;
  progress: {
    totalTasks: number;
    completedTasks: number;
    activeTasks: number;
  };
  createdAt: string;
  updatedAt: string;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Get summaries of all epics in the system.
 */
export function getAllEpics(
  deps: PipelineServiceDeps
): EpicSummary[] {
  const contexts = deps.engine.getAllEpics();
  return contexts.map(contextToSummary);
}

/**
 * Get summaries of epics filtered by state.
 */
export function getEpicsByState(
  deps: PipelineServiceDeps,
  state: EpicState
): EpicSummary[] {
  const contexts = deps.engine.getEpicsByState(state);
  return contexts.map(contextToSummary);
}

/**
 * Get full details of a specific epic.
 */
export function getEpicDetails(
  deps: PipelineServiceDeps,
  ticketRef: string
): EpicContext {
  const context = deps.engine.getEpic(ticketRef);
  if (context === undefined) {
    throw new NotFoundError(`Epic ${ticketRef} not found`, "epic", ticketRef);
  }
  return context;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function contextToSummary(context: EpicContext): EpicSummary {
  const totalTasks = context.taskGraph?.nodes.length ?? 0;
  const completedTasks = context.completedTaskIds.length;
  const activeTasks = context.activeTasks.length;

  return {
    ticketRef: context.ticketRef,
    state: context.currentState,
    progress: { totalTasks, completedTasks, activeTasks },
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
  };
}
