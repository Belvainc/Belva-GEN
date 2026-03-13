import { z } from "zod";
import { AgentIdSchema, TaskTypeSchema } from "@/types/agent-protocol";

// ─── Execution Request ──────────────────────────────────────────────────────
// Built by the AgentRunner from a TaskAssignment + AgentConfig.

export const ExecutionRequestSchema = z.object({
  taskId: z.string().uuid(),
  agentId: AgentIdSchema,
  taskType: TaskTypeSchema,
  ticketRef: z.string().min(1),
  description: z.string().min(1),
  constraints: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  domainPaths: z.array(z.string()),
  systemPrompt: z.string().min(1),
  model: z.string().optional(), // Override model for this execution
  priorResults: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().default(600_000),
});
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

// ─── Execution Result ───────────────────────────────────────────────────────
// Returned by AgentExecutor after processing a request.

export const ExecutionResultSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["completed", "failed", "timeout"]),
  changedFiles: z.array(z.string()),
  testRequirements: z.array(z.string()),
  summary: z.string(),
  durationMs: z.number().int().min(0),
  error: z.string().optional(),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ─── Agent Executor Interface ───────────────────────────────────────────────
// Abstraction layer: mock, claude, or openclaw implementations.

export interface AgentExecutor {
  execute(
    request: ExecutionRequest,
    signal?: AbortSignal
  ): Promise<ExecutionResult>;

  healthCheck(): Promise<{
    status: "healthy" | "unhealthy" | "disabled";
  }>;
}
