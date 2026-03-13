import type { Changeset, GateResult, GateViolation } from "@/types/gates";
import type { ReviewFinding, ReviewVerdict } from "@/types/review";
import type { AgentId } from "@/types/agent-protocol";
import { classifyFinding, deriveFileContext } from "./severity-classifier";
import { computeVerdict } from "./verdict-logic";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

// ─── Agent Domain Mapping ───────────────────────────────────────────────────

const DOMAIN_PATTERNS: Record<string, AgentId> = {
  "src/server/": "node-backend",
  "src/app/api/": "node-backend",
  "src/components/": "next-ux",
  "src/app/dashboard/": "next-ux",
  "src/app/(auth)/": "next-ux",
  "__tests__/": "ts-testing",
  "e2e/": "ts-testing",
  "src/server/orchestrator/": "orchestrator-project",
  "src/types/": "orchestrator-project",
  "prisma/": "orchestrator-project",
};

interface DomainPartition {
  agentId: AgentId;
  files: string[];
}

// ─── Step 1: Partition ──────────────────────────────────────────────────────

/**
 * Group changed files by agent domain ownership.
 * More specific prefixes take priority (longest match).
 */
function partitionByDomain(changedFiles: string[]): DomainPartition[] {
  const groups = new Map<AgentId, string[]>();

  for (const file of changedFiles) {
    let matchedAgent: AgentId = "orchestrator-project";
    let longestMatch = 0;

    for (const [prefix, agentId] of Object.entries(DOMAIN_PATTERNS)) {
      if (file.startsWith(prefix) && prefix.length > longestMatch) {
        matchedAgent = agentId;
        longestMatch = prefix.length;
      }
    }

    const existing = groups.get(matchedAgent) ?? [];
    existing.push(file);
    groups.set(matchedAgent, existing);
  }

  return Array.from(groups.entries()).map(([agentId, files]) => ({
    agentId,
    files,
  }));
}

// ─── Step 2: Check ──────────────────────────────────────────────────────────

/**
 * Map DoD gate violations to ReviewFindings per file.
 * Each violation is classified with proper severity and category
 * based on file context.
 */
function checkFindings(
  dodResult: GateResult,
  changedFiles: string[],
  newFiles?: Set<string>
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  for (const violation of dodResult.violations) {
    // File-specific violations: classify per affected file
    const targetFiles = resolveAffectedFiles(violation, changedFiles);

    for (const file of targetFiles) {
      const context = deriveFileContext(file, newFiles);
      const finding = classifyFinding(violation, file, context);
      findings.push(finding);
    }
  }

  return findings;
}

/**
 * Resolve which files a violation affects.
 * If the violation rule references a specific file pattern, filter to those.
 * Otherwise, apply to the first file as a general finding.
 */
function resolveAffectedFiles(
  violation: GateViolation,
  changedFiles: string[]
): string[] {
  // Security scan findings often reference specific files
  if (violation.description.includes("file:")) {
    const match = /file:\s*(\S+)/.exec(violation.description);
    const matchedFile = match?.[1];
    if (matchedFile !== undefined) {
      const referenced = changedFiles.filter((f) => f.includes(matchedFile));
      if (referenced.length > 0) return referenced;
    }
  }

  // General violations apply to the changeset as a whole
  // Use the first file as representative
  const firstFile = changedFiles[0];
  return firstFile !== undefined ? [firstFile] : ["unknown"];
}

// ─── Step 3: Validate ───────────────────────────────────────────────────────

/**
 * Filter out false positives based on context rules.
 *
 * False positive rules:
 * - Security findings on test files (tests don't run in prod)
 * - Coverage findings when coverage is actually above threshold
 * - Lint warnings on generated/config files
 */
function validateFindings(
  findings: ReviewFinding[],
  changeset: Changeset
): ReviewFinding[] {
  return findings.map((finding) => {
    // Test files don't need security scanning
    if (
      finding.category === "security" &&
      deriveFileContext(finding.file).isTestFile
    ) {
      return { ...finding, falsePositive: true };
    }

    // Config files don't need style enforcement
    if (
      finding.category === "style" &&
      finding.severity === "info" &&
      deriveFileContext(finding.file).isConfig
    ) {
      return { ...finding, falsePositive: true };
    }

    // Coverage warning when coverage is above 80% is not actionable
    if (
      finding.rule.toLowerCase().includes("coverage") &&
      finding.severity === "warning" &&
      changeset.testResults !== undefined &&
      changeset.testResults.coveragePercent >= 80
    ) {
      return { ...finding, falsePositive: true };
    }

    return finding;
  });
}

// ─── Step 4: Synthesize ─────────────────────────────────────────────────────

/**
 * Synthesize a complete review from a changeset and DoD gate result.
 *
 * Implements the 4-step review workflow:
 * 1. Partition — group files by agent domain
 * 2. Check — run DoD rules, collect ReviewFindings
 * 3. Validate — filter false positives
 * 4. Synthesize — apply verdict logic
 *
 * @param changeset - The changeset under review
 * @param dodResult - The DoD gate evaluation result
 * @param newFiles - Optional set of newly created file paths
 * @returns ReviewVerdict with findings, verdict, and triviality score
 */
export async function synthesizeReview(
  changeset: Changeset,
  dodResult: GateResult,
  newFiles?: Set<string>
): Promise<ReviewVerdict> {
  logger.info(`Synthesizing review for ${changeset.ticketRef}`, {
    fileCount: changeset.changedFiles.length,
    violationCount: dodResult.violations.length,
  });

  // Step 1: Partition by domain (for logging/tracing)
  const partitions = partitionByDomain(changeset.changedFiles);
  logger.info("Domain partitions", {
    partitions: partitions.map((p) => ({
      agent: p.agentId,
      fileCount: p.files.length,
    })),
  });

  // Step 2: Check — map violations to findings
  const rawFindings = checkFindings(
    dodResult,
    changeset.changedFiles,
    newFiles
  );

  // Step 3: Validate — filter false positives
  const validatedFindings = validateFindings(rawFindings, changeset);

  // Step 4: Synthesize — compute verdict
  const changedLineCount = estimateChangedLines(changeset);
  const verdict = computeVerdict(validatedFindings, changedLineCount);

  logger.info(`Review synthesis complete for ${changeset.ticketRef}`, {
    verdict: verdict.verdict,
    findingCount: verdict.findings.length,
    trivialityScore: verdict.trivialityScore,
    requiresHumanReview: verdict.requiresHumanReview,
  });

  return verdict;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Estimate total changed lines from changeset metadata.
 * Uses test results duration as a proxy if no line count is available.
 */
function estimateChangedLines(changeset: Changeset): number {
  // If file contents are available, count lines
  if (changeset.fileContents !== undefined) {
    return Object.values(changeset.fileContents).reduce(
      (sum, content) => sum + content.split("\n").length,
      0
    );
  }

  // Rough estimate: ~30 lines per changed file
  return changeset.changedFiles.length * 30;
}
