import { z } from "zod";
import { AgentIdSchema, TaskTypeSchema } from "@/types/agent-protocol";
import type { AgentId } from "@/types/agent-protocol";

// ─── Task Node ──────────────────────────────────────────────────────────────

export const TaskNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  taskType: TaskTypeSchema,
  dependsOn: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  estimatedPoints: z.number().int().min(1).max(13),
  agentId: AgentIdSchema.optional(),
  status: z
    .enum(["pending", "active", "completed", "failed", "blocked"])
    .default("pending"),
});
export type TaskNode = z.infer<typeof TaskNodeSchema>;

// ─── Task Graph ─────────────────────────────────────────────────────────────
// Serialized to TaskDecomposition.taskGraph as JSON in Prisma.

export const TaskGraphSchema = z.object({
  ticketRef: z.string().min(1),
  nodes: z.array(TaskNodeSchema),
  totalEstimatedPoints: z.number().int().min(0),
  riskAreas: z.array(z.string()),
});
export type TaskGraph = z.infer<typeof TaskGraphSchema>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the agent ID for a task based on its type or explicit assignment.
 */
export function resolveAgentForTask(node: TaskNode): AgentId {
  if (node.agentId) return node.agentId;
  switch (node.taskType) {
    case "backend":
      return "node-backend";
    case "frontend":
      return "next-ux";
    case "testing":
      return "ts-testing";
    case "orchestration":
      return "orchestrator-project";
    case "documentation":
      return "orchestrator-project";
  }
}

/**
 * Find nodes in the graph that are ready to execute:
 * - Not yet completed or failed
 * - All dependencies are completed
 * - No dependencies have failed
 */
export function findReadyNodes(
  graph: TaskGraph,
  completed: Set<string>,
  failed: Set<string>
): TaskNode[] {
  return graph.nodes.filter((node) => {
    if (completed.has(node.id) || failed.has(node.id)) return false;
    if (node.status === "active") return false;

    const hasFailedDep = node.dependsOn.some((dep) => failed.has(dep));
    if (hasFailedDep) return false;

    return node.dependsOn.every((dep) => completed.has(dep));
  });
}

/**
 * Find all nodes that transitively depend on a given node.
 */
export function findDependentNodes(
  nodeId: string,
  graph: TaskGraph
): string[] {
  const dependents = new Set<string>();

  function collect(id: string): void {
    for (const node of graph.nodes) {
      if (node.dependsOn.includes(id) && !dependents.has(node.id)) {
        dependents.add(node.id);
        collect(node.id);
      }
    }
  }

  collect(nodeId);
  return [...dependents];
}

/**
 * Topological sort of task graph nodes.
 * Returns node IDs in dependency-first order.
 */
export function topologicalSort(graph: TaskGraph): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (node) {
      for (const depId of node.dependsOn) {
        visit(depId);
      }
    }
    result.push(nodeId);
  }

  for (const node of graph.nodes) {
    visit(node.id);
  }
  return result;
}
