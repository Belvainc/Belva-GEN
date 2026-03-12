import type { Changeset, GateResult, GateViolation } from "@/types/gates";
import {
  checkTestResultsProvided,
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

/**
 * Ordered list of DoD validation rules.
 * Rules return GateViolation | null.
 */
const DOD_RULES: readonly RuleFunction[] = [
  // Testing (highest priority — must have test results)
  checkTestResultsProvided,
  checkTestsPassing,
  checkNoSkippedTests,
  checkCoverage,
  checkTestBudget, // Warning only
  // Security
  checkSecurityScan,
  // Lint
  checkLintErrors,
  checkLintWarnings, // Warning only
];

/**
 * Evaluate a changeset against Definition of Done criteria.
 *
 * Validation criteria (from .github/skills/dod-validation/SKILL.md):
 * - Testing: all tests pass, no skipped tests, coverage meets threshold
 * - Security: no critical/high findings in security scan
 * - Lint: no lint errors (warnings are informational)
 *
 * The changeset must include pre-computed test results from the CI/worker.
 * This service validates the results — it does not run tests itself.
 *
 * @param changeset - The changeset with test/lint/security results
 * @returns GateResult with pass/fail status and any violations
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

  const errors = violations.filter((v) => v.severity === "error");
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
