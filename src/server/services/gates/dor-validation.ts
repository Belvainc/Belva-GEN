import type { JiraTicket } from "@/server/mcp/jira/types";
import type { GateResult, GateViolation } from "@/types/gates";
import {
  checkBDDFormat,
  checkStoryPoints,
  checkStoryPointsWarning,
  checkOutOfScope,
  checkTitleLength,
  checkBugReproductionSteps,
  checkBugExpectedActual,
  checkDependenciesIdentified,
  checkTeamAssigned,
} from "./dor-rules";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

type RuleFunction = (ticket: JiraTicket) => GateViolation | null;

/**
 * Ordered list of DoR validation rules.
 * Rules return GateViolation | null.
 */
const DOR_RULES: readonly RuleFunction[] = [
  // BDD format (critical — acceptance criteria structure)
  checkBDDFormat,
  // Story points (required for planning)
  checkStoryPoints,
  checkStoryPointsWarning, // Warning only
  // Scope clarity (required sections)
  checkOutOfScope,
  checkTitleLength,
  // Bug-specific (only applies to bug tickets)
  checkBugReproductionSteps,
  checkBugExpectedActual,
  // Dependencies and team ownership (Stage 2: Ready)
  checkDependenciesIdentified,
  checkTeamAssigned,
];

/**
 * Evaluate a Jira ticket against Definition of Ready criteria.
 *
 * Validation criteria (from .github/skills/dor-validation/SKILL.md):
 * - BDD format: acceptance criteria must follow Given/When/Then
 * - Story points: must be Fibonacci (1, 2, 3, 5, 8, 13)
 * - Out-of-scope: description must include this section
 * - Bug-specific: reproduction steps and expected/actual behavior
 *
 * @param ticket - The Jira ticket to validate
 * @returns GateResult with pass/fail status and any violations
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

  const errors = violations.filter((v) => v.severity === "error");
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
