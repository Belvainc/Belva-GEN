import type { TaskGraph, TaskNode } from "./task-graph";
import { findReadyNodes, resolveAgentForTask, findDependentNodes } from "./task-graph";
import type {
  AgentExecutor,
  ExecutionRequest,
  ExecutionResult,
} from "@/server/agents/execution/types";
import { composeSystemPrompt } from "@/server/agents/execution/prompt-composer";
import { z } from "zod";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "parallel-executor" });

// ─── Config ─────────────────────────────────────────────────────────────────

export const ParallelExecutionConfigSchema = z.object({
  maxConcurrentTasks: z.number().int().positive().default(3),
  taskTimeoutMs: z.number().int().positive().default(600_000),
});
export type ParallelExecutionConfig = z.infer<
  typeof ParallelExecutionConfigSchema
>;

// ─── Result ─────────────────────────────────────────────────────────────────

export interface ParallelExecutionResult {
  completed: Map<string, ExecutionResult>;
  failed: Map<string, string>;
  blocked: Set<string>;
  allSuccessful: boolean;
}

// ─── Executor ───────────────────────────────────────────────────────────────

/**
 * Execute a task graph with parallel agent execution.
 * Respects dependency ordering and concurrency limits.
 * Failed tasks cause dependent tasks to be blocked.
 */
export async function executeTaskGraph(
  graph: TaskGraph,
  executor: AgentExecutor,
  config: ParallelExecutionConfig = ParallelExecutionConfigSchema.parse(
    {}
  ),
  onProgress?: (
    completed: number,
    total: number,
    failed: number
  ) => void,
  signal?: AbortSignal
): Promise<ParallelExecutionResult> {
  const completed = new Map<string, ExecutionResult>();
  const failed = new Map<string, string>();
  const blocked = new Set<string>();
  const active = new Map<
    string,
    Promise<{ nodeId: string; result: ExecutionResult }>
  >();
  const completedIds = new Set<string>();
  const failedIds = new Set<string>();

  const totalNodes = graph.nodes.length;

  while (
    completedIds.size + failedIds.size + blocked.size <
    totalNodes
  ) {
    signal?.throwIfAborted();

    // Find tasks ready to execute
    const ready = findReadyNodes(graph, completedIds, failedIds);
    const slotsAvailable =
      config.maxConcurrentTasks - active.size;
    const toStart = ready
      .filter((n) => !active.has(n.id))
      .slice(0, slotsAvailable);

    // Start new tasks
    for (const node of toStart) {
      const promise = executeNode(
        node,
        graph,
        executor,
        config.taskTimeoutMs,
        signal
      );
      active.set(node.id, promise);
    }

    // If nothing active and nothing to start, remaining are blocked
    if (active.size === 0 && toStart.length === 0) {
      for (const node of graph.nodes) {
        if (
          !completedIds.has(node.id) &&
          !failedIds.has(node.id) &&
          !blocked.has(node.id)
        ) {
          blocked.add(node.id);
        }
      }
      break;
    }

    // Wait for any task to complete
    if (active.size > 0) {
      const entries = [...active.entries()];
      const settled = await Promise.race(
        entries.map(async ([id, p]) => {
          try {
            const result = await p;
            return {
              id,
              result: result.result,
              error: null as string | null,
            };
          } catch (error) {
            return {
              id,
              result: null as ExecutionResult | null,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown error",
            };
          }
        })
      );

      active.delete(settled.id);

      if (
        settled.result &&
        settled.result.status === "completed"
      ) {
        completedIds.add(settled.id);
        completed.set(settled.id, settled.result);
      } else {
        failedIds.add(settled.id);
        failed.set(
          settled.id,
          settled.error ??
            settled.result?.error ??
            "Task failed"
        );
        // Mark transitive dependents as blocked
        const dependents = findDependentNodes(
          settled.id,
          graph
        );
        for (const dep of dependents) {
          blocked.add(dep);
        }
      }

      onProgress?.(completedIds.size, totalNodes, failedIds.size);
    }
  }

  return {
    completed,
    failed,
    blocked,
    allSuccessful: failedIds.size === 0 && blocked.size === 0,
  };
}

// ─── Single Node Execution ──────────────────────────────────────────────────

async function executeNode(
  node: TaskNode,
  graph: TaskGraph,
  executor: AgentExecutor,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ nodeId: string; result: ExecutionResult }> {
  const agentId = resolveAgentForTask(node);
  const systemPrompt = await composeSystemPrompt(
    agentId,
    node.affectedFiles
  );

  const request: ExecutionRequest = {
    taskId: crypto.randomUUID(),
    agentId,
    taskType: node.taskType,
    ticketRef: graph.ticketRef,
    description: `${node.title}\n\n${node.description}`,
    constraints: [
      `Only modify files within: ${node.affectedFiles.join(", ")}`,
      `This task is part of a larger feature: ${graph.ticketRef}`,
    ],
    acceptanceCriteria: [
      `Task "${node.title}" is fully implemented`,
    ],
    domainPaths: node.affectedFiles,
    systemPrompt,
    timeoutMs,
  };

  logger.info(
    { nodeId: node.id, agentId, ticketRef: graph.ticketRef },
    "Executing task node"
  );

  const result = await executor.execute(request, signal);
  return { nodeId: node.id, result };
}
