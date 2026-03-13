import { z } from "zod";
import { AgentIdSchema, TaskTypeSchema } from "@/types/agent-protocol";

// ─── Agent Status ─────────────────────────────────────────────────────────────

export const AgentStatusValueSchema = z.enum([
  "idle",
  "busy",
  "error",
  "offline",
]);
export type AgentStatusValue = z.infer<typeof AgentStatusValueSchema>;

export const AgentStatusSchema = z.object({
  agentId: AgentIdSchema,
  status: AgentStatusValueSchema,
  currentTask: z.string().nullable(),
  lastHeartbeat: z.string().datetime(),
});
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// ─── Agent Configuration ──────────────────────────────────────────────────────

export const AgentCapabilitySchema = z.object({
  taskTypes: z.array(TaskTypeSchema),
  maxConcurrentTasks: z.number().int().positive().default(1),
  ruleReferences: z.array(z.string()),
});
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentConfigSchema = z.object({
  agentId: AgentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  role: z.string().default(""), // Maps to openclaw/agents/<role>.md in project repo
  capabilities: AgentCapabilitySchema,
  ownedPaths: z.array(z.string()),
  preferredModel: z.string().nullish(), // e.g. "claude-sonnet-4-6", overrides system default
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
