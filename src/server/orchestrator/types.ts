import { z } from "zod";
import { EpicStateSchema } from "@/types/events";
import { TaskTypeSchema } from "@/types/agent-protocol";

// ─── Epic Lifecycle ───────────────────────────────────────────────────────────

export { EpicStateSchema };
export type { EpicState } from "@/types/events";

// ─── State Transitions ────────────────────────────────────────────────────────

export const TransitionSchema = z.object({
  from: EpicStateSchema,
  to: EpicStateSchema,
  trigger: z.string().min(1),
  guard: z.string().optional(),
});
export type Transition = z.infer<typeof TransitionSchema>;

// ─── Orchestrator Configuration ───────────────────────────────────────────────

export const OrchestratorConfigSchema = z.object({
  approvalTimeoutMs: z.number().int().positive().default(86_400_000), // 24 hours
  maxRevisionCycles: z.number().int().positive().default(3),
  maxConcurrentTasksPerEpic: z.number().int().positive().default(3),
  enableSlackNotifications: z.boolean().default(true),
});
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

// ─── Task Graph (LLM decomposition output) ────────────────────────────────────

export const TaskNodeSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  taskType: TaskTypeSchema,
  estimatedPoints: z.number().int().min(1).max(13), // Fibonacci-ish: 1,2,3,5,8,13
  dependsOn: z.array(z.string()), // taskIds this task depends on
});
export type TaskNode = z.infer<typeof TaskNodeSchema>;

export const TaskGraphSchema = z.object({
  ticketRef: z.string().min(1),
  nodes: z.array(TaskNodeSchema),
});
export type TaskGraph = z.infer<typeof TaskGraphSchema>;

/**
 * Compute root task IDs (tasks with no dependencies).
 */
export function getRootTaskIds(graph: TaskGraph): string[] {
  return graph.nodes
    .filter((node) => node.dependsOn.length === 0)
    .map((node) => node.taskId);
}

/**
 * Get a task node by ID.
 */
export function getTaskNode(graph: TaskGraph, taskId: string): TaskNode | undefined {
  return graph.nodes.find((node) => node.taskId === taskId);
}

export const DecompositionResultSchema = z.object({
  graph: TaskGraphSchema,
  totalEstimatedPoints: z.number().int().min(0),
  riskAreas: z.array(z.string()),
  affectedFiles: z.array(z.string()),
});
export type DecompositionResult = z.infer<typeof DecompositionResultSchema>;

// ─── Extended Epic Context (with task tracking) ───────────────────────────────

export const ActiveTaskSchema = z.object({
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  startedAt: z.string().datetime(),
});
export type ActiveTask = z.infer<typeof ActiveTaskSchema>;

export const TaskResultSchema = z.object({
  taskId: z.string().min(1),
  success: z.boolean(),
  changedFiles: z.array(z.string()),
  summary: z.string(),
  completedAt: z.string().datetime(),
});
export type TaskResult = z.infer<typeof TaskResultSchema>;

export const EpicContextSchema = z.object({
  ticketRef: z.string().min(1),
  currentState: EpicStateSchema,
  assignedAgents: z.array(z.string()),
  revisionCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Task tracking (populated after DoR pass)
  taskGraph: TaskGraphSchema.optional(),
  decomposition: DecompositionResultSchema.optional(),
  activeTasks: z.array(ActiveTaskSchema).default([]),
  completedTaskIds: z.array(z.string()).default([]),
  taskResults: z.array(TaskResultSchema).default([]),
});
export type EpicContext = z.infer<typeof EpicContextSchema>;
