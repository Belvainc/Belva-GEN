import { z } from "zod";

// ─── Gate Types ───────────────────────────────────────────────────────────────

export const GateTypeSchema = z.enum([
  "dor",
  "dod",
  "human-approval",
  "ideation",
  "team-confirmation",
  "review-synthesis",
]);
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

// ─── Security Scan Results ────────────────────────────────────────────────────

export const SecurityFindingSchema = z.object({
  pattern: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().min(1).optional(),
  severity: z.enum(["error", "warning"]),
  message: z.string().min(1),
});
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const SecurityScanResultSchema = z.object({
  status: z.enum(["clean", "flagged"]),
  findings: z.array(SecurityFindingSchema),
  scannedAt: z.string().datetime(),
});
export type SecurityScanResult = z.infer<typeof SecurityScanResultSchema>;

// ─── Test Results ─────────────────────────────────────────────────────────────

export const TestResultsSchema = z.object({
  passCount: z.number().int().min(0),
  failCount: z.number().int().min(0),
  skipCount: z.number().int().min(0),
  coveragePercent: z.number().min(0).max(100),
  durationMs: z.number().int().min(0),
});
export type TestResults = z.infer<typeof TestResultsSchema>;

// ─── Lint Results ─────────────────────────────────────────────────────────────

export const LintResultsSchema = z.object({
  errorCount: z.number().int().min(0),
  warningCount: z.number().int().min(0),
});
export type LintResults = z.infer<typeof LintResultsSchema>;

// ─── Changeset ────────────────────────────────────────────────────────────────

export const ChangesetSchema = z.object({
  ticketRef: z.string().min(1),
  branchName: z.string().min(1),
  changedFiles: z.array(z.string()),
  testResults: TestResultsSchema.optional(),
  lintResults: LintResultsSchema.optional(),
  securityScan: SecurityScanResultSchema.optional(),
  fileContents: z.record(z.string(), z.string()).optional(),
});
export type Changeset = z.infer<typeof ChangesetSchema>;
