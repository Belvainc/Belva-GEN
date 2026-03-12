import type { Changeset, GateViolation } from "@/types/gates";

// ─── Coverage Thresholds (from testing-budgets.md) ────────────────────────────

const COVERAGE_THRESHOLD_SERVER = 80;
const COVERAGE_THRESHOLD_APP = 70;
const TEST_DURATION_BUDGET_MS = 3000;

// ─── Testing Rules ────────────────────────────────────────────────────────────

/**
 * Check that test results are provided for DoD evaluation.
 */
export function checkTestResultsProvided(
  changeset: Changeset
): GateViolation | null {
  if (changeset.testResults === undefined) {
    return {
      rule: "test-results-required",
      description: "Test results must be provided for DoD evaluation",
      severity: "error",
    };
  }

  return null;
}

/**
 * Check that all tests pass (no failures).
 */
export function checkTestsPassing(changeset: Changeset): GateViolation | null {
  if (changeset.testResults === undefined) {
    return null;
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

/**
 * Check that no tests are skipped (.skip(), .only(), .todo()).
 */
export function checkNoSkippedTests(
  changeset: Changeset
): GateViolation | null {
  if (changeset.testResults === undefined) {
    return null;
  }

  if (changeset.testResults.skipCount > 0) {
    return {
      rule: "no-skipped-tests",
      description: `${changeset.testResults.skipCount} skipped test(s) detected. Remove .skip()/.only()/.todo()`,
      severity: "error",
    };
  }

  return null;
}

/**
 * Check that coverage meets the threshold based on changed files.
 * Server files require 80%, app files require 70%.
 */
export function checkCoverage(changeset: Changeset): GateViolation | null {
  if (changeset.testResults === undefined) {
    return null;
  }

  // Determine threshold based on changed files
  const hasServerFiles = changeset.changedFiles.some(
    (f) => f.startsWith("src/server/") || f.startsWith("src/app/api/")
  );
  const threshold = hasServerFiles
    ? COVERAGE_THRESHOLD_SERVER
    : COVERAGE_THRESHOLD_APP;

  if (changeset.testResults.coveragePercent < threshold) {
    return {
      rule: "coverage-threshold",
      description: `Coverage (${changeset.testResults.coveragePercent.toFixed(1)}%) below threshold (${threshold}%)`,
      severity: "error",
    };
  }

  return null;
}

/**
 * Check that test duration is within budget (<3s).
 * Warning only — does not block merge.
 */
export function checkTestBudget(changeset: Changeset): GateViolation | null {
  if (changeset.testResults === undefined) {
    return null;
  }

  if (changeset.testResults.durationMs > TEST_DURATION_BUDGET_MS) {
    return {
      rule: "test-budget",
      description: `Test duration (${changeset.testResults.durationMs}ms) exceeds budget (${TEST_DURATION_BUDGET_MS}ms)`,
      severity: "warning",
    };
  }

  return null;
}

// ─── Security Rules ───────────────────────────────────────────────────────────

/**
 * Check security scan results for blocking violations.
 */
export function checkSecurityScan(changeset: Changeset): GateViolation | null {
  if (changeset.securityScan === undefined) {
    return {
      rule: "security-scan-required",
      description:
        "Security scan results must be provided for DoD evaluation",
      severity: "warning", // Warning until security scanning is fully implemented
    };
  }

  if (changeset.securityScan.status === "flagged") {
    const errorFindings = changeset.securityScan.findings.filter(
      (f) => f.severity === "error"
    );
    if (errorFindings.length > 0) {
      const patterns = errorFindings.map((f) => f.pattern).join(", ");
      return {
        rule: "security-violations",
        description: `${errorFindings.length} security issue(s) detected: ${patterns}`,
        severity: "error",
      };
    }
  }

  return null;
}

// ─── Lint Rules ───────────────────────────────────────────────────────────────

/**
 * Check that there are no lint errors.
 */
export function checkLintErrors(changeset: Changeset): GateViolation | null {
  if (changeset.lintResults === undefined) {
    return null;
  }

  if (changeset.lintResults.errorCount > 0) {
    return {
      rule: "lint-errors",
      description: `${changeset.lintResults.errorCount} lint error(s) detected. Fix before merge.`,
      severity: "error",
    };
  }

  return null;
}

/**
 * Check for lint warnings (informational only).
 */
export function checkLintWarnings(changeset: Changeset): GateViolation | null {
  if (changeset.lintResults === undefined) {
    return null;
  }

  if (changeset.lintResults.warningCount > 0) {
    return {
      rule: "lint-warnings",
      description: `${changeset.lintResults.warningCount} lint warning(s) detected. Consider fixing.`,
      severity: "warning",
    };
  }

  return null;
}
