import type { ReviewFinding, ReviewVerdict } from "@/types/review";

// ─── Constants ───────────────────────────────────────────────────────────────

const TRIVIALITY_LINE_THRESHOLD = 50;
const TRIVIALITY_HIGH_SCORE = 85;
const TRIVIALITY_BASE_SCORE = 50;
const WARNING_THRESHOLD_FOR_REQUEST_CHANGES = 3;
const HUMAN_REVIEW_TRIVIALITY_THRESHOLD = 80;

// ─── Verdict Computation ────────────────────────────────────────────────────

/**
 * Compute review verdict from findings.
 *
 * Decision rules:
 * - BLOCK: any error in correctness or security category
 * - REQUEST_CHANGES: any error in other categories, or >3 warnings
 * - APPROVE: only info and <=3 warnings
 */
export function computeVerdict(
  findings: ReviewFinding[],
  changedLineCount: number
): ReviewVerdict {
  const activeFindings = findings.filter((f) => !f.falsePositive);

  const errors = activeFindings.filter((f) => f.severity === "error");
  const warnings = activeFindings.filter((f) => f.severity === "warning");

  const criticalErrors = errors.filter(
    (f) => f.category === "correctness" || f.category === "security"
  );
  const otherErrors = errors.filter(
    (f) => f.category !== "correctness" && f.category !== "security"
  );

  // Determine verdict
  let verdict: "APPROVE" | "REQUEST_CHANGES" | "BLOCK";
  let summary: string;

  if (criticalErrors.length > 0) {
    verdict = "BLOCK";
    summary = buildBlockSummary(criticalErrors);
  } else if (
    otherErrors.length > 0 ||
    warnings.length > WARNING_THRESHOLD_FOR_REQUEST_CHANGES
  ) {
    verdict = "REQUEST_CHANGES";
    summary = buildRequestChangesSummary(otherErrors, warnings);
  } else {
    verdict = "APPROVE";
    summary = buildApproveSummary(warnings);
  }

  const trivialityScore = calculateTrivialityScore(
    changedLineCount,
    activeFindings
  );
  const requiresHumanReview =
    verdict !== "APPROVE" || trivialityScore < HUMAN_REVIEW_TRIVIALITY_THRESHOLD;

  return {
    verdict,
    findings: activeFindings,
    summary,
    trivialityScore,
    requiresHumanReview,
  };
}

// ─── Triviality Score ───────────────────────────────────────────────────────

/**
 * Calculate triviality score (0-100).
 *
 * Higher score = more trivial (less complex) change.
 * - Small line count → higher score
 * - Fewer findings → higher score
 * - No architecture findings → higher score
 */
function calculateTrivialityScore(
  changedLineCount: number,
  findings: ReviewFinding[]
): number {
  let score = TRIVIALITY_BASE_SCORE;

  // Small changes get a bonus
  if (changedLineCount <= TRIVIALITY_LINE_THRESHOLD) {
    score += 30;
  } else if (changedLineCount <= TRIVIALITY_LINE_THRESHOLD * 4) {
    score += 15;
  }

  // Architecture findings reduce triviality
  const architectureFindings = findings.filter(
    (f) => f.category === "architecture"
  );
  if (architectureFindings.length > 0) {
    score -= 20 * architectureFindings.length;
  }

  // Errors reduce triviality
  const errorCount = findings.filter((f) => f.severity === "error").length;
  score -= 10 * errorCount;

  // Warnings slightly reduce triviality
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  score -= 3 * warningCount;

  // No findings at all is very trivial
  if (findings.length === 0 && changedLineCount <= TRIVIALITY_LINE_THRESHOLD) {
    score = TRIVIALITY_HIGH_SCORE;
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Summary Builders ───────────────────────────────────────────────────────

function buildBlockSummary(criticalErrors: ReviewFinding[]): string {
  const categories = [
    ...new Set(criticalErrors.map((f) => f.category)),
  ].join(", ");
  return `Blocked: ${criticalErrors.length} critical finding(s) in ${categories} require resolution before merge.`;
}

function buildRequestChangesSummary(
  errors: ReviewFinding[],
  warnings: ReviewFinding[]
): string {
  const parts: string[] = [];
  if (errors.length > 0) {
    parts.push(`${errors.length} error(s)`);
  }
  if (warnings.length > WARNING_THRESHOLD_FOR_REQUEST_CHANGES) {
    parts.push(`${warnings.length} warning(s)`);
  }
  return `Changes requested: ${parts.join(" and ")} need attention.`;
}

function buildApproveSummary(warnings: ReviewFinding[]): string {
  if (warnings.length > 0) {
    return `Approved with ${warnings.length} minor warning(s).`;
  }
  return "Approved: all checks passed.";
}
