import type { DecompositionResult } from "@/server/orchestrator/types";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ArchitectureReview {
  applicableRules: string[];
  crossBoundaryChanges: string[];
  schemaChanges: boolean;
  newServiceIntroduction: boolean;
  estimatedComplexity: "low" | "medium" | "high";
  concerns: string[];
}

// ─── Agent Domain Boundaries ─────────────────────────────────────────────────

const DOMAIN_BOUNDARIES: Record<string, string> = {
  "src/server/": "backend",
  "src/app/api/": "backend",
  "src/components/": "frontend",
  "src/app/dashboard/": "frontend",
  "src/app/admin/": "frontend",
  "prisma/": "infrastructure",
  "e2e/": "testing",
  "__tests__/": "testing",
};

// ─── Rule Path Mappings ──────────────────────────────────────────────────────

const RULE_PATH_PATTERNS: Record<string, string[]> = {
  ".claude/rules/ts-strict-mode.md": ["src/**/*.ts", "src/**/*.tsx"],
  ".claude/rules/service-layer.md": ["src/app/api/**", "src/server/**"],
  ".claude/rules/component-architecture.md": ["src/components/**", "src/app/dashboard/**"],
  ".claude/rules/accessibility.md": ["src/components/**/*.tsx", "src/app/dashboard/**/*.tsx"],
  ".claude/rules/async-concurrency.md": ["src/server/**", "src/app/api/**"],
  ".claude/rules/infrastructure.md": ["src/server/**", "src/app/api/**", "prisma/**"],
  ".claude/rules/testing-budgets.md": ["**/*.test.ts", "e2e/**"],
  ".claude/rules/frontend-performance.md": ["src/app/**/*.tsx", "src/components/**/*.tsx"],
  ".claude/rules/data-fetching.md": ["src/app/dashboard/**/*.tsx", "src/components/organisms/**/*.tsx"],
};

// ─── Review Function ─────────────────────────────────────────────────────────

/**
 * Analyze decomposition result for architectural concerns.
 * Identifies cross-boundary changes, schema migrations, new services,
 * and applicable rules.
 */
export function reviewArchitecture(
  decomposition: DecompositionResult
): ArchitectureReview {
  const { affectedFiles, riskAreas, totalEstimatedPoints } = decomposition;

  // 1. Find applicable rules
  const applicableRules = findApplicableRules(affectedFiles);

  // 2. Detect cross-boundary changes
  const crossBoundaryChanges = detectCrossBoundaryChanges(affectedFiles);

  // 3. Check for schema changes
  const schemaChanges = affectedFiles.some(
    (f) => f.startsWith("prisma/") || f.includes("schema.prisma")
  );

  // 4. Check for new service introductions
  const newServiceIntroduction = affectedFiles.some(
    (f) =>
      f.startsWith("src/server/services/") && !f.includes("index.ts")
  );

  // 5. Build concerns list
  const concerns: string[] = [];

  if (schemaChanges) {
    concerns.push(
      "Schema migration detected — requires database migration coordination"
    );
  }

  if (crossBoundaryChanges.length > 0) {
    concerns.push(
      `Cross-boundary changes span ${crossBoundaryChanges.length} domain(s): ${crossBoundaryChanges.join(", ")}`
    );
  }

  if (newServiceIntroduction) {
    concerns.push(
      "New service introduction — verify three-layer architecture compliance"
    );
  }

  if (riskAreas.length > 3) {
    concerns.push(
      `High risk area count (${riskAreas.length}) — consider breaking into smaller deliverables`
    );
  }

  // 6. Estimate complexity
  const estimatedComplexity = estimateComplexity(
    affectedFiles.length,
    crossBoundaryChanges.length,
    schemaChanges,
    totalEstimatedPoints
  );

  logger.info("Architecture review complete", {
    applicableRules: applicableRules.length,
    crossBoundaryChanges: crossBoundaryChanges.length,
    schemaChanges,
    newServiceIntroduction,
    estimatedComplexity,
    concernCount: concerns.length,
  });

  return {
    applicableRules,
    crossBoundaryChanges,
    schemaChanges,
    newServiceIntroduction,
    estimatedComplexity,
    concerns,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findApplicableRules(files: string[]): string[] {
  const rules = new Set<string>();

  for (const [rulePath, patterns] of Object.entries(RULE_PATH_PATTERNS)) {
    for (const file of files) {
      if (patterns.some((pattern) => matchesGlobSimple(file, pattern))) {
        rules.add(rulePath);
        break;
      }
    }
  }

  return Array.from(rules);
}

function detectCrossBoundaryChanges(files: string[]): string[] {
  const domains = new Set<string>();

  for (const file of files) {
    for (const [prefix, domain] of Object.entries(DOMAIN_BOUNDARIES)) {
      if (file.startsWith(prefix)) {
        domains.add(domain);
        break;
      }
    }
  }

  // Cross-boundary only matters when multiple domains are touched
  return domains.size > 1 ? Array.from(domains) : [];
}

function estimateComplexity(
  fileCount: number,
  crossBoundaryCount: number,
  schemaChanges: boolean,
  totalPoints: number
): "low" | "medium" | "high" {
  let score = 0;

  if (fileCount > 20) score += 3;
  else if (fileCount > 10) score += 2;
  else if (fileCount > 5) score += 1;

  if (crossBoundaryCount > 2) score += 2;
  else if (crossBoundaryCount > 0) score += 1;

  if (schemaChanges) score += 2;
  if (totalPoints > 13) score += 2;
  else if (totalPoints > 5) score += 1;

  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

/**
 * Simple glob matching — supports ** and * patterns.
 * Not a full glob implementation, but sufficient for rule path matching.
 */
function matchesGlobSimple(filePath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{DOUBLESTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{DOUBLESTAR\}\}/g, ".*");

  return new RegExp(`^${regexStr}$`).test(filePath);
}
