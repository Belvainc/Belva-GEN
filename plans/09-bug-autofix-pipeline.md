# Plan 09: Stage 1 — Bug Auto-Fix Pipeline

## Overview

Implement the first production pipeline: automated bug fixes for low-complexity (1-2 point) tickets. This is the MVP that proves the entire system works end-to-end. The pipeline is simplified: Jira webhook → triage → lightweight DoR → single agent → iterative fix loop → test validation → PR creation → human merge. No heavy planning gates, no multi-agent coordination for simple bugs.

## Prerequisites

- Plan 01 complete: Jira MCP client can read tickets (`JiraTicket` flat type with `storyPoints`, `labels`, `description`)
- Plan 02 complete: DoR/DoD gate services implemented (pure async functions, typed rule predicates)
- Plan 04 complete: Orchestrator core loop functional (MessageBus dispatches `TaskAssignment`)
- Plan 05 complete: Service layer wired up (three-layer architecture)
- Plan 08 complete: Agent execution working (`AgentExecutor` interface, `MockAgentExecutor` / `ClaudeCodeExecutor`)

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Jira ticket type | `src/server/mcp/jira/types.ts` | `JiraTicket` — flat type with `summary`, `storyPoints`, `labels`, `description`, `acceptanceCriteria` |
| Agent protocol | `src/types/agent-protocol.ts` | `TaskAssignment` (sourceAgent, targetAgent, taskType, constraints, acceptanceCriteria), `TaskCompletion` (changedFiles, testRequirements, summary) |
| Gate types | `src/types/gates.ts` | `GateResult`, `GateViolation` (rule, description, severity), `Changeset`, `TestResults`, `LintResults`, `SecurityScanResult` |
| Orchestrator engine | `src/server/orchestrator/engine.ts` | Handles domain events, has `resolveAgent()` heuristic |
| State machine | `src/server/orchestrator/state-machine.ts` | Defines transitions with guards |
| Agent runner | `src/server/agents/runner.ts` | `executeTask()` is TODO — Plan 08 wires this |
| Execution types | `src/server/agents/execution/types.ts` | `ExecutionRequest`, `ExecutionResult`, `AgentExecutor` interface (Plan 08) |
| Slack client | `src/server/mcp/slack/client.ts` | `SlackNotificationClient.send(payload, signal?)` |
| Testing budgets | `.claude/rules/testing-budgets.md` | Unit <3s, E2E <60s, zero skipped |
| Bug writing skill | `.github/skills/bug-writing/SKILL.md` | Defines bug format |

## Scope

### In Scope

- Bug triage: identify low-complexity bugs (`JiraTicket` with `storyPoints ≤ 2`, `labels` includes `GEN`)
- Simplified DoR for bugs: reproduction steps exist, expected/actual defined (aligns with Plan 02 rule predicates)
- Single-agent assignment: route to appropriate agent via `resolveAgent()` heuristic
- Iterative fix loop: agent attempts fix → orchestrator validates → if fail, retry with error context
- Validation using existing `Changeset`, `TestResults`, `LintResults`, `SecurityScanResult` schemas
- PR creation via `@octokit/rest` (dependency added in Plan 08) — human merge required
- Safety rails: max retry attempts, total timeout, escalation to human review
- Slack notification on escalation via `SlackNotificationClient.send()`

### Out of Scope

- Auto-merge (human approval still required for merge per Critical Rule #5)
- Multi-agent coordination (single agent per bug)
- Dependency graph decomposition (bugs are atomic)
- Epic-level tracking (bugs are standalone)

## Research Questions — Resolved

### Q1: Story points field
**Answer:** `JiraTicket.storyPoints` is a flat `number | null` field, mapped from `customfield_10016` by `mapJiraApiIssueToTicket()` in `src/server/mcp/jira/types.ts`. No field ID lookup needed at the pipeline level.

### Q2: Auto-merge mechanism
**Answer:** We will NOT auto-merge. Per Critical Rule #5 ("Human approval required — no auto-merge, no timeout-to-approve"), the pipeline creates a PR via `@octokit/rest` and requests human review. The PR is created with squash-merge-ready metadata. A human merges via GitHub.

### Q3: Test execution model
**Answer:** The orchestrator runs validation after receiving `ExecutionResult` from the agent. This uses the existing `TestResults`, `LintResults`, and `SecurityScanResult` schemas from `src/types/gates.ts`. Validation commands run in the agent's git worktree (from Plan 08) via `child_process.execFile` with `AbortSignal.timeout()`.

### Q4: Security scan scope
**Answer:** Security scan checks for patterns defined in `SecurityFindingSchema`: hardcoded secrets, SQL injection patterns, eval() usage, etc. Results are validated with `SecurityScanResultSchema`. npm audit is run as a separate step. Both feed into the DoD gate.

### Q5: How does triage identify bug type?
**Answer:** `JiraTicket` has no `issueType` field in the flat schema — it's not mapped from the API response. **Gap:** Need to add `issueType: z.string()` to `JiraTicketSchema` and map from `fields.issuetype.name` in `mapJiraApiIssueToTicket()`. Alternatively, triage can use label-based heuristics (`labels.includes("Bug")`) until the field is added. **Decision:** Add `issueType` to the ticket type (Step 1).

### Q6: How does the bug pipeline integrate with existing orchestrator events?
**Answer:** The webhook worker (Plan 05) already publishes domain events. When a Jira ticket is created/updated with `GEN` label + Bug type + ≤2 points, the orchestrator's event handler routes to the bug pipeline. The pipeline publishes `TaskAssignment` to the MessageBus, which the `AgentRunner` (Plan 08) consumes.

## Gaps Identified During Research

| Gap | Resolution |
|-----|------------|
| `JiraTicket` lacks `issueType` field | Add `issueType: z.string()` to `JiraTicketSchema`, map from API response |
| `JiraApiFieldsSchema` lacks `issuetype` | Add `issuetype: z.object({ name: z.string() })` to API schema |
| No `TriageResult` type | Create in `src/server/orchestrator/triage.ts` with Zod schema |
| No bug-specific DoR rules | Create predicates that check `description` for repro steps, expected/actual (extend Plan 02 pattern) |
| No test execution utility | Create `src/server/lib/test-executor.ts` — runs jest/tsc/lint in a worktree |
| GitHub PR creation needs `@octokit/rest` | Already added as dependency in Plan 08 |
| `GITHUB_TOKEN` / `GITHUB_REPO` env vars | Already added in Plan 08 Step 1 |

## Architecture Decisions

### AD-01: Orchestrator validates, not agent

After receiving `ExecutionResult` from the `AgentExecutor`, the orchestrator runs test/lint/typecheck in the agent's worktree. This ensures consistent validation and allows the orchestrator to interpret results using the typed `TestResults` and `LintResults` schemas. Agents focus purely on code changes.

### AD-02: Iterative loop with context accumulation

Each retry builds an enriched `ExecutionRequest`:
1. Original `TaskAssignment` description + constraints
2. Previous attempt's `ExecutionResult.changedFiles` and `summary`
3. `TestResults.failCount` details and `LintResults.errorCount`
4. Agent's `domainPaths` narrowed to affected files

This context is serialized into `ExecutionRequest.priorResults` (string array) per the Plan 08 schema.

### AD-03: PR creation, NOT auto-merge

The pipeline creates a GitHub PR via Octokit with:
- Branch name: `fix/BELVA-XXX-auto-fix` per `git-safety.md` naming convention
- PR title: `fix(scope): description [BELVA-XXX]` per commit message format
- PR body: includes ticket link, agent summary, test results, changed files
- Labels: `auto-fix`, `GEN`
- Draft: false (ready for human review)

Human merges via GitHub. No auto-merge, no timeout-to-approve.

### AD-04: Bug-specific DoR (simplified gate)

Bug DoR checks (using Plan 02 rule predicate pattern):

| Rule | Field | Check |
|------|-------|-------|
| `checkBugReproSteps` | `ticket.description` | Contains "steps to reproduce" or numbered list |
| `checkBugExpectedActual` | `ticket.description` | Contains "expected" AND "actual" sections |
| `checkBugAffectedArea` | `ticket.description` | References file path or component name |
| `checkStoryPoints` | `ticket.storyPoints` | Present and ≤ 2 for auto-fix eligibility |
| `checkGENLabel` | `ticket.labels` | Includes "GEN" label |

Skip: BDD acceptance criteria (not applicable to bugs), dependency mapping (bugs are atomic).

### AD-05: Escalation path

When bug fix fails (max retries or timeout):
1. Publish `StatusUpdate` message via MessageBus
2. Send Slack notification via `SlackNotificationClient.send()` with webhook payload
3. Add Jira comment explaining failure + attempt count
4. Transition Jira ticket status to indicate manual review needed

## Implementation Steps

### Step 1: Add `issueType` to JiraTicket type

**Files:** `src/server/mcp/jira/types.ts` (modify)

Add `issuetype` to `JiraApiFieldsSchema`:
```typescript
issuetype: z.object({ name: z.string() }),
```

Add `issueType` to `JiraTicketSchema`:
```typescript
issueType: z.string().min(1),
```

Update `mapJiraApiIssueToTicket()`:
```typescript
issueType: fields.issuetype.name,
```

### Step 2: Create triage module

**Files:** `src/server/orchestrator/triage.ts` (create)

```typescript
import { z } from "zod";
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { AgentId, TaskType } from "@/types/agent-protocol";

export const TriageResultSchema = z.object({
  pipelineType: z.enum(["bug", "feature", "epic"]),
  complexity: z.enum(["low", "medium", "high"]),
  recommendedAgent: z.string(),
  recommendedTaskType: z.enum(["backend", "frontend", "testing", "documentation", "orchestration"]),
  bypassPlanningGate: z.boolean(),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

export function triageTicket(ticket: JiraTicket): TriageResult {
  const isBug = ticket.issueType.toLowerCase() === "bug";
  const points = ticket.storyPoints ?? 0;
  const hasGEN = ticket.labels.includes("GEN");

  if (isBug && points <= 2 && hasGEN) {
    const { agentId, taskType } = resolveAgentForBug(ticket);
    return {
      pipelineType: "bug",
      complexity: "low",
      recommendedAgent: agentId,
      recommendedTaskType: taskType,
      bypassPlanningGate: true,
    };
  }

  if (isBug && points <= 5) {
    const { agentId, taskType } = resolveAgentForBug(ticket);
    return {
      pipelineType: "bug",
      complexity: "medium",
      recommendedAgent: agentId,
      recommendedTaskType: taskType,
      bypassPlanningGate: false,
    };
  }

  if (points >= 40) {
    return {
      pipelineType: "epic",
      complexity: "high",
      recommendedAgent: "orchestrator-project",
      recommendedTaskType: "orchestration",
      bypassPlanningGate: false,
    };
  }

  return {
    pipelineType: "feature",
    complexity: points <= 5 ? "medium" : "high",
    recommendedAgent: "orchestrator-project",
    recommendedTaskType: "orchestration",
    bypassPlanningGate: false,
  };
}

function resolveAgentForBug(ticket: JiraTicket): { agentId: AgentId; taskType: TaskType } {
  const text = `${ticket.summary} ${ticket.description}`.toLowerCase();

  if (text.includes("src/server/") || text.includes("api") || text.includes("database")) {
    return { agentId: "node-backend", taskType: "backend" };
  }
  if (text.includes("src/components/") || text.includes("dashboard") || text.includes("ui")) {
    return { agentId: "next-ux", taskType: "frontend" };
  }
  if (text.includes("test") || text.includes("coverage") || text.includes("e2e")) {
    return { agentId: "ts-testing", taskType: "testing" };
  }

  return { agentId: "node-backend", taskType: "backend" };
}
```

### Step 3: Create bug-specific DoR rules

**Files:** `src/server/services/bug-dor.ts` (create)

Uses Plan 02 rule predicate pattern — each rule returns `GateViolation | null`:

```typescript
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { GateViolation, GateResult } from "@/types/gates";

// ─── Rule Predicates ─────────────────────────────────────────────────────────

export function checkBugReproSteps(ticket: JiraTicket): GateViolation | null {
  const patterns = [
    /steps to reproduce/i,
    /how to reproduce/i,
    /reproduction steps/i,
    /^\s*\d+\.\s+/m, // Numbered list in description
  ];
  const hasRepro = patterns.some((p) => p.test(ticket.description));
  return hasRepro
    ? null
    : { rule: "bug-repro-steps", description: "Bug report missing reproduction steps", severity: "error" };
}

export function checkBugExpectedActual(ticket: JiraTicket): GateViolation | null {
  const hasExpected = /expected(\s+behavior)?[:\s]/i.test(ticket.description);
  const hasActual = /actual(\s+behavior)?[:\s]/i.test(ticket.description);
  return hasExpected && hasActual
    ? null
    : { rule: "bug-expected-actual", description: "Bug report missing expected vs actual behavior", severity: "error" };
}

export function checkBugAffectedArea(ticket: JiraTicket): GateViolation | null {
  const patterns = [
    /affected (area|component|file)/i,
    /in\s+`?src\//,
    /component:\s*\w+/i,
    /file:\s*\S+/i,
  ];
  const hasArea = patterns.some((p) => p.test(ticket.description));
  return hasArea
    ? null
    : { rule: "bug-affected-area", description: "Bug report missing affected area/component", severity: "warning" };
}

export function checkBugStoryPoints(ticket: JiraTicket): GateViolation | null {
  if (ticket.storyPoints === null) {
    return { rule: "bug-story-points", description: "Bug ticket missing story point estimate", severity: "error" };
  }
  return null;
}

export function checkBugGENLabel(ticket: JiraTicket): GateViolation | null {
  return ticket.labels.includes("GEN")
    ? null
    : { rule: "bug-gen-label", description: "Bug ticket missing GEN label (not eligible for auto-fix)", severity: "error" };
}

// ─── Evaluate All Rules ──────────────────────────────────────────────────────

const BUG_DOR_RULES = [
  checkBugReproSteps,
  checkBugExpectedActual,
  checkBugAffectedArea,
  checkBugStoryPoints,
  checkBugGENLabel,
] as const;

export function evaluateBugDoR(ticket: JiraTicket): GateResult {
  const violations: GateViolation[] = [];
  for (const rule of BUG_DOR_RULES) {
    const violation = rule(ticket);
    if (violation !== null) {
      violations.push(violation);
    }
  }

  return {
    gateType: "dor",
    ticketRef: ticket.key,
    passed: violations.filter((v) => v.severity === "error").length === 0,
    evaluatedAt: new Date().toISOString(),
    violations,
  };
}
```

### Step 4: Create test execution utility

**Files:** `src/server/lib/test-executor.ts` (create)

Runs jest/tsc/lint in a specified directory (agent's git worktree) and returns typed results:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TestResults, LintResults, SecurityScanResult } from "@/types/gates";
import { createChildLogger } from "@/server/config/logger";

const execFileAsync = promisify(execFile);
const logger = createChildLogger({ module: "test-executor" });

export interface ValidationResult {
  testResults: TestResults;
  lintResults: LintResults;
  securityScan: SecurityScanResult;
  allPassed: boolean;
}

export async function validateWorktree(
  worktreePath: string,
  signal?: AbortSignal
): Promise<ValidationResult> {
  const [testResults, lintResults, securityScan] = await Promise.all([
    runJest(worktreePath, signal),
    runLint(worktreePath, signal),
    runSecurityScan(worktreePath, signal),
  ]);

  return {
    testResults,
    lintResults,
    securityScan,
    allPassed:
      testResults.failCount === 0 &&
      testResults.skipCount === 0 &&
      lintResults.errorCount === 0 &&
      securityScan.status === "clean",
  };
}

async function runJest(cwd: string, signal?: AbortSignal): Promise<TestResults> {
  const start = Date.now();
  try {
    const { stdout } = await execFileAsync(
      "npx", ["jest", "--json", "--passWithNoTests"],
      { cwd, signal, timeout: 180_000 }
    );
    const result: unknown = JSON.parse(stdout);
    // Validate with a minimal shape check (Jest JSON output)
    const parsed = result as {
      numPassedTests: number;
      numFailedTests: number;
      numPendingTests: number;
      success: boolean;
    };
    return {
      passCount: parsed.numPassedTests,
      failCount: parsed.numFailedTests,
      skipCount: parsed.numPendingTests,
      coveragePercent: 0, // Coverage requires --coverage flag
      durationMs: Date.now() - start,
    };
  } catch (error) {
    logger.error({ error }, "Jest execution failed");
    return { passCount: 0, failCount: 1, skipCount: 0, coveragePercent: 0, durationMs: Date.now() - start };
  }
}

async function runLint(cwd: string, signal?: AbortSignal): Promise<LintResults> {
  try {
    await execFileAsync("npx", ["eslint", ".", "--format", "json"], { cwd, signal, timeout: 60_000 });
    return { errorCount: 0, warningCount: 0 };
  } catch (error) {
    const output = (error as { stdout?: string }).stdout ?? "";
    try {
      const results: Array<{ errorCount: number; warningCount: number }> = JSON.parse(output);
      return {
        errorCount: results.reduce((sum, r) => sum + r.errorCount, 0),
        warningCount: results.reduce((sum, r) => sum + r.warningCount, 0),
      };
    } catch {
      return { errorCount: 1, warningCount: 0 };
    }
  }
}

async function runSecurityScan(cwd: string, signal?: AbortSignal): Promise<SecurityScanResult> {
  try {
    await execFileAsync("npm", ["audit", "--json"], { cwd, signal, timeout: 60_000 });
    return { status: "clean", findings: [], scannedAt: new Date().toISOString() };
  } catch (error) {
    const output = (error as { stdout?: string }).stdout ?? "";
    try {
      const audit = JSON.parse(output) as { vulnerabilities?: Record<string, unknown> };
      const vulnCount = Object.keys(audit.vulnerabilities ?? {}).length;
      return {
        status: vulnCount > 0 ? "flagged" : "clean",
        findings: vulnCount > 0
          ? [{ pattern: "npm-audit", file: "package.json", severity: "warning" as const, message: `${vulnCount} vulnerabilities found` }]
          : [],
        scannedAt: new Date().toISOString(),
      };
    } catch {
      return { status: "clean", findings: [], scannedAt: new Date().toISOString() };
    }
  }
}
```

### Step 5: Implement bug fix loop

**Files:** `src/server/orchestrator/bug-pipeline.ts` (create)

```typescript
import { z } from "zod";
import type { ExecutionRequest, ExecutionResult, AgentExecutor } from "@/server/agents/execution/types";
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { TriageResult } from "./triage";
import type { ValidationResult } from "@/server/lib/test-executor";
import { validateWorktree } from "@/server/lib/test-executor";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "bug-pipeline" });

export const BugFixConfigSchema = z.object({
  maxRetries: z.number().int().positive().default(3),
  totalTimeoutMs: z.number().int().positive().default(30 * 60 * 1000),
});
export type BugFixConfig = z.infer<typeof BugFixConfigSchema>;

export const BugFixAttemptSchema = z.object({
  attemptNumber: z.number().int().positive(),
  executionResult: z.custom<ExecutionResult>(),
  validationResult: z.custom<ValidationResult>(),
  timestamp: z.string().datetime(),
});
export type BugFixAttempt = z.infer<typeof BugFixAttemptSchema>;

export interface BugFixResult {
  status: "success" | "max_retries" | "timeout";
  attempts: BugFixAttempt[];
  finalExecution: ExecutionResult | null;
  finalValidation: ValidationResult | null;
  escalate: boolean;
}

export async function runBugFixLoop(
  ticket: JiraTicket,
  triage: TriageResult,
  systemPrompt: string,
  executor: AgentExecutor,
  worktreePath: string,
  config: BugFixConfig = BugFixConfigSchema.parse({}),
  signal?: AbortSignal,
): Promise<BugFixResult> {
  const attempts: BugFixAttempt[] = [];
  const startTime = Date.now();

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    // Check total timeout
    if (Date.now() - startTime > config.totalTimeoutMs) {
      logger.warn({ ticketRef: ticket.key, attempt }, "Bug fix loop timed out");
      return { status: "timeout", attempts, finalExecution: null, finalValidation: null, escalate: true };
    }

    signal?.throwIfAborted();

    // Build execution request with context from prior attempts
    const request: ExecutionRequest = {
      taskId: crypto.randomUUID(),
      agentId: triage.recommendedAgent as ExecutionRequest["agentId"],
      taskType: triage.recommendedTaskType as ExecutionRequest["taskType"],
      ticketRef: ticket.key,
      description: buildBugFixDescription(ticket, attempts),
      constraints: [
        `Only modify files within agent domain`,
        `Follow existing code patterns and conventions`,
        `Include inline comments for non-obvious changes`,
      ],
      acceptanceCriteria: [
        `Bug described in ticket is fixed`,
        `All existing tests continue to pass`,
        `No new lint or type errors introduced`,
      ],
      domainPaths: [], // Populated by executor from agent config
      systemPrompt,
      priorResults: attempts.map((a) =>
        `Attempt ${a.attemptNumber}: ${a.executionResult.status} — ${a.executionResult.summary}. ` +
        `Tests: ${a.validationResult.testResults.failCount} failures, ` +
        `Lint: ${a.validationResult.lintResults.errorCount} errors`
      ),
      timeoutMs: Math.min(600_000, config.totalTimeoutMs - (Date.now() - startTime)),
    };

    // Execute agent
    const executionResult = await executor.execute(request, signal);

    // Validate in worktree
    const validationResult = await validateWorktree(worktreePath, signal);

    const attemptRecord: BugFixAttempt = {
      attemptNumber: attempt,
      executionResult,
      validationResult,
      timestamp: new Date().toISOString(),
    };
    attempts.push(attemptRecord);

    logger.info(
      { ticketRef: ticket.key, attempt, passed: validationResult.allPassed },
      "Bug fix attempt completed"
    );

    if (validationResult.allPassed && executionResult.status === "completed") {
      return {
        status: "success",
        attempts,
        finalExecution: executionResult,
        finalValidation: validationResult,
        escalate: false,
      };
    }
  }

  return {
    status: "max_retries",
    attempts,
    finalExecution: attempts.at(-1)?.executionResult ?? null,
    finalValidation: attempts.at(-1)?.validationResult ?? null,
    escalate: true,
  };
}

function buildBugFixDescription(ticket: JiraTicket, priorAttempts: BugFixAttempt[]): string {
  let description = `Fix bug: ${ticket.summary}\n\n`;
  description += `## Bug Description\n${ticket.description}\n\n`;

  if (ticket.acceptanceCriteria) {
    description += `## Acceptance Criteria\n${ticket.acceptanceCriteria}\n\n`;
  }

  if (priorAttempts.length > 0) {
    description += `## Prior Attempts (${priorAttempts.length} so far)\n`;
    for (const attempt of priorAttempts) {
      description += `### Attempt ${attempt.attemptNumber}\n`;
      description += `- Status: ${attempt.executionResult.status}\n`;
      description += `- Changed files: ${attempt.executionResult.changedFiles.join(", ") || "none"}\n`;
      description += `- Test failures: ${attempt.validationResult.testResults.failCount}\n`;
      description += `- Lint errors: ${attempt.validationResult.lintResults.errorCount}\n`;
      description += `- Summary: ${attempt.executionResult.summary}\n\n`;
    }
    description += `Fix the issues from the previous attempt(s). Do NOT repeat the same approach if it failed.\n`;
  }

  return description;
}
```

### Step 6: Create PR service

**Files:** `src/server/services/pr.service.ts` (create)

```typescript
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { getEnv } from "@/server/config/env";
import { createChildLogger } from "@/server/config/logger";
import { withRetry } from "@/server/lib/retry";

const logger = createChildLogger({ module: "pr-service" });

export const PRRequestSchema = z.object({
  ticketRef: z.string().min(1),
  branch: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  labels: z.array(z.string()).default([]),
});
export type PRRequest = z.infer<typeof PRRequestSchema>;

export const PRResultSchema = z.object({
  prNumber: z.number().int().positive(),
  prUrl: z.string().url(),
  branch: z.string(),
});
export type PRResult = z.infer<typeof PRResultSchema>;

export async function createPullRequest(
  request: PRRequest,
  signal?: AbortSignal
): Promise<PRResult> {
  const env = getEnv();

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPO must be configured for PR creation");
  }

  const [owner, repo] = env.GITHUB_REPO.split("/");
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });

  const pr = await withRetry(
    async () => {
      signal?.throwIfAborted();
      const { data } = await octokit.pulls.create({
        owner,
        repo,
        title: `fix: ${request.title} [${request.ticketRef}]`,
        body: request.body,
        head: request.branch,
        base: "main",
      });
      return data;
    },
    { maxAttempts: 3, baseDelayMs: 1000, signal }
  );

  // Add labels if provided
  if (request.labels.length > 0) {
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: pr.number,
      labels: request.labels,
    });
  }

  logger.info({ prNumber: pr.number, ticketRef: request.ticketRef }, "Pull request created");

  return {
    prNumber: pr.number,
    prUrl: pr.html_url,
    branch: request.branch,
  };
}

export function buildPRBody(
  ticketRef: string,
  summary: string,
  changedFiles: string[],
  attemptCount: number
): string {
  return [
    `## Summary`,
    summary,
    ``,
    `## Changed Files`,
    ...changedFiles.map((f) => `- \`${f}\``),
    ``,
    `## Details`,
    `- Ticket: ${ticketRef}`,
    `- Auto-fix attempts: ${attemptCount}`,
    `- Pipeline: Bug Auto-Fix (Plan 09)`,
    ``,
    `## Test Plan`,
    `- [ ] All unit tests pass`,
    `- [ ] No new lint errors`,
    `- [ ] No security findings`,
    `- [ ] Changed files are within agent's domain`,
    ``,
    `> Generated by Belva-GEN bug auto-fix pipeline`,
  ].join("\n");
}
```

### Step 7: Wire bug pipeline into orchestrator

**Files:** `src/server/orchestrator/engine.ts` (modify)

Add bug pipeline handling in the DoR-pass event handler:

```typescript
import { triageTicket } from "./triage";
import { evaluateBugDoR } from "@/server/services/bug-dor";
import { runBugFixLoop } from "./bug-pipeline";
import { createPullRequest, buildPRBody } from "@/server/services/pr.service";
import { getExecutor } from "@/server/agents/execution";
import { composeSystemPrompt } from "@/server/agents/execution/prompt-composer";

// In onDoRPass handler:
private async onDoRPass(event: DomainEvent & { kind: "dor-pass" }): Promise<void> {
  const ticket = await this.jiraClient.getTicket(event.ticketRef);
  const triage = triageTicket(ticket);

  if (triage.pipelineType === "bug" && triage.bypassPlanningGate) {
    // Validate bug-specific DoR
    const bugDoR = evaluateBugDoR(ticket);
    if (!bugDoR.passed) {
      await this.messageBus.publish({
        kind: "gate-check-result",
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        sourceAgent: "orchestrator-project",
        gateType: "dor",
        ticketRef: event.ticketRef,
        passed: false,
        violations: bugDoR.violations,
      });
      return;
    }

    // Execute bug fix pipeline
    await this.executeBugPipeline(ticket, triage);
  } else {
    // Standard planning + approval flow (Plan 10)
    await this.executeStandardPipeline(event.ticketRef, ticket);
  }
}

private async executeBugPipeline(ticket: JiraTicket, triage: TriageResult): Promise<void> {
  const executor = getExecutor();
  const systemPrompt = await composeSystemPrompt(
    triage.recommendedAgent as AgentId,
    [] // Agent's ownedPaths resolved by executor
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);

  try {
    const result = await runBugFixLoop(
      ticket,
      triage,
      systemPrompt,
      executor,
      "/tmp/worktrees/" + ticket.key, // Worktree path from Plan 08
      undefined,
      controller.signal,
    );

    if (result.status === "success" && result.finalExecution) {
      const branch = `fix/${ticket.key.toLowerCase()}-auto-fix`;
      const prResult = await createPullRequest({
        ticketRef: ticket.key,
        branch,
        title: ticket.summary,
        body: buildPRBody(
          ticket.key,
          result.finalExecution.summary,
          result.finalExecution.changedFiles,
          result.attempts.length,
        ),
        labels: ["auto-fix", "GEN"],
      });

      // Update Jira
      await this.jiraClient.addComment(
        ticket.key,
        `PR created for auto-fix: ${prResult.prUrl} (${result.attempts.length} attempt(s))`
      );

      // Publish status update
      await this.messageBus.publish({
        kind: "status-update",
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        sourceAgent: "orchestrator-project",
        ticketRef: ticket.key,
        status: "pr-created",
        details: `PR #${prResult.prNumber} ready for human review`,
      });
    } else if (result.escalate) {
      await this.escalateBugToHuman(ticket.key, result);
    }
  } finally {
    clearTimeout(timeout);
  }
}

private async escalateBugToHuman(ticketRef: string, result: BugFixResult): Promise<void> {
  const reason = `Bug fix ${result.status} after ${result.attempts.length} attempt(s)`;

  // Slack notification
  await this.slackClient.send({
    text: `Bug ${ticketRef} requires human review: ${reason}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Bug ${ticketRef} - Escalated*\n${reason}\nAttempts: ${result.attempts.length}`,
        },
      },
    ],
  });

  // Jira comment
  await this.jiraClient.addComment(
    ticketRef,
    `Automated fix unsuccessful. Escalated for human review.\nReason: ${reason}`
  );
}
```

## Files to Create/Modify

| Path | Action | Purpose |
|------|--------|---------|
| `src/server/mcp/jira/types.ts` | Modify | Add `issueType` to `JiraTicketSchema` and `issuetype` to `JiraApiFieldsSchema` |
| `src/server/orchestrator/triage.ts` | Create | `triageTicket()` — classify ticket → pipeline type + agent assignment |
| `src/server/services/bug-dor.ts` | Create | Bug-specific DoR rules (repro steps, expected/actual, affected area) |
| `src/server/lib/test-executor.ts` | Create | `validateWorktree()` — run jest/lint/security in a directory |
| `src/server/orchestrator/bug-pipeline.ts` | Create | `runBugFixLoop()` — iterative agent execution with validation |
| `src/server/services/pr.service.ts` | Create | `createPullRequest()` via Octokit + PR body builder |
| `src/server/orchestrator/engine.ts` | Modify | Wire `onDoRPass` → triage → bug pipeline |

## Testing Requirements

### Unit Tests

- `__tests__/server/orchestrator/triage.test.ts`
  - Test bug identification: `issueType === "Bug"`, `storyPoints ≤ 2`, `labels.includes("GEN")`
  - Test agent selection heuristics (backend, frontend, testing keywords)
  - Test feature/epic classification thresholds
  - Test edge cases: null storyPoints, missing labels

- `__tests__/server/services/bug-dor.test.ts`
  - Test each rule predicate independently: `checkBugReproSteps`, `checkBugExpectedActual`, etc.
  - Test `evaluateBugDoR()` aggregation (errors block, warnings pass)
  - Test with minimal valid bug ticket
  - Test with missing description sections

- `__tests__/server/orchestrator/bug-pipeline.test.ts`
  - Test `runBugFixLoop()` with `MockAgentExecutor`
  - Test success on first attempt
  - Test success after N retries with accumulated context
  - Test max retries escalation
  - Test timeout handling
  - Test `buildBugFixDescription()` includes prior attempt details

- `__tests__/server/services/pr.service.test.ts`
  - Test `createPullRequest()` with mocked Octokit
  - Test `buildPRBody()` output format
  - Test error handling when GitHub credentials missing

- `__tests__/server/lib/test-executor.test.ts`
  - Test `validateWorktree()` with mocked child_process
  - Test Jest result parsing (pass, fail, timeout)
  - Test lint result parsing
  - Test security scan result parsing

### Budget Constraints

- Unit tests <3 seconds (mock executor, no real subprocess calls)
- 80%+ coverage on `src/server/orchestrator/bug-pipeline.ts`, `src/server/services/bug-dor.ts`, `src/server/orchestrator/triage.ts`

## Acceptance Criteria

- [ ] `JiraTicket` includes `issueType` field mapped from Jira API
- [ ] `triageTicket()` correctly classifies bug/feature/epic based on `issueType`, `storyPoints`, `labels`
- [ ] Bug DoR rules validate reproduction steps, expected/actual, affected area, story points, GEN label
- [ ] `evaluateBugDoR()` returns typed `GateResult` with `GateViolation[]`
- [ ] `runBugFixLoop()` executes agent via `AgentExecutor` interface
- [ ] Iterative loop accumulates error context in `ExecutionRequest.priorResults`
- [ ] `validateWorktree()` returns typed `TestResults`, `LintResults`, `SecurityScanResult`
- [ ] PR created via `@octokit/rest` with proper branch naming (`fix/BELVA-XXX-auto-fix`)
- [ ] PR body includes ticket reference, summary, changed files, attempt count
- [ ] Escalation sends Slack notification via `SlackNotificationClient.send()`
- [ ] Escalation adds Jira comment explaining failure
- [ ] `StatusUpdate` message published to MessageBus on PR creation
- [ ] Zero `any` types — all external data validated with Zod
- [ ] All unit tests pass within 3s budget

## Dependencies

- **Depends on:** Plans 01, 02, 04, 05, 08
- **Blocks:** Plan 10 (validates system before scaling up)
- **DevOps:** DEVOPS-NEEDS #5 (Anthropic API key), GitHub token

## Estimated Conversations

2-3 conversations:
1. Jira type update + triage + bug DoR rules + tests
2. Bug fix loop + test executor + PR service + tests
3. Orchestrator wiring + integration testing

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent produces invalid code repeatedly | Medium — max retries hit | Context accumulation helps agent learn from failures; escalation to human |
| Test execution in worktree is slow | Medium — loop takes too long | Run only affected tests via `--findRelatedTests`; timeout per step |
| GitHub API rate limits | Low — few PRs per day | `withRetry()` with exponential backoff; monitor rate limit headers |
| JiraTicket missing `issueType` field | High — triage fails | Added as Step 1; validated by Zod schema |
| Security scan false positives | Low — blocks valid fixes | Security findings are warnings, not errors by default |
