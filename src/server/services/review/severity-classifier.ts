import type { GateViolation } from "@/types/gates";
import type { ReviewFinding, ReviewFindingCategory } from "@/types/review";

// ─── File Context ────────────────────────────────────────────────────────────

export interface FileContext {
  isTestFile: boolean;
  isConfig: boolean;
  isNewFile: boolean;
}

// ─── Patterns ────────────────────────────────────────────────────────────────

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx)$|^(__tests__|e2e)\//;
const CONFIG_FILE_PATTERN =
  /\.(config|rc)\.(ts|js|json|yaml|yml)$|^(\.env|tsconfig|next\.config|tailwind|postcss|jest|playwright)/;

/**
 * Derive file context from a file path.
 */
export function deriveFileContext(
  file: string,
  newFiles?: Set<string>
): FileContext {
  return {
    isTestFile: TEST_FILE_PATTERN.test(file),
    isConfig: CONFIG_FILE_PATTERN.test(file),
    isNewFile: newFiles?.has(file) ?? false,
  };
}

// ─── Category Inference ─────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, ReviewFindingCategory> = {
  security: "security",
  "security-scan": "security",
  vulnerability: "security",
  injection: "security",
  xss: "security",
  coverage: "correctness",
  "test-results": "correctness",
  "tests-passing": "correctness",
  "no-skipped-tests": "correctness",
  lint: "style",
  "lint-errors": "style",
  "lint-warnings": "style",
  "test-budget": "performance",
  performance: "performance",
  architecture: "architecture",
};

/**
 * Infer review finding category from the gate violation rule name.
 */
function inferCategory(rule: string): ReviewFindingCategory {
  const normalized = rule.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (normalized.includes(keyword)) {
      return category;
    }
  }
  return "correctness";
}

// ─── Severity Mapping ───────────────────────────────────────────────────────

/**
 * Map a gate violation severity to a review finding severity,
 * applying context-aware adjustments.
 *
 * Downgrade rules:
 * - Security findings on test files → warning (tests don't run in prod)
 * - Style findings on config files → info (config doesn't follow code style rules)
 * - Coverage findings on new files → warning (new files may not have full coverage yet)
 */
function mapSeverity(
  violation: GateViolation,
  category: ReviewFindingCategory,
  context: FileContext
): "error" | "warning" | "info" {
  const baseSeverity = violation.severity;

  // Downgrade security findings on test files
  if (category === "security" && context.isTestFile && baseSeverity === "error") {
    return "warning";
  }

  // Downgrade style findings on config files
  if (category === "style" && context.isConfig) {
    return "info";
  }

  // Downgrade coverage issues on new files from error to warning
  if (
    category === "correctness" &&
    context.isNewFile &&
    violation.rule.toLowerCase().includes("coverage")
  ) {
    return baseSeverity === "error" ? "warning" : baseSeverity;
  }

  return baseSeverity;
}

// ─── Main Classifier ────────────────────────────────────────────────────────

/**
 * Classify a gate violation into a ReviewFinding with proper severity
 * and category, adjusted for file context.
 */
export function classifyFinding(
  violation: GateViolation,
  file: string,
  context: FileContext
): ReviewFinding {
  const category = inferCategory(violation.rule);
  const severity = mapSeverity(violation, category, context);

  return {
    rule: violation.rule,
    file,
    description: violation.description,
    severity,
    category,
    falsePositive: false,
  };
}
