import { z } from "zod";

// ─── Agent Identifiers ────────────────────────────────────────────────────────

export const AgentIdSchema = z.enum([
  // Role-based IDs (OpenClaw agents)
  "orchestrator",
  "backend",
  "frontend",
  "testing",
  // Legacy IDs (kept for backward compatibility with existing data)
  "orchestrator-project",
  "node-backend",
  "next-ux",
  "ts-testing",
]);
export type AgentId = z.infer<typeof AgentIdSchema>;

// ─── Task Types ───────────────────────────────────────────────────────────────

export const TaskTypeSchema = z.enum([
  "backend",
  "frontend",
  "testing",
  "documentation",
  "orchestration",
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

// ─── Message Base ─────────────────────────────────────────────────────────────

const MessageBaseSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
});

// ─── Task Assignment ──────────────────────────────────────────────────────────

export const TaskAssignmentSchema = MessageBaseSchema.extend({
  kind: z.literal("task-assignment"),
  sourceAgent: AgentIdSchema,
  targetAgent: AgentIdSchema,
  taskType: TaskTypeSchema,
  ticketRef: z.string().min(1),
  description: z.string().min(1),
  constraints: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
});
export type TaskAssignment = z.infer<typeof TaskAssignmentSchema>;

// ─── Task Completion ──────────────────────────────────────────────────────────

export const TaskCompletionSchema = MessageBaseSchema.extend({
  kind: z.literal("task-completion"),
  sourceAgent: AgentIdSchema,
  taskAssignmentId: z.string().uuid(),
  changedFiles: z.array(z.string()),
  testRequirements: z.array(z.string()),
  summary: z.string().min(1),
});
export type TaskCompletion = z.infer<typeof TaskCompletionSchema>;

// ─── Gate Check Request ───────────────────────────────────────────────────────

export const GateCheckRequestSchema = MessageBaseSchema.extend({
  kind: z.literal("gate-check-request"),
  sourceAgent: AgentIdSchema,
  gateType: z.enum(["dor", "dod", "human-approval"]),
  ticketRef: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});
export type GateCheckRequest = z.infer<typeof GateCheckRequestSchema>;

// ─── Gate Check Result ────────────────────────────────────────────────────────

export const GateCheckResultSchema = MessageBaseSchema.extend({
  kind: z.literal("gate-check-result"),
  sourceAgent: AgentIdSchema,
  gateType: z.enum(["dor", "dod", "human-approval"]),
  ticketRef: z.string().min(1),
  passed: z.boolean(),
  violations: z.array(
    z.object({
      rule: z.string(),
      description: z.string(),
      severity: z.enum(["error", "warning"]),
    })
  ),
});
export type GateCheckResult = z.infer<typeof GateCheckResultSchema>;

// ─── Human Approval Request ───────────────────────────────────────────────────

export const HumanApprovalRequestSchema = MessageBaseSchema.extend({
  kind: z.literal("human-approval-request"),
  sourceAgent: AgentIdSchema,
  ticketRef: z.string().min(1),
  planSummary: z.string().min(1),
  filesToChange: z.array(z.string()),
  agentAssignments: z.array(
    z.object({
      agentId: AgentIdSchema,
      taskType: TaskTypeSchema,
      description: z.string(),
    })
  ),
  riskLevel: z.enum(["low", "medium", "high"]),
});
export type HumanApprovalRequest = z.infer<typeof HumanApprovalRequestSchema>;

// ─── Human Approval Response ──────────────────────────────────────────────────

export const HumanApprovalResponseSchema = MessageBaseSchema.extend({
  kind: z.literal("human-approval-response"),
  approvalRequestId: z.string().uuid(),
  decision: z.enum(["approved", "revision-requested", "rejected"]),
  reviewerIdentity: z.string().min(1),
  comment: z.string().optional(),
});
export type HumanApprovalResponse = z.infer<typeof HumanApprovalResponseSchema>;

// ─── Status Update ────────────────────────────────────────────────────────────

export const StatusUpdateSchema = MessageBaseSchema.extend({
  kind: z.literal("status-update"),
  sourceAgent: AgentIdSchema,
  ticketRef: z.string().min(1),
  status: z.string().min(1),
  details: z.string().optional(),
});
export type StatusUpdate = z.infer<typeof StatusUpdateSchema>;

// ─── Task Blocked ────────────────────────────────────────────────────────────

export const BlockerTypeSchema = z.enum([
  "dependency",
  "error",
  "complexity",
  "timeout",
]);
export type BlockerType = z.infer<typeof BlockerTypeSchema>;

export const TaskBlockedMessageSchema = MessageBaseSchema.extend({
  kind: z.literal("task-blocked"),
  sourceAgent: AgentIdSchema,
  taskId: z.string().min(1),
  ticketRef: z.string().min(1),
  reason: z.string().min(1),
  blockerType: BlockerTypeSchema,
  suggestedAction: z.enum(["reassign", "escalate", "abort"]),
});
export type TaskBlockedMessage = z.infer<typeof TaskBlockedMessageSchema>;

// ─── Task Abort Requested ────────────────────────────────────────────────────

export const TaskAbortRequestedSchema = MessageBaseSchema.extend({
  kind: z.literal("task-abort-requested"),
  sourceAgent: AgentIdSchema,
  taskId: z.string().min(1),
  ticketRef: z.string().min(1),
  reason: z.string().min(1),
});
export type TaskAbortRequested = z.infer<typeof TaskAbortRequestedSchema>;

// ─── Discriminated Union ──────────────────────────────────────────────────────

export const AgentMessageSchema = z.discriminatedUnion("kind", [
  TaskAssignmentSchema,
  TaskCompletionSchema,
  GateCheckRequestSchema,
  GateCheckResultSchema,
  HumanApprovalRequestSchema,
  HumanApprovalResponseSchema,
  StatusUpdateSchema,
  TaskBlockedMessageSchema,
  TaskAbortRequestedSchema,
]);
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

// ─── Parse Helper ─────────────────────────────────────────────────────────────

export function parseAgentMessage(raw: unknown): AgentMessage {
  return AgentMessageSchema.parse(raw);
}
