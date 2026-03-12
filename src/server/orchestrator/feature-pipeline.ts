import type { JiraTicket } from "@/server/mcp/jira/types";
import type { AgentExecutor, ExecutionResult } from "@/server/agents/execution/types";
import type { TaskGraph } from "./task-graph";
import type { BDDVerificationResult } from "@/server/services/bdd-verification";
import type { MergeSequence } from "./merge-sequencer";
import { verifyBDDRequirements } from "@/server/services/bdd-verification";
import { decomposeFeature } from "./decomposer";
import { persistDecomposition } from "@/server/services/progress.service";
import { executeTaskGraph, ParallelExecutionConfigSchema } from "./parallel-executor";
import { calculateMergeSequence, createMergePRs } from "./merge-sequencer";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "feature-pipeline" });

// ─── Phase 1 Result (pre-approval) ─────────────────────────────────────────

export interface FeatureDecompositionResult {
  graph: TaskGraph;
  bddResult: BDDVerificationResult;
  projectStructure: string;
}

// ─── Phase 2 Result (post-approval) ────────────────────────────────────────

export interface FeatureExecutionResult {
  completed: Map<string, ExecutionResult>;
  failed: Map<string, string>;
  blocked: Set<string>;
  allSuccessful: boolean;
  mergeSequence: MergeSequence;
  prs: Map<string, { prNumber: number; prUrl: string }>;
}

// ─── Phase 1: Decompose ────────────────────────────────────────────────────

/**
 * Decompose a feature ticket into a task graph.
 * Validates BDD scenarios, runs LLM decomposition, and persists the result.
 * Returns the graph for human approval.
 */
export async function decomposeFeatureTicket(
  ticket: JiraTicket,
  pipelineId: string,
  projectStructure: string,
  signal?: AbortSignal
): Promise<FeatureDecompositionResult> {
  // 1. Verify BDD requirements
  const bddResult = verifyBDDRequirements(ticket.acceptanceCriteria);

  if (!bddResult.passed) {
    logger.warn(
      { ticketRef: ticket.key, violations: bddResult.violations },
      "BDD verification failed for feature ticket"
    );
    // Return even on failure — the engine decides how to handle violations
  }

  // 2. LLM decomposition
  const graph = await decomposeFeature(
    { ticket, scenarios: bddResult.scenarios, projectStructure },
    signal
  );

  // 3. Persist decomposition to database
  await persistDecomposition(pipelineId, graph);

  logger.info(
    {
      ticketRef: ticket.key,
      taskCount: graph.nodes.length,
      totalPoints: graph.totalEstimatedPoints,
      bddPassed: bddResult.passed,
    },
    "Feature ticket decomposed"
  );

  return { graph, bddResult, projectStructure };
}

// ─── Phase 2: Execute ──────────────────────────────────────────────────────

/**
 * Execute a feature pipeline after human approval.
 * Runs parallel agent execution, then creates PRs in merge order.
 */
export async function executeFeaturePipeline(
  graph: TaskGraph,
  executor: AgentExecutor,
  onProgress?: (completed: number, total: number, failed: number) => void,
  signal?: AbortSignal
): Promise<FeatureExecutionResult> {
  // 1. Parallel execution
  const config = ParallelExecutionConfigSchema.parse({});
  const execResult = await executeTaskGraph(
    graph,
    executor,
    config,
    onProgress,
    signal
  );

  logger.info(
    {
      ticketRef: graph.ticketRef,
      completed: execResult.completed.size,
      failed: execResult.failed.size,
      blocked: execResult.blocked.size,
    },
    "Feature task execution complete"
  );

  // 2. Calculate merge sequence from completed tasks
  const mergeSequence = calculateMergeSequence(graph, execResult.completed);

  if (mergeSequence.conflicts.length > 0) {
    logger.warn(
      {
        ticketRef: graph.ticketRef,
        conflicts: mergeSequence.conflicts.length,
      },
      "File conflicts detected in merge sequence"
    );
  }

  // 3. Create PRs in merge order
  const prs = await createMergePRs(
    graph,
    mergeSequence,
    execResult.completed,
    signal
  );

  logger.info(
    { ticketRef: graph.ticketRef, prCount: prs.size },
    "Feature PRs created"
  );

  return {
    completed: execResult.completed,
    failed: execResult.failed,
    blocked: execResult.blocked,
    allSuccessful: execResult.allSuccessful,
    mergeSequence,
    prs,
  };
}
