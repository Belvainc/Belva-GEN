import { z } from "zod";

// ─── Review Finding ──────────────────────────────────────────────────────────

export const ReviewFindingCategorySchema = z.enum([
  "correctness",
  "security",
  "performance",
  "style",
  "architecture",
]);
export type ReviewFindingCategory = z.infer<typeof ReviewFindingCategorySchema>;

export const ReviewFindingSeveritySchema = z.enum(["error", "warning", "info"]);
export type ReviewFindingSeverity = z.infer<typeof ReviewFindingSeveritySchema>;

export const ReviewFindingSchema = z.object({
  rule: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().min(1).optional(),
  description: z.string().min(1),
  severity: ReviewFindingSeveritySchema,
  category: ReviewFindingCategorySchema,
  falsePositive: z.boolean().default(false),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

// ─── Review Verdict ──────────────────────────────────────────────────────────

export const ReviewVerdictValueSchema = z.enum([
  "APPROVE",
  "REQUEST_CHANGES",
  "BLOCK",
]);
export type ReviewVerdictValue = z.infer<typeof ReviewVerdictValueSchema>;

export const ReviewVerdictSchema = z.object({
  verdict: ReviewVerdictValueSchema,
  findings: z.array(ReviewFindingSchema),
  summary: z.string().min(1),
  trivialityScore: z.number().int().min(0).max(100),
  requiresHumanReview: z.boolean(),
});
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
