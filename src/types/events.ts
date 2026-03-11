import { z } from "zod";

// ─── Base Event ───────────────────────────────────────────────────────────────

const EventBaseSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  ticketRef: z.string().min(1),
});

// ─── DoR Events ───────────────────────────────────────────────────────────────

export const DoRPassEventSchema = EventBaseSchema.extend({
  kind: z.literal("dor-pass"),
  validatedCriteria: z.array(z.string()),
});
export type DoRPassEvent = z.infer<typeof DoRPassEventSchema>;

export const DoRFailEventSchema = EventBaseSchema.extend({
  kind: z.literal("dor-fail"),
  failures: z.array(
    z.object({
      step: z.string(),
      description: z.string(),
      remediation: z.string(),
    })
  ),
});
export type DoRFailEvent = z.infer<typeof DoRFailEventSchema>;

// ─── Plan Approval Events ─────────────────────────────────────────────────────

export const PlanApprovedEventSchema = EventBaseSchema.extend({
  kind: z.literal("plan-approved"),
  approverIdentity: z.string().min(1),
  planHash: z.string().min(1),
});
export type PlanApprovedEvent = z.infer<typeof PlanApprovedEventSchema>;

export const PlanRejectedEventSchema = EventBaseSchema.extend({
  kind: z.literal("plan-rejected"),
  reviewerIdentity: z.string().min(1),
  reason: z.string().min(1),
});
export type PlanRejectedEvent = z.infer<typeof PlanRejectedEventSchema>;

export const PlanRevisionRequestedEventSchema = EventBaseSchema.extend({
  kind: z.literal("plan-revision-requested"),
  reviewerIdentity: z.string().min(1),
  feedback: z.string().min(1),
  revisionCount: z.number().int().min(1),
});
export type PlanRevisionRequestedEvent = z.infer<
  typeof PlanRevisionRequestedEventSchema
>;

export const PlanExpiredEventSchema = EventBaseSchema.extend({
  kind: z.literal("plan-expired"),
  expirationReason: z.string().min(1),
});
export type PlanExpiredEvent = z.infer<typeof PlanExpiredEventSchema>;

// ─── DoD Events ───────────────────────────────────────────────────────────────

export const DoDPassEventSchema = EventBaseSchema.extend({
  kind: z.literal("dod-pass"),
  testSummary: z.object({
    passCount: z.number().int().min(0),
    failCount: z.number().int().min(0),
    coveragePercent: z.number().min(0).max(100),
  }),
  securityScanResult: z.enum(["clean", "flagged"]),
});
export type DoDPassEvent = z.infer<typeof DoDPassEventSchema>;

export const DoDFailEventSchema = EventBaseSchema.extend({
  kind: z.literal("dod-fail"),
  failures: z.array(
    z.object({
      step: z.string(),
      description: z.string(),
      remediation: z.string(),
    })
  ),
});
export type DoDFailEvent = z.infer<typeof DoDFailEventSchema>;

// ─── Epic State Transition ────────────────────────────────────────────────────

export const EpicStateSchema = z.enum([
  "funnel",
  "refinement",
  "approved",
  "in-progress",
  "review",
  "done",
]);
export type EpicState = z.infer<typeof EpicStateSchema>;

export const EpicStateTransitionEventSchema = EventBaseSchema.extend({
  kind: z.literal("epic-state-transition"),
  fromState: EpicStateSchema,
  toState: EpicStateSchema,
  reason: z.string().min(1),
});
export type EpicStateTransitionEvent = z.infer<
  typeof EpicStateTransitionEventSchema
>;

// ─── Domain Event Union ───────────────────────────────────────────────────────

export const DomainEventSchema = z.discriminatedUnion("kind", [
  DoRPassEventSchema,
  DoRFailEventSchema,
  PlanApprovedEventSchema,
  PlanRejectedEventSchema,
  PlanRevisionRequestedEventSchema,
  PlanExpiredEventSchema,
  DoDPassEventSchema,
  DoDFailEventSchema,
  EpicStateTransitionEventSchema,
]);
export type DomainEvent = z.infer<typeof DomainEventSchema>;
