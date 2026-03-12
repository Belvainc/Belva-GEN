import type { JiraTicket } from "@/server/mcp/jira/types";
import type {
  Changeset,
  TestResults,
  LintResults,
  SecurityScanResult,
} from "@/types/gates";

// ─── Jira Ticket Fixtures ─────────────────────────────────────────────────────

/**
 * Create a valid Jira ticket that passes all DoR checks.
 */
export function createValidTicket(
  overrides: Partial<JiraTicket> = {}
): JiraTicket {
  return {
    id: "10001",
    key: "BELVA-042",
    summary: "Add approval dashboard component",
    issueType: "Story",
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

/**
 * Create a valid bug ticket that passes all DoR checks.
 */
export function createBugTicket(
  overrides: Partial<JiraTicket> = {}
): JiraTicket {
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

/**
 * Create an invalid ticket that fails multiple DoR checks.
 */
export function createInvalidTicket(
  overrides: Partial<JiraTicket> = {}
): JiraTicket {
  return {
    id: "10002",
    key: "BELVA-043",
    summary: "A".repeat(150), // Too long (>100 chars)
    issueType: "Task",
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

/**
 * Create valid test results that pass all DoD checks.
 */
export function createTestResults(
  overrides: Partial<TestResults> = {}
): TestResults {
  return {
    passCount: 42,
    failCount: 0,
    skipCount: 0,
    coveragePercent: 85,
    durationMs: 1500,
    ...overrides,
  };
}

/**
 * Create lint results (default: no errors, some warnings).
 */
export function createLintResults(
  overrides: Partial<LintResults> = {}
): LintResults {
  return {
    errorCount: 0,
    warningCount: 2,
    ...overrides,
  };
}

/**
 * Create a clean security scan result.
 */
export function createSecurityScan(
  overrides: Partial<SecurityScanResult> = {}
): SecurityScanResult {
  return {
    status: "clean",
    findings: [],
    scannedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a valid changeset that passes all DoD checks.
 */
export function createValidChangeset(
  overrides: Partial<Changeset> = {}
): Changeset {
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

/**
 * Create a changeset that fails multiple DoD checks.
 */
export function createFailingChangeset(
  overrides: Partial<Changeset> = {}
): Changeset {
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
