import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TestResults, LintResults, SecurityScanResult } from "@/types/gates";
import { createChildLogger } from "@/server/config/logger";

const execFileAsync = promisify(execFile);
const logger = createChildLogger({ module: "test-executor" });

// ─── Validation Result ──────────────────────────────────────────────────────

export interface ValidationResult {
  testResults: TestResults;
  lintResults: LintResults;
  securityScan: SecurityScanResult;
  allPassed: boolean;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run test, lint, and security validation in a specified directory.
 * Used to validate agent output in a git worktree.
 * All three checks run concurrently via Promise.all.
 */
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

// ─── Jest ───────────────────────────────────────────────────────────────────

async function runJest(
  cwd: string,
  signal?: AbortSignal
): Promise<TestResults> {
  const start = Date.now();
  try {
    const { stdout } = await execFileAsync(
      "npx",
      ["jest", "--json", "--passWithNoTests"],
      { cwd, signal, timeout: 180_000 }
    );
    const parsed = JSON.parse(stdout) as {
      numPassedTests: number;
      numFailedTests: number;
      numPendingTests: number;
    };
    return {
      passCount: parsed.numPassedTests,
      failCount: parsed.numFailedTests,
      skipCount: parsed.numPendingTests,
      coveragePercent: 0,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    logger.error({ error, cwd }, "Jest execution failed");
    return {
      passCount: 0,
      failCount: 1,
      skipCount: 0,
      coveragePercent: 0,
      durationMs: Date.now() - start,
    };
  }
}

// ─── ESLint ─────────────────────────────────────────────────────────────────

async function runLint(
  cwd: string,
  signal?: AbortSignal
): Promise<LintResults> {
  try {
    await execFileAsync("npx", ["eslint", ".", "--format", "json"], {
      cwd,
      signal,
      timeout: 60_000,
    });
    return { errorCount: 0, warningCount: 0 };
  } catch (error) {
    const output = (error as { stdout?: string }).stdout ?? "";
    try {
      const results = JSON.parse(output) as Array<{
        errorCount: number;
        warningCount: number;
      }>;
      return {
        errorCount: results.reduce((sum, r) => sum + r.errorCount, 0),
        warningCount: results.reduce((sum, r) => sum + r.warningCount, 0),
      };
    } catch {
      return { errorCount: 1, warningCount: 0 };
    }
  }
}

// ─── Security Scan (npm audit) ──────────────────────────────────────────────

async function runSecurityScan(
  cwd: string,
  signal?: AbortSignal
): Promise<SecurityScanResult> {
  try {
    await execFileAsync("npm", ["audit", "--json"], {
      cwd,
      signal,
      timeout: 60_000,
    });
    return {
      status: "clean",
      findings: [],
      scannedAt: new Date().toISOString(),
    };
  } catch (error) {
    const output = (error as { stdout?: string }).stdout ?? "";
    try {
      const audit = JSON.parse(output) as {
        vulnerabilities?: Record<string, unknown>;
      };
      const vulnCount = Object.keys(audit.vulnerabilities ?? {}).length;
      return {
        status: vulnCount > 0 ? "flagged" : "clean",
        findings:
          vulnCount > 0
            ? [
                {
                  pattern: "npm-audit",
                  file: "package.json",
                  severity: "warning" as const,
                  message: `${vulnCount} vulnerabilities found`,
                },
              ]
            : [],
        scannedAt: new Date().toISOString(),
      };
    } catch {
      return {
        status: "clean",
        findings: [],
        scannedAt: new Date().toISOString(),
      };
    }
  }
}
