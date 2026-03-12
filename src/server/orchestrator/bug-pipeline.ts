import { z } from "zod";
import type {
  AgentExecutor,
  ExecutionRequest,
  ExecutionResult,
} from "@/server/agents/execution/types";
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { TriageResult } from "./triage";
import type { ValidationResult } from "@/server/lib/test-executor";
import { validateWorktree } from "@/server/lib/test-executor";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "bug-pipeline" });

// ─── Config ─────────────────────────────────────────────────────────────────

export const BugFixConfigSchema = z.object({
  maxRetries: z.number().int().positive().default(3),
  totalTimeoutMs: z
    .number()
    .int()
    .positive()
    .default(30 * 60 * 1000),
});
export type BugFixConfig = z.infer<typeof BugFixConfigSchema>;

// ─── Attempt Record ─────────────────────────────────────────────────────────

export interface BugFixAttempt {
  attemptNumber: number;
  executionResult: ExecutionResult;
  validationResult: ValidationResult;
  timestamp: string;
}

// ─── Result ─────────────────────────────────────────────────────────────────

export interface BugFixResult {
  status: "success" | "max_retries" | "timeout";
  attempts: BugFixAttempt[];
  finalExecution: ExecutionResult | null;
  finalValidation: ValidationResult | null;
  escalate: boolean;
}

// ─── Bug Fix Loop ───────────────────────────────────────────────────────────

/**
 * Execute the iterative bug fix loop:
 * 1. Agent attempts fix
 * 2. Orchestrator validates (tests, lint, security)
 * 3. If fail, retry with accumulated error context
 * 4. After maxRetries, escalate to human
 */
export async function runBugFixLoop(
  ticket: JiraTicket,
  triage: TriageResult,
  systemPrompt: string,
  executor: AgentExecutor,
  worktreePath: string,
  config: BugFixConfig = BugFixConfigSchema.parse({}),
  signal?: AbortSignal
): Promise<BugFixResult> {
  const attempts: BugFixAttempt[] = [];
  const startTime = Date.now();

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    // Check total timeout
    if (Date.now() - startTime > config.totalTimeoutMs) {
      logger.warn(
        { ticketRef: ticket.key, attempt },
        "Bug fix loop timed out"
      );
      return {
        status: "timeout",
        attempts,
        finalExecution: null,
        finalValidation: null,
        escalate: true,
      };
    }

    signal?.throwIfAborted();

    // Build execution request with context from prior attempts
    const request: ExecutionRequest = {
      taskId: crypto.randomUUID(),
      agentId: triage.recommendedAgent as ExecutionRequest["agentId"],
      taskType:
        triage.recommendedTaskType as ExecutionRequest["taskType"],
      ticketRef: ticket.key,
      description: buildBugFixDescription(ticket, attempts),
      constraints: [
        "Only modify files within agent domain",
        "Follow existing code patterns and conventions",
        "Include inline comments for non-obvious changes",
      ],
      acceptanceCriteria: [
        "Bug described in ticket is fixed",
        "All existing tests continue to pass",
        "No new lint or type errors introduced",
      ],
      domainPaths: [],
      systemPrompt,
      priorResults: attempts.map(
        (a) =>
          `Attempt ${a.attemptNumber}: ${a.executionResult.status} — ` +
          `${a.executionResult.summary}. ` +
          `Tests: ${a.validationResult.testResults.failCount} failures, ` +
          `Lint: ${a.validationResult.lintResults.errorCount} errors`
      ),
      timeoutMs: Math.min(
        600_000,
        config.totalTimeoutMs - (Date.now() - startTime)
      ),
    };

    // Execute agent
    const executionResult = await executor.execute(request, signal);

    // Validate in worktree
    const validationResult = await validateWorktree(
      worktreePath,
      signal
    );

    const attemptRecord: BugFixAttempt = {
      attemptNumber: attempt,
      executionResult,
      validationResult,
      timestamp: new Date().toISOString(),
    };
    attempts.push(attemptRecord);

    logger.info(
      {
        ticketRef: ticket.key,
        attempt,
        passed: validationResult.allPassed,
        status: executionResult.status,
      },
      "Bug fix attempt completed"
    );

    if (
      validationResult.allPassed &&
      executionResult.status === "completed"
    ) {
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

// ─── Description Builder ────────────────────────────────────────────────────

function buildBugFixDescription(
  ticket: JiraTicket,
  priorAttempts: BugFixAttempt[]
): string {
  const sections: string[] = [
    `Fix bug: ${ticket.summary}`,
    "",
    "## Bug Description",
    ticket.description,
  ];

  if (ticket.acceptanceCriteria) {
    sections.push("", "## Acceptance Criteria", ticket.acceptanceCriteria);
  }

  if (priorAttempts.length > 0) {
    sections.push(
      "",
      `## Prior Attempts (${priorAttempts.length} so far)`
    );
    for (const attempt of priorAttempts) {
      sections.push(
        `### Attempt ${attempt.attemptNumber}`,
        `- Status: ${attempt.executionResult.status}`,
        `- Changed files: ${attempt.executionResult.changedFiles.join(", ") || "none"}`,
        `- Test failures: ${attempt.validationResult.testResults.failCount}`,
        `- Lint errors: ${attempt.validationResult.lintResults.errorCount}`,
        `- Summary: ${attempt.executionResult.summary}`,
        ""
      );
    }
    sections.push(
      "Fix the issues from the previous attempt(s). Do NOT repeat the same approach if it failed."
    );
  }

  return sections.join("\n");
}
