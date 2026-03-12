# Plan 02: DoR/DoD Gate Enforcement

## Overview

Implement the Definition of Ready (DoR) and Definition of Done (DoD) validation services that enforce quality gates before and after agent execution. Every ticket must pass DoR before code generation begins; every implementation must pass DoD before merge. All gate decisions are logged to the audit trail.

## Prerequisites

- Database migrations applied (`make db-migrate`) — AuditLog model available
- Type system complete: `GateResult`, `GateViolation`, `DomainEvent` schemas (already exist)
- Orchestrator engine scaffolded with event handlers (already exists as TODOs)

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Gate types | `src/types/gates.ts` | Complete — `GateResult`, `GateViolation`, `GateType` with Zod schemas |
| Domain events | `src/types/events.ts` | Complete — `DoRPassEvent`, `DoRFailEvent`, `DoDPassEvent`, `DoDFailEvent` |
| Agent protocol | `src/types/agent-protocol.ts` | Complete — `GateCheckRequest`, `GateCheckResult` messages |
| Orchestrator engine | `src/server/orchestrator/engine.ts` | `onDoRPass()` and `onDoDPass()` are TODOs |
| State machine | `src/server/orchestrator/state-machine.ts` | Guards: "DoR validation must pass", "DoD validation must pass" |
| GateFailedError | `src/lib/errors.ts` | Complete — custom error class |
| AuditLog model | `prisma/schema.prisma` | Complete — action, entityType, entityId, payload fields |
| DoR validation skill | `.github/skills/dor-validation/SKILL.md` | Complete — full checklist and workflow |
| DoD validation skill | `.github/skills/dod-validation/SKILL.md` | Complete — categories and criteria |

## Scope

### In Scope

- `DoRValidationService` — validates ticket readiness against DoR criteria
- `DoDValidationService` — validates implementation completeness against DoD categories
- Audit trail logging for all gate decisions (pass/fail with violations)
- Wire gate services into orchestrator event handlers
- Gate result persistence to database
- Unit tests for both services

### Out of Scope

- Human override of gate decisions (Plan 06 — Approval Flow)
- Slack notifications for gate failures (Plan 03)
- Dashboard visualization of gate results (Plan 07)
- Automated remediation suggestions (future enhancement)

## Research Questions — RESOLVED

### Q1: DoR criteria source
**Answer:** Criteria are **global** (defined in `.github/skills/dor-validation/SKILL.md`). The `JiraTicket` type provides all needed fields:
- `acceptanceCriteria` — extracted from description or custom field  
- `storyPoints` — from `customfield_10016` (nullable)
- `description` — full text (check for "Out-of-Scope" section)
- `labels` — for ticket type detection (bug vs feature)

### Q2: DoD test coverage measurement
**Answer:** Jest config (`jest.config.ts`) already enforces per-directory thresholds. For changeset-specific validation, the `Changeset` type receives **pre-computed** `testResults` from the test runner/worker — DoD service validates the values, doesn't run tests itself.

### Q3: Security scan integration
**Answer:** No security ESLint plugin configured. Implementation:
- **Phase 1 (this plan):** Simple regex patterns for secret detection (API keys, tokens, passwords) + dangerous code patterns (`eval`, `dangerouslySetInnerHTML`, `innerHTML`)
- **Phase 2 (future):** `eslint-plugin-security`, `npm audit` integration
- Security violations are `error` severity (blocking)

### Q4: Gate evaluation timing
**Answer:** **Hybrid approach:**
- **DoR:** Synchronous — field validation only, fast (<50ms)
- **DoD:** Receives pre-computed results via `Changeset` — validation is synchronous, but caller gathers data asynchronously

### Q5: Partial gate results
**Answer:** Confirmed — `error` severity blocks, `warning` severity is informational only. Implementation uses `.filter(v => v.severity === 'error').length === 0` for pass condition.

## Gaps Identified During Research

| Gap | Resolution |
|-----|------------|
| `src/server/services/` doesn't exist | Create directory structure as part of this plan |
| `src/server/context.ts` doesn't exist | Out of scope — use direct singleton imports for now (service layer rule allows this while context is being built) |
| Security scanner not configured | Implement regex-based detection for Phase 1 |
| `__fixtures__/` is empty | Create typed factory functions for test data |
| Changeset source unclear | Define `Changeset` type; caller (worker) is responsible for gathering data |

## Architecture Decisions

### AD-01: Gate services as pure async functions (not classes)

Per service-layer rule, services are pure async functions exported from `src/server/services/gates/`. No class instantiation required — this simplifies testing and composition.

```typescript
// Pattern to follow
export async function evaluateDoR(ticket: JiraTicket): Promise<GateResult>
export async function evaluateDoD(changeset: Changeset): Promise<GateResult>
```

### AD-02: Errors block, warnings pass

Gate evaluation passes if zero `error`-severity violations exist. `warning` violations are included in the result but don't block progression. Rationale: prevents over-blocking while maintaining visibility.

### AD-03: All gate decisions audited

Every gate evaluation (pass or fail) writes to the `AuditLog` table with the full `GateResult` as payload. Rationale: complete audit trail for compliance and debugging.

### AD-04: Rule-based validation with typed predicates

Each validation rule is a typed predicate function returning `GateViolation | null`. This enables:
- Easy testing of individual rules
- Clear mapping to skill file criteria
- Future extensibility (load rules from config)

## Implementation Steps

### Step 1: Extend gates.ts with Changeset and SecurityScan schemas

**Files:** `src/types/gates.ts` (extend)

```typescript
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
  fileContents: z.record(z.string(), z.string()).optional(), // For security scanning
});
export type Changeset = z.infer<typeof ChangesetSchema>;
```

### Step 2: Create DoR validation rules

**Files:** `src/server/services/gates/dor-rules.ts` (create)

Define individual rule predicates that can be tested in isolation:

```typescript
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { GateViolation } from "@/types/gates";

// ─── BDD Format Detection ─────────────────────────────────────────────────────

const BDD_PATTERN = /\b(GIVEN|WHEN|THEN|AND)\b/gi;
const MIN_BDD_KEYWORDS = 3; // Must have at least GIVEN, WHEN, THEN

export function checkBDDFormat(ticket: JiraTicket): GateViolation | null {
  const matches = ticket.acceptanceCriteria.match(BDD_PATTERN);
  const hasGiven = /\bGIVEN\b/i.test(ticket.acceptanceCriteria);
  const hasWhen = /\bWHEN\b/i.test(ticket.acceptanceCriteria);
  const hasThen = /\bTHEN\b/i.test(ticket.acceptanceCriteria);

  if (!hasGiven || !hasWhen || !hasThen) {
    return {
      rule: "bdd-format",
      description: `Acceptance criteria must follow Given/When/Then format. Found: ${
        hasGiven ? "GIVEN" : ""} ${hasWhen ? "WHEN" : ""} ${hasThen ? "THEN" : ""}`.trim() || "none",
      severity: "error",
    };
  }

  return null;
}

// ─── Story Points ─────────────────────────────────────────────────────────────

const VALID_STORY_POINTS = [1, 2, 3, 5, 8, 13];
const LARGE_STORY_POINTS_THRESHOLD = 8;

export function checkStoryPoints(ticket: JiraTicket): GateViolation | null {
  if (ticket.storyPoints === null) {
    return {
      rule: "story-points-required",
      description: "Story points must be estimated before approval",
      severity: "error",
    };
  }

  if (!VALID_STORY_POINTS.includes(ticket.storyPoints)) {
    return {
      rule: "story-points-fibonacci",
      description: `Story points must be Fibonacci (1, 2, 3, 5, 8, 13). Found: ${ticket.storyPoints}`,
      severity: "error",
    };
  }

  return null;
}

export function checkStoryPointsWarning(ticket: JiraTicket): GateViolation | null {
  if (ticket.storyPoints !== null && ticket.storyPoints > LARGE_STORY_POINTS_THRESHOLD) {
    return {
      rule: "story-points-large",
      description: `Story points (${ticket.storyPoints}) exceed recommended size (8). Consider splitting.`,
      severity: "warning",
    };
  }

  return null;
}

// ─── Scope Clarity ────────────────────────────────────────────────────────────

export function checkOutOfScope(ticket: JiraTicket): GateViolation | null {
  const hasOutOfScope = /out[- ]?of[- ]?scope/i.test(ticket.description);
  
  if (!hasOutOfScope) {
    return {
      rule: "out-of-scope-section",
      description: "Description must include an 'Out-of-Scope' section",
      severity: "error",
    };
  }

  return null;
}

export function checkTitleLength(ticket: JiraTicket): GateViolation | null {
  if (ticket.summary.length > 100) {
    return {
      rule: "title-length",
      description: `Title exceeds 100 characters (${ticket.summary.length}). Must be concise.`,
      severity: "error",
    };
  }

  return null;
}

// ─── Bug-Specific Checks ──────────────────────────────────────────────────────

export function checkBugReproductionSteps(ticket: JiraTicket): GateViolation | null {
  const isBug = ticket.labels.some(l => l.toLowerCase() === "bug") ||
                ticket.summary.toLowerCase().includes("bug") ||
                ticket.summary.toLowerCase().includes("fix");
  
  if (!isBug) return null;

  const hasReproSteps = /repro(duction)?[- ]?steps|steps to reproduce/i.test(ticket.description);
  const hasExpectedActual = /expected/i.test(ticket.description) && /actual/i.test(ticket.description);

  if (!hasReproSteps) {
    return {
      rule: "bug-reproduction-steps",
      description: "Bug tickets must include reproduction steps",
      severity: "error",
    };
  }

  if (!hasExpectedActual) {
    return {
      rule: "bug-expected-actual",
      description: "Bug tickets must include expected vs actual behavior",
      severity: "error",
    };
  }

  return null;
}
```

### Step 3: Create DoR Validation Service

**Files:** `src/server/services/gates/dor-validation.ts` (create)

```typescript
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { GateResult, GateViolation } from "@/types/gates";
import {
  checkBDDFormat,
  checkStoryPoints,
  checkStoryPointsWarning,
  checkOutOfScope,
  checkTitleLength,
  checkBugReproductionSteps,
} from "./dor-rules";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

type RuleFunction = (ticket: JiraTicket) => GateViolation | null;

const DOR_RULES: readonly RuleFunction[] = [
  checkBDDFormat,
  checkStoryPoints,
  checkStoryPointsWarning, // Warning only
  checkOutOfScope,
  checkTitleLength,
  checkBugReproductionSteps,
];

/**
 * Evaluate a Jira ticket against Definition of Ready criteria.
 * Returns a GateResult with pass/fail status and any violations.
 */
export async function evaluateDoR(ticket: JiraTicket): Promise<GateResult> {
  logger.info(`Evaluating DoR for ${ticket.key}`);

  const violations: GateViolation[] = [];

  for (const rule of DOR_RULES) {
    const violation = rule(ticket);
    if (violation !== null) {
      violations.push(violation);
    }
  }

  const errors = violations.filter(v => v.severity === "error");
  const passed = errors.length === 0;

  logger.info(`DoR evaluation complete for ${ticket.key}`, {
    passed,
    errorCount: errors.length,
    warningCount: violations.length - errors.length,
  });

  return {
    gateType: "dor",
    ticketRef: ticket.key,
    passed,
    evaluatedAt: new Date().toISOString(),
    violations,
  };
}
```

### Step 4: Create DoD validation rules

**Files:** `src/server/services/gates/dod-rules.ts` (create)

```typescript
import type { Changeset, GateViolation } from "@/types/gates";

// ─── Coverage Thresholds (from testing-budgets.md) ────────────────────────────

const COVERAGE_THRESHOLD_SERVER = 80;
const COVERAGE_THRESHOLD_APP = 70;
const TEST_DURATION_BUDGET_MS = 3000;

// ─── Testing Rules ────────────────────────────────────────────────────────────

export function checkTestsPassing(changeset: Changeset): GateViolation | null {
  if (changeset.testResults === undefined) {
    return {
      rule: "test-results-required",
      description: "Test results must be provided for DoD evaluation",
      severity: "error",
    };
  }

  if (changeset.testResults.failCount > 0) {
    return {
      rule: "tests-passing",
      description: `${changeset.testResults.failCount} test(s) failing. All tests must pass.`,
      severity: "error",
    };
  }

  return null;
}

export function checkNoSkippedTests(changeset: Changeset): GateViolation | null {
  if (changeset.testResults?.skipCount !== undefined && changeset.testResults.skipCount > 0) {
    return {
      rule: "no-skipped-tests",
      description: `${changeset.testResults.skipCount} skipped test(s) detected. Remove .skip()/.only()/.todo()`,
      severity: "error",
    };
  }

  return null;
}

export function checkCoverage(changeset: Changeset): GateViolation | null {
  if (changeset.testResults === undefined) return null;

  // Determine threshold based on changed files
  const hasServerFiles = changeset.changedFiles.some(f => 
    f.startsWith("src/server/") || f.startsWith("src/app/api/")
  );
  const threshold = hasServerFiles ? COVERAGE_THRESHOLD_SERVER : COVERAGE_THRESHOLD_APP;

  if (changeset.testResults.coveragePercent < threshold) {
    return {
      rule: "coverage-threshold",
      description: `Coverage (${changeset.testResults.coveragePercent.toFixed(1)}%) below threshold (${threshold}%)`,
      severity: "error",
    };
  }

  return null;
}

export function checkTestBudget(changeset: Changeset): GateViolation | null {
  if (changeset.testResults === undefined) return null;

  if (changeset.testResults.durationMs > TEST_DURATION_BUDGET_MS) {
    return {
      rule: "test-budget",
      description: `Test duration (${changeset.testResults.durationMs}ms) exceeds budget (${TEST_DURATION_BUDGET_MS}ms)`,
      severity: "warning", // Warning, not blocking
    };
  }

  return null;
}

// ─── Security Rules ───────────────────────────────────────────────────────────

export function checkSecurityScan(changeset: Changeset): GateViolation | null {
  if (changeset.securityScan === undefined) {
    return {
      rule: "security-scan-required",
      description: "Security scan results must be provided for DoD evaluation",
      severity: "warning", // Warning until security scanning is fully implemented
    };
  }

  if (changeset.securityScan.status === "flagged") {
    const errorFindings = changeset.securityScan.findings.filter(f => f.severity === "error");
    if (errorFindings.length > 0) {
      return {
        rule: "security-violations",
        description: `${errorFindings.length} security issue(s) detected: ${errorFindings.map(f => f.pattern).join(", ")}`,
        severity: "error",
      };
    }
  }

  return null;
}

// ─── Lint Rules ───────────────────────────────────────────────────────────────

export function checkLintErrors(changeset: Changeset): GateViolation | null {
  if (changeset.lintResults === undefined) return null;

  if (changeset.lintResults.errorCount > 0) {
    return {
      rule: "lint-errors",
      description: `${changeset.lintResults.errorCount} lint error(s) detected. Fix before merge.`,
      severity: "error",
    };
  }

  return null;
}

export function checkLintWarnings(changeset: Changeset): GateViolation | null {
  if (changeset.lintResults === undefined) return null;

  if (changeset.lintResults.warningCount > 0) {
    return {
      rule: "lint-warnings",
      description: `${changeset.lintResults.warningCount} lint warning(s) detected. Consider fixing.`,
      severity: "warning",
    };
  }

  return null;
}
```

### Step 5: Create DoD Validation Service

**Files:** `src/server/services/gates/dod-validation.ts` (create)

```typescript
import type { Changeset, GateResult, GateViolation } from "@/types/gates";
import {
  checkTestsPassing,
  checkNoSkippedTests,
  checkCoverage,
  checkTestBudget,
  checkSecurityScan,
  checkLintErrors,
  checkLintWarnings,
} from "./dod-rules";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

type RuleFunction = (changeset: Changeset) => GateViolation | null;

const DOD_RULES: readonly RuleFunction[] = [
  // Testing (highest priority)
  checkTestsPassing,
  checkNoSkippedTests,
  checkCoverage,
  checkTestBudget,
  // Security
  checkSecurityScan,
  // Lint
  checkLintErrors,
  checkLintWarnings,
];

/**
 * Evaluate a changeset against Definition of Done criteria.
 * Returns a GateResult with pass/fail status and any violations.
 */
export async function evaluateDoD(changeset: Changeset): Promise<GateResult> {
  logger.info(`Evaluating DoD for ${changeset.ticketRef}`);

  const violations: GateViolation[] = [];

  for (const rule of DOD_RULES) {
    const violation = rule(changeset);
    if (violation !== null) {
      violations.push(violation);
    }
  }

  const errors = violations.filter(v => v.severity === "error");
  const passed = errors.length === 0;

  logger.info(`DoD evaluation complete for ${changeset.ticketRef}`, {
    passed,
    errorCount: errors.length,
    warningCount: violations.length - errors.length,
  });

  return {
    gateType: "dod",
    ticketRef: changeset.ticketRef,
    passed,
    evaluatedAt: new Date().toISOString(),
    violations,
  };
}
```

### Step 6: Create audit logging helper

**Files:** `src/server/services/gates/audit.ts` (create)

```typescript
import type { Prisma } from "@prisma/client";
import type { GateResult } from "@/types/gates";
import { prisma } from "@/server/db/client";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

/**
 * Log a gate decision to the audit trail.
 * Every gate evaluation (pass or fail) is recorded for compliance.
 */
export async function logGateDecision(
  gateResult: GateResult,
  agentId?: string
): Promise<void> {
  const action = `gate.${gateResult.gateType}.${gateResult.passed ? "passed" : "failed"}`;

  logger.info(`Logging gate decision: ${action}`, {
    ticketRef: gateResult.ticketRef,
    violationCount: gateResult.violations.length,
  });

  await prisma.auditLog.create({
    data: {
      action,
      entityType: "pipeline",
      entityId: gateResult.ticketRef,
      agentId,
      payload: gateResult as unknown as Prisma.JsonObject,
    },
  });
}
```

### Step 7: Create gate service barrel export

**Files:** `src/server/services/gates/index.ts` (create)

```typescript
// ─── DoR Validation ───────────────────────────────────────────────────────────
export { evaluateDoR } from "./dor-validation";
export * from "./dor-rules";

// ─── DoD Validation ───────────────────────────────────────────────────────────
export { evaluateDoD } from "./dod-validation";
export * from "./dod-rules";

// ─── Audit ────────────────────────────────────────────────────────────────────
export { logGateDecision } from "./audit";
```

### Step 8: Create test fixtures factory

**Files:** `__fixtures__/gates.ts` (create)

```typescript
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { Changeset, TestResults, LintResults, SecurityScanResult } from "@/types/gates";

// ─── Jira Ticket Fixtures ─────────────────────────────────────────────────────

export function createValidTicket(overrides: Partial<JiraTicket> = {}): JiraTicket {
  return {
    id: "10001",
    key: "BELVA-042",
    summary: "Add approval dashboard component",
    description: `## Context
This ticket implements the approval card component.

## Requirements
- Display pending approvals in a card layout

## Out-of-Scope
- Approval history view
- Email notifications`,
    status: "Refinement",
    assignee: "agent-next-ux",
    labels: ["frontend", "dashboard"],
    storyPoints: 5,
    acceptanceCriteria: `GIVEN a user is authenticated
WHEN they navigate to /dashboard/approvals
THEN they see pending approval cards
AND each card shows ticket reference and risk level`,
    epicKey: "BELVA-001",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createBugTicket(overrides: Partial<JiraTicket> = {}): JiraTicket {
  return createValidTicket({
    key: "BELVA-099",
    summary: "Fix null state crash in agent registry",
    labels: ["bug", "backend"],
    description: `## Context
Agent registry crashes when accessed before initialization.

## Reproduction Steps
1. Start server
2. Call /api/agents before warmup

## Expected Behavior
Return empty list or 503

## Actual Behavior
Null pointer exception

## Out-of-Scope
- Performance optimization`,
    ...overrides,
  });
}

export function createInvalidTicket(overrides: Partial<JiraTicket> = {}): JiraTicket {
  return {
    id: "10002",
    key: "BELVA-043",
    summary: "A".repeat(150), // Too long
    description: "Vague description with no structure",
    status: "Backlog",
    assignee: null,
    labels: [],
    storyPoints: null, // Missing
    acceptanceCriteria: "It should work correctly", // No BDD format
    epicKey: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Changeset Fixtures ───────────────────────────────────────────────────────

export function createTestResults(overrides: Partial<TestResults> = {}): TestResults {
  return {
    passCount: 42,
    failCount: 0,
    skipCount: 0,
    coveragePercent: 85,
    durationMs: 1500,
    ...overrides,
  };
}

export function createLintResults(overrides: Partial<LintResults> = {}): LintResults {
  return {
    errorCount: 0,
    warningCount: 2,
    ...overrides,
  };
}

export function createSecurityScan(overrides: Partial<SecurityScanResult> = {}): SecurityScanResult {
  return {
    status: "clean",
    findings: [],
    scannedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createValidChangeset(overrides: Partial<Changeset> = {}): Changeset {
  return {
    ticketRef: "BELVA-042",
    branchName: "feature/BELVA-042-approval-dashboard",
    changedFiles: [
      "src/components/organisms/ApprovalCard.tsx",
      "src/app/dashboard/approvals/page.tsx",
    ],
    testResults: createTestResults(),
    lintResults: createLintResults(),
    securityScan: createSecurityScan(),
    ...overrides,
  };
}

export function createFailingChangeset(overrides: Partial<Changeset> = {}): Changeset {
  return createValidChangeset({
    testResults: createTestResults({ failCount: 3, skipCount: 1 }),
    lintResults: createLintResults({ errorCount: 5 }),
    securityScan: createSecurityScan({
      status: "flagged",
      findings: [
        {
          pattern: "HARDCODED_SECRET",
          file: "src/server/config.ts",
          line: 42,
          severity: "error",
          message: "Potential hardcoded API key detected",
        },
      ],
    }),
    ...overrides,
  });
}
```

## Testing Requirements

### Unit Tests

**File:** `__tests__/server/services/gates/dor-validation.test.ts`

```typescript
import { evaluateDoR } from "@/server/services/gates/dor-validation";
import { createValidTicket, createInvalidTicket, createBugTicket } from "@/../__fixtures__/gates";

describe("evaluateDoR", () => {
  describe("valid tickets", () => {
    it("passes ticket with all required fields", async () => {
      const result = await evaluateDoR(createValidTicket());
      expect(result.passed).toBe(true);
      expect(result.violations.filter(v => v.severity === "error")).toHaveLength(0);
    });

    it("passes bug ticket with reproduction steps", async () => {
      const result = await evaluateDoR(createBugTicket());
      expect(result.passed).toBe(true);
    });
  });

  describe("invalid tickets", () => {
    it("fails ticket missing BDD acceptance criteria", async () => {
      const ticket = createValidTicket({ acceptanceCriteria: "It should work" });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "bdd-format" })
      );
    });

    it("fails ticket without story points", async () => {
      const ticket = createValidTicket({ storyPoints: null });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "story-points-required" })
      );
    });

    it("fails ticket with invalid story point value", async () => {
      const ticket = createValidTicket({ storyPoints: 7 }); // Not Fibonacci
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "story-points-fibonacci" })
      );
    });

    it("fails bug ticket without reproduction steps", async () => {
      const ticket = createBugTicket({
        description: "Bug description without steps",
      });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
    });
  });

  describe("warnings", () => {
    it("generates warning for large story points but still passes", async () => {
      const ticket = createValidTicket({ storyPoints: 13 });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(true);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "story-points-large", severity: "warning" })
      );
    });
  });
});
```

**File:** `__tests__/server/services/gates/dod-validation.test.ts`

```typescript
import { evaluateDoD } from "@/server/services/gates/dod-validation";
import { createValidChangeset, createFailingChangeset, createTestResults } from "@/../__fixtures__/gates";

describe("evaluateDoD", () => {
  describe("valid changesets", () => {
    it("passes changeset with all requirements met", async () => {
      const result = await evaluateDoD(createValidChangeset());
      expect(result.passed).toBe(true);
    });
  });

  describe("test failures", () => {
    it("fails changeset with failing tests", async () => {
      const changeset = createValidChangeset({
        testResults: createTestResults({ failCount: 1 }),
      });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "tests-passing" })
      );
    });

    it("fails changeset with skipped tests", async () => {
      const changeset = createValidChangeset({
        testResults: createTestResults({ skipCount: 2 }),
      });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "no-skipped-tests" })
      );
    });

    it("fails changeset with insufficient coverage", async () => {
      const changeset = createValidChangeset({
        changedFiles: ["src/server/foo.ts"],
        testResults: createTestResults({ coveragePercent: 60 }),
      });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "coverage-threshold" })
      );
    });
  });

  describe("security violations", () => {
    it("fails changeset with security findings", async () => {
      const result = await evaluateDoD(createFailingChangeset());
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "security-violations" })
      );
    });
  });

  describe("warnings", () => {
    it("passes with lint warnings but includes them in violations", async () => {
      const changeset = createValidChangeset();
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(true);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "lint-warnings", severity: "warning" })
      );
    });
  });
});
```

**File:** `__tests__/server/services/gates/audit.test.ts`

```typescript
import { logGateDecision } from "@/server/services/gates/audit";
import { prisma } from "@/server/db/client";
import type { GateResult } from "@/types/gates";

// Mock Prisma
jest.mock("@/server/db/client", () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe("logGateDecision", () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("logs passing gate decision", async () => {
    const result: GateResult = {
      gateType: "dor",
      ticketRef: "BELVA-042",
      passed: true,
      evaluatedAt: "2026-03-11T10:00:00Z",
      violations: [],
    };

    await logGateDecision(result, "node-backend");

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "gate.dor.passed",
        entityType: "pipeline",
        entityId: "BELVA-042",
        agentId: "node-backend",
      }),
    });
  });

  it("logs failing gate decision with violations", async () => {
    const result: GateResult = {
      gateType: "dod",
      ticketRef: "BELVA-043",
      passed: false,
      evaluatedAt: "2026-03-11T10:00:00Z",
      violations: [
        { rule: "tests-passing", description: "2 tests failing", severity: "error" },
      ],
    };

    await logGateDecision(result);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "gate.dod.failed",
        payload: expect.objectContaining({
          violations: expect.arrayContaining([
            expect.objectContaining({ rule: "tests-passing" }),
          ]),
        }),
      }),
    });
  });
});
```

### Budget Constraints

- Unit test suite <3 seconds
- Zero skipped tests
- 80%+ coverage on `src/server/services/gates/`

## Files to Create

| Path | Purpose |
|------|---------|
| `src/types/gates.ts` | Extend with Changeset, TestResults, SecurityScan schemas |
| `src/server/services/gates/dor-rules.ts` | Individual DoR rule predicates |
| `src/server/services/gates/dor-validation.ts` | DoR evaluation service |
| `src/server/services/gates/dod-rules.ts` | Individual DoD rule predicates |
| `src/server/services/gates/dod-validation.ts` | DoD evaluation service |
| `src/server/services/gates/audit.ts` | Audit logging helper |
| `src/server/services/gates/index.ts` | Barrel export |
| `__fixtures__/gates.ts` | Test data factory functions |
| `__tests__/server/services/gates/dor-validation.test.ts` | DoR service tests |
| `__tests__/server/services/gates/dod-validation.test.ts` | DoD service tests |
| `__tests__/server/services/gates/audit.test.ts` | Audit logging tests |

## Acceptance Criteria

- [ ] `evaluateDoR(ticket)` validates BDD criteria, story points, out-of-scope section, bug-specific fields
- [ ] `evaluateDoD(changeset)` validates test results, coverage, security, lint errors
- [ ] Gate results use existing `GateResult` type from `src/types/gates.ts`
- [ ] `error` severity violations block gate; `warning` violations are informational
- [ ] Every gate evaluation logged to `AuditLog` with full result payload
- [ ] Individual rule predicates are exported for isolated testing
- [ ] Zero `any` types — all external data validated with Zod
- [ ] Unit tests pass within 3-second budget
- [ ] 80%+ line coverage on gate services
- [ ] Test fixtures provide typed factory functions for tickets and changesets

## Future Enhancements (Out of Scope)

| Enhancement | Rationale |
|-------------|-----------|
| `eslint-plugin-security` integration | More comprehensive security scanning |
| `npm audit` CI integration | Dependency vulnerability checking |
| Per-file coverage validation | Track coverage for specific changed files |
| Human override for warnings | Allow reviewers to dismiss warnings |
| Rule configuration from YAML | Load rules from external config |

## Dependencies

- **Depends on:** Plan 01 (Jira MCP — provides `JiraTicket` data for DoR evaluation)
- **Blocks:** Plan 04 (Orchestrator Core Loop — needs gate services), Plan 09 (Bug Pipeline — uses simplified DoR)

## Estimated Effort

1 conversation: services are pure validation logic with clear criteria from skill files. Rule-based design enables rapid implementation and testing.
