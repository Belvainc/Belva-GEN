import type { JiraTicket } from "@/server/mcp/jira/types";
import type { GateResult, GateViolation } from "@/types/gates";
import {
  checkProblemStatement,
  checkValueHypothesis,
  checkOwnerAssigned,
  checkStrategicAlignment,
} from "./ideation-rules";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

type RuleFunction = (ticket: JiraTicket) => GateViolation | null;

/**
 * Ordered list of ideation validation rules.
 * Rules return GateViolation | null.
 */
const IDEATION_RULES: readonly RuleFunction[] = [
  // Business need articulation (critical)
  checkProblemStatement,
  checkValueHypothesis,
  // Ownership (must have an owner)
  checkOwnerAssigned,
  // Strategic alignment (warning only)
  checkStrategicAlignment,
];

/**
 * Evaluate a Jira ticket against Ideation criteria.
 *
 * Validates that the ticket has sufficient business justification
 * before requesting stakeholder approval:
 * - Problem statement or motivation clearly described
 * - Value hypothesis or expected business impact stated
 * - Owner assigned to drive the initiative
 * - Strategic alignment referenced (advisory)
 *
 * @param ticket - The Jira ticket to validate
 * @returns GateResult with pass/fail status and any violations
 */
export async function evaluateIdeation(
  ticket: JiraTicket
): Promise<GateResult> {
  logger.info(`Evaluating ideation gate for ${ticket.key}`);

  const violations: GateViolation[] = [];

  for (const rule of IDEATION_RULES) {
    const violation = rule(ticket);
    if (violation !== null) {
      violations.push(violation);
    }
  }

  const errors = violations.filter((v) => v.severity === "error");
  const passed = errors.length === 0;

  logger.info(`Ideation evaluation complete for ${ticket.key}`, {
    passed,
    errorCount: errors.length,
    warningCount: violations.length - errors.length,
  });

  return {
    gateType: "ideation",
    ticketRef: ticket.key,
    passed,
    evaluatedAt: new Date().toISOString(),
    violations,
  };
}
