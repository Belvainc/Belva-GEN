import type { JiraTicket } from "@/server/mcp/jira/types";
import type { JiraMCPClient } from "@/server/mcp/jira/client";
import type { AgentExecutor, ExecutionResult } from "@/server/agents/execution/types";
import type { TaskGraph } from "./task-graph";
import type { MergeSequence } from "./merge-sequencer";
import type { EpicStory } from "./decomposer";
import { decomposeEpic } from "./decomposer";
import { persistDecomposition } from "@/server/services/progress.service";
import { executeTaskGraph, ParallelExecutionConfigSchema } from "./parallel-executor";
import { calculateMergeSequence, createMergePRs } from "./merge-sequencer";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "epic-pipeline" });

// ─── Phase 1 Result (pre-approval) ─────────────────────────────────────────

export interface EpicDecompositionResult {
  stories: EpicStory[];
  taskGraph: TaskGraph;
}

// ─── Phase 2 Result (post-approval) ────────────────────────────────────────

export interface EpicExecutionResult {
  completed: Map<string, ExecutionResult>;
  failed: Map<string, string>;
  blocked: Set<string>;
  allSuccessful: boolean;
  mergeSequence: MergeSequence;
  prs: Map<string, { prNumber: number; prUrl: string }>;
}

// ─── Phase 1: Decompose ────────────────────────────────────────────────────

/**
 * Decompose an epic ticket into stories and a unified task graph.
 * Each story is a logical grouping of tasks; the task graph flattens
 * all tasks with cross-story dependency tracking.
 *
 * Sub-ticket creation in Jira is deferred — requires `JiraMCPClient.createTicket()`.
 */
export async function decomposeEpicTicket(
  ticket: JiraTicket,
  pipelineId: string,
  projectStructure: string,
  jiraClient?: JiraMCPClient,
  signal?: AbortSignal
): Promise<EpicDecompositionResult> {
  // 1. LLM decomposition into stories + unified task graph
  const { stories, taskGraph } = await decomposeEpic(
    ticket,
    projectStructure,
    signal
  );

  // 2. Persist decomposition to database
  await persistDecomposition(pipelineId, taskGraph);

  logger.info(
    {
      ticketRef: ticket.key,
      storyCount: stories.length,
      taskCount: taskGraph.nodes.length,
      totalPoints: taskGraph.totalEstimatedPoints,
    },
    "Epic decomposed into stories and task graph"
  );

  // 3. Create Jira sub-tickets for each story
  if (jiraClient !== undefined) {
    for (const story of stories) {
      try {
        const subTicket = await jiraClient.createTicket(
          {
            summary: story.title,
            description: story.description,
            issueType: "Story",
            parentKey: ticket.key,
            labels: ["GEN"],
            storyPoints: story.storyPoints,
          },
          signal
        );
        logger.info(
          {
            epicRef: ticket.key,
            storyId: story.id,
            subTicketKey: subTicket.key,
            storyPoints: story.storyPoints,
          },
          "Jira sub-ticket created for epic story"
        );
      } catch (error) {
        logger.error(
          { epicRef: ticket.key, storyId: story.id, error: String(error) },
          "Failed to create Jira sub-ticket for story"
        );
      }
    }
  } else {
    logger.warn(
      { ticketRef: ticket.key, storyCount: stories.length },
      "Jira client not provided — skipping sub-ticket creation"
    );
  }

  return { stories, taskGraph };
}

// ─── Phase 2: Execute ──────────────────────────────────────────────────────

/**
 * Execute an epic pipeline after human approval.
 * Runs parallel agent execution across all story tasks,
 * then creates PRs in dependency-aware merge order.
 */
export async function executeEpicPipeline(
  taskGraph: TaskGraph,
  executor: AgentExecutor,
  onProgress?: (completed: number, total: number, failed: number) => void,
  signal?: AbortSignal
): Promise<EpicExecutionResult> {
  // 1. Parallel execution with concurrency limits
  const config = ParallelExecutionConfigSchema.parse({});
  const execResult = await executeTaskGraph(
    taskGraph,
    executor,
    config,
    onProgress,
    signal
  );

  logger.info(
    {
      ticketRef: taskGraph.ticketRef,
      completed: execResult.completed.size,
      failed: execResult.failed.size,
      blocked: execResult.blocked.size,
    },
    "Epic task execution complete"
  );

  // 2. Calculate merge sequence
  const mergeSequence = calculateMergeSequence(
    taskGraph,
    execResult.completed
  );

  if (mergeSequence.conflicts.length > 0) {
    logger.warn(
      {
        ticketRef: taskGraph.ticketRef,
        conflicts: mergeSequence.conflicts.length,
      },
      "File conflicts detected in epic merge sequence"
    );
  }

  // 3. Create PRs in merge order
  const prs = await createMergePRs(
    taskGraph,
    mergeSequence,
    execResult.completed,
    signal
  );

  logger.info(
    { ticketRef: taskGraph.ticketRef, prCount: prs.size },
    "Epic PRs created"
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
