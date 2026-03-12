import { evaluateDoD } from "@/server/services/gates/dod-validation";
import {
  checkTestResultsProvided,
  checkTestsPassing,
  checkNoSkippedTests,
  checkCoverage,
  checkTestBudget,
  checkSecurityScan,
  checkLintErrors,
  checkLintWarnings,
} from "@/server/services/gates/dod-rules";
import {
  createValidChangeset,
  createFailingChangeset,
  createTestResults,
  createLintResults,
  createSecurityScan,
} from "@/../__fixtures__/gates";

describe("evaluateDoD", () => {
  describe("valid changesets", () => {
    it("passes changeset with all requirements met", async () => {
      const result = await evaluateDoD(createValidChangeset());
      expect(result.passed).toBe(true);
      expect(result.gateType).toBe("dod");
    });

    it("includes ticketRef in result", async () => {
      const changeset = createValidChangeset({ ticketRef: "BELVA-999" });
      const result = await evaluateDoD(changeset);
      expect(result.ticketRef).toBe("BELVA-999");
    });

    it("includes evaluatedAt timestamp", async () => {
      const result = await evaluateDoD(createValidChangeset());
      expect(result.evaluatedAt).toBeDefined();
      expect(() => new Date(result.evaluatedAt)).not.toThrow();
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

    it("fails changeset with insufficient coverage for server files", async () => {
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

    it("fails changeset with insufficient coverage for app files", async () => {
      const changeset = createValidChangeset({
        changedFiles: ["src/app/dashboard/page.tsx"],
        testResults: createTestResults({ coveragePercent: 60 }),
      });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "coverage-threshold" })
      );
    });

    it("fails changeset without test results", async () => {
      const changeset = createValidChangeset({ testResults: undefined });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "test-results-required" })
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

    it("passes when security scan has only warnings", async () => {
      const changeset = createValidChangeset({
        securityScan: createSecurityScan({
          status: "flagged",
          findings: [
            {
              pattern: "WEAK_HASH",
              file: "src/lib/hash.ts",
              severity: "warning",
              message: "Consider using stronger hash",
            },
          ],
        }),
      });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(true);
    });
  });

  describe("lint errors", () => {
    it("fails changeset with lint errors", async () => {
      const changeset = createValidChangeset({
        lintResults: createLintResults({ errorCount: 3 }),
      });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "lint-errors" })
      );
    });
  });

  describe("warnings", () => {
    it("passes with lint warnings but includes them in violations", async () => {
      const changeset = createValidChangeset({
        lintResults: createLintResults({ errorCount: 0, warningCount: 5 }),
      });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(true);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "lint-warnings", severity: "warning" })
      );
    });

    it("passes with test budget warning but includes it in violations", async () => {
      const changeset = createValidChangeset({
        testResults: createTestResults({ durationMs: 5000 }),
      });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(true);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "test-budget", severity: "warning" })
      );
    });

    it("generates warning when security scan missing", async () => {
      const changeset = createValidChangeset({ securityScan: undefined });
      const result = await evaluateDoD(changeset);
      expect(result.passed).toBe(true);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          rule: "security-scan-required",
          severity: "warning",
        })
      );
    });
  });

  describe("multiple violations", () => {
    it("collects all violations from failing changeset", async () => {
      const result = await evaluateDoD(createFailingChangeset());
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(1);
    });
  });
});

describe("DoD individual rules", () => {
  describe("checkTestResultsProvided", () => {
    it("returns null when test results present", () => {
      const changeset = createValidChangeset();
      expect(checkTestResultsProvided(changeset)).toBeNull();
    });

    it("returns violation when test results missing", () => {
      const changeset = createValidChangeset({ testResults: undefined });
      expect(checkTestResultsProvided(changeset)?.rule).toBe(
        "test-results-required"
      );
    });
  });

  describe("checkTestsPassing", () => {
    it("returns null when all tests pass", () => {
      const changeset = createValidChangeset();
      expect(checkTestsPassing(changeset)).toBeNull();
    });

    it("returns null when test results missing", () => {
      const changeset = createValidChangeset({ testResults: undefined });
      expect(checkTestsPassing(changeset)).toBeNull();
    });

    it("returns violation when tests fail", () => {
      const changeset = createValidChangeset({
        testResults: createTestResults({ failCount: 5 }),
      });
      const violation = checkTestsPassing(changeset);
      expect(violation?.rule).toBe("tests-passing");
      expect(violation?.description).toContain("5");
    });
  });

  describe("checkNoSkippedTests", () => {
    it("returns null when no skipped tests", () => {
      const changeset = createValidChangeset();
      expect(checkNoSkippedTests(changeset)).toBeNull();
    });

    it("returns null when test results missing", () => {
      const changeset = createValidChangeset({ testResults: undefined });
      expect(checkNoSkippedTests(changeset)).toBeNull();
    });

    it("returns violation when tests skipped", () => {
      const changeset = createValidChangeset({
        testResults: createTestResults({ skipCount: 3 }),
      });
      const violation = checkNoSkippedTests(changeset);
      expect(violation?.rule).toBe("no-skipped-tests");
      expect(violation?.description).toContain("3");
    });
  });

  describe("checkCoverage", () => {
    it("returns null when coverage meets server threshold", () => {
      const changeset = createValidChangeset({
        changedFiles: ["src/server/api.ts"],
        testResults: createTestResults({ coveragePercent: 80 }),
      });
      expect(checkCoverage(changeset)).toBeNull();
    });

    it("returns null when coverage meets app threshold", () => {
      const changeset = createValidChangeset({
        changedFiles: ["src/app/page.tsx"],
        testResults: createTestResults({ coveragePercent: 70 }),
      });
      expect(checkCoverage(changeset)).toBeNull();
    });

    it("applies server threshold (80%) for server files", () => {
      const changeset = createValidChangeset({
        changedFiles: ["src/server/service.ts"],
        testResults: createTestResults({ coveragePercent: 79 }),
      });
      expect(checkCoverage(changeset)?.rule).toBe("coverage-threshold");
    });

    it("applies server threshold (80%) for API route files", () => {
      const changeset = createValidChangeset({
        changedFiles: ["src/app/api/route.ts"],
        testResults: createTestResults({ coveragePercent: 79 }),
      });
      expect(checkCoverage(changeset)?.rule).toBe("coverage-threshold");
    });

    it("applies app threshold (70%) for app files", () => {
      const changeset = createValidChangeset({
        changedFiles: ["src/app/dashboard/page.tsx"],
        testResults: createTestResults({ coveragePercent: 69 }),
      });
      expect(checkCoverage(changeset)?.rule).toBe("coverage-threshold");
    });

    it("returns null when test results missing", () => {
      const changeset = createValidChangeset({ testResults: undefined });
      expect(checkCoverage(changeset)).toBeNull();
    });
  });

  describe("checkTestBudget", () => {
    it("returns null when duration within budget", () => {
      const changeset = createValidChangeset({
        testResults: createTestResults({ durationMs: 2999 }),
      });
      expect(checkTestBudget(changeset)).toBeNull();
    });

    it("returns warning when duration exceeds budget", () => {
      const changeset = createValidChangeset({
        testResults: createTestResults({ durationMs: 3001 }),
      });
      const violation = checkTestBudget(changeset);
      expect(violation?.rule).toBe("test-budget");
      expect(violation?.severity).toBe("warning");
    });

    it("returns null when test results missing", () => {
      const changeset = createValidChangeset({ testResults: undefined });
      expect(checkTestBudget(changeset)).toBeNull();
    });
  });

  describe("checkSecurityScan", () => {
    it("returns warning when security scan missing", () => {
      const changeset = createValidChangeset({ securityScan: undefined });
      const violation = checkSecurityScan(changeset);
      expect(violation?.rule).toBe("security-scan-required");
      expect(violation?.severity).toBe("warning");
    });

    it("returns null when scan is clean", () => {
      const changeset = createValidChangeset();
      expect(checkSecurityScan(changeset)).toBeNull();
    });

    it("returns error when scan has error-severity findings", () => {
      const changeset = createValidChangeset({
        securityScan: createSecurityScan({
          status: "flagged",
          findings: [
            {
              pattern: "API_KEY",
              file: "config.ts",
              severity: "error",
              message: "Hardcoded key",
            },
          ],
        }),
      });
      const violation = checkSecurityScan(changeset);
      expect(violation?.rule).toBe("security-violations");
      expect(violation?.severity).toBe("error");
    });

    it("returns null when scan has only warning-severity findings", () => {
      const changeset = createValidChangeset({
        securityScan: createSecurityScan({
          status: "flagged",
          findings: [
            {
              pattern: "WEAK_RANDOM",
              file: "util.ts",
              severity: "warning",
              message: "Use crypto.randomBytes",
            },
          ],
        }),
      });
      expect(checkSecurityScan(changeset)).toBeNull();
    });
  });

  describe("checkLintErrors", () => {
    it("returns null when no lint errors", () => {
      const changeset = createValidChangeset();
      expect(checkLintErrors(changeset)).toBeNull();
    });

    it("returns null when lint results missing", () => {
      const changeset = createValidChangeset({ lintResults: undefined });
      expect(checkLintErrors(changeset)).toBeNull();
    });

    it("returns violation when lint errors present", () => {
      const changeset = createValidChangeset({
        lintResults: createLintResults({ errorCount: 2 }),
      });
      const violation = checkLintErrors(changeset);
      expect(violation?.rule).toBe("lint-errors");
      expect(violation?.description).toContain("2");
    });
  });

  describe("checkLintWarnings", () => {
    it("returns null when no lint warnings", () => {
      const changeset = createValidChangeset({
        lintResults: createLintResults({ warningCount: 0 }),
      });
      expect(checkLintWarnings(changeset)).toBeNull();
    });

    it("returns null when lint results missing", () => {
      const changeset = createValidChangeset({ lintResults: undefined });
      expect(checkLintWarnings(changeset)).toBeNull();
    });

    it("returns warning when lint warnings present", () => {
      const changeset = createValidChangeset({
        lintResults: createLintResults({ warningCount: 4 }),
      });
      const violation = checkLintWarnings(changeset);
      expect(violation?.rule).toBe("lint-warnings");
      expect(violation?.severity).toBe("warning");
    });
  });
});
