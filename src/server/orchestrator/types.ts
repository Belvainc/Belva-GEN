import { z } from "zod";
import { EpicStateSchema } from "@/types/events";

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
  enableSlackNotifications: z.boolean().default(true),
});
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

// ─── Epic Context ─────────────────────────────────────────────────────────────

export const EpicContextSchema = z.object({
  ticketRef: z.string().min(1),
  currentState: EpicStateSchema,
  assignedAgents: z.array(z.string()),
  revisionCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type EpicContext = z.infer<typeof EpicContextSchema>;
