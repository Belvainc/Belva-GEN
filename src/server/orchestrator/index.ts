import { OrchestratorEngine } from "./engine";

export { OrchestratorEngine } from "./engine";
export type { OrchestratorDependencies } from "./engine";
export { validateTransition, getValidNextStates, getTransitionsFrom } from "./state-machine";
export { decomposeTicket, getTopologicalOrder } from "./decompose";
export {
  saveEpicContext,
  loadEpicContext,
  saveDecomposition,
  loadDecomposition,
  auditLog,
  loadActiveEpics,
} from "./persistence";
export type {
  EpicContext,
  OrchestratorConfig,
  Transition,
  TaskNode,
  TaskGraph,
  DecompositionResult,
  ActiveTask,
  TaskResult,
} from "./types";
export {
  EpicContextSchema,
  TaskGraphSchema,
  DecompositionResultSchema,
  getRootTaskIds,
  getTaskNode,
} from "./types";
export {
  generatePlanSummary,
  calculateRiskLevel,
  renderDependencyGraph,
  calculateAgentAssignments,
} from "./plan-summary";
export type { PlanSummary, AgentAssignment } from "./plan-summary";

// ─── Singleton ────────────────────────────────────────────────────────────────
// Lazy singleton for the orchestrator engine.
// Tech debt: Will be consolidated into ServerContext per service-layer.md in Plan 05.

let instance: OrchestratorEngine | undefined;

/**
 * Get the singleton OrchestratorEngine instance.
 * Lazily initializes on first call.
 */
export function getOrchestratorEngine(): OrchestratorEngine {
  if (instance === undefined) {
    instance = new OrchestratorEngine({
      approvalTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
      maxRevisionCycles: 3,
      enableSlackNotifications: true,
    });
  }
  return instance;
}

/**
 * Reset the singleton. Used in tests.
 */
export function resetOrchestratorEngine(): void {
  instance = undefined;
}
