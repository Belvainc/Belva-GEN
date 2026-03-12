import { z } from "zod";
import type { TaskGraph } from "./task-graph";
import { topologicalSort } from "./task-graph";
import type { ExecutionResult } from "@/server/agents/execution/types";
import { createPullRequest, buildPRBody } from "@/server/services/pr.service";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "merge-sequencer" });

// ─── Conflict Warning ───────────────────────────────────────────────────────

export const ConflictWarningSchema = z.object({
  taskIds: z.tuple([z.string(), z.string()]),
  overlappingFiles: z.array(z.string()),
  recommendation: z.enum(["sequential", "group"]),
});
export type ConflictWarning = z.infer<typeof ConflictWarningSchema>;

// ─── Merge Sequence ─────────────────────────────────────────────────────────

export interface MergeSequence {
  order: string[];
  conflicts: ConflictWarning[];
}

// ─── Calculate Merge Order ──────────────────────────────────────────────────

/**
 * Calculate the order in which completed task PRs should be merged.
 * Uses topological sort for dependency ordering and detects file conflicts.
 */
export function calculateMergeSequence(
  graph: TaskGraph,
  results: Map<string, ExecutionResult>
): MergeSequence {
  const sorted = topologicalSort(graph);
  const completedSorted = sorted.filter((id) => results.has(id));

  // Detect file conflicts between tasks
  const conflicts: ConflictWarning[] = [];
  for (let i = 0; i < completedSorted.length; i++) {
    for (let j = i + 1; j < completedSorted.length; j++) {
      const idA = completedSorted[i];
      const idB = completedSorted[j];
      if (!idA || !idB) continue;

      const filesA = results.get(idA)?.changedFiles ?? [];
      const filesB = results.get(idB)?.changedFiles ?? [];
      const overlap = filesA.filter((f) => filesB.includes(f));

      if (overlap.length > 0) {
        conflicts.push({
          taskIds: [idA, idB],
          overlappingFiles: overlap,
          recommendation: overlap.length > 3 ? "group" : "sequential",
        });
      }
    }
  }

  return { order: completedSorted, conflicts };
}

// ─── Create PRs in Merge Order ──────────────────────────────────────────────

/**
 * Create GitHub PRs for each completed task in merge order.
 * Each task gets one PR with branch naming per git-safety.md.
 */
export async function createMergePRs(
  graph: TaskGraph,
  sequence: MergeSequence,
  results: Map<string, ExecutionResult>,
  signal?: AbortSignal
): Promise<Map<string, { prNumber: number; prUrl: string }>> {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const prs = new Map<string, { prNumber: number; prUrl: string }>();

  for (const taskId of sequence.order) {
    signal?.throwIfAborted();

    const node = nodeMap.get(taskId);
    const result = results.get(taskId);
    if (!node || !result) continue;

    const branch = `feature/${graph.ticketRef.toLowerCase()}-${taskId}`;

    const pr = await createPullRequest(
      {
        ticketRef: graph.ticketRef,
        branch,
        title: node.title,
        body: buildPRBody(
          graph.ticketRef,
          result.summary,
          result.changedFiles,
          1
        ),
        labels: ["GEN", `task:${node.taskType}`],
      },
      signal
    );

    prs.set(taskId, { prNumber: pr.prNumber, prUrl: pr.prUrl });
    logger.info(
      { taskId, prNumber: pr.prNumber },
      "PR created for task"
    );
  }

  return prs;
}
