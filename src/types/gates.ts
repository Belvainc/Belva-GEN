import { z } from "zod";

// ─── Gate Types ───────────────────────────────────────────────────────────────

export const GateTypeSchema = z.enum(["dor", "dod", "human-approval"]);
export type GateType = z.infer<typeof GateTypeSchema>;

// ─── Gate Violation ───────────────────────────────────────────────────────────

export const GateViolationSchema = z.object({
  rule: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["error", "warning"]),
});
export type GateViolation = z.infer<typeof GateViolationSchema>;

// ─── Gate Result ──────────────────────────────────────────────────────────────

export const GateResultSchema = z.object({
  gateType: GateTypeSchema,
  ticketRef: z.string().min(1),
  passed: z.boolean(),
  evaluatedAt: z.string().datetime(),
  violations: z.array(GateViolationSchema),
});
export type GateResult = z.infer<typeof GateResultSchema>;
