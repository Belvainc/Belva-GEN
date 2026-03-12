import { z } from "zod";
import type { GateViolation } from "@/types/gates";

// ─── BDD Scenario ───────────────────────────────────────────────────────────

export const BDDScenarioSchema = z.object({
  title: z.string().min(1),
  given: z.array(z.string()),
  when: z.array(z.string()),
  then: z.array(z.string()),
  isComplete: z.boolean(),
});
export type BDDScenario = z.infer<typeof BDDScenarioSchema>;

// ─── Verification Result ────────────────────────────────────────────────────

export interface BDDVerificationResult {
  passed: boolean;
  scenarios: BDDScenario[];
  violations: GateViolation[];
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Verify that acceptance criteria contain valid BDD scenarios.
 * Each scenario must have Given, When, and Then sections.
 */
export function verifyBDDRequirements(
  acceptanceCriteria: string
): BDDVerificationResult {
  const scenarios = parseBDDScenarios(acceptanceCriteria);
  const violations: GateViolation[] = [];

  if (scenarios.length === 0) {
    violations.push({
      rule: "bdd-no-scenarios",
      description: "No BDD scenarios found in acceptance criteria",
      severity: "error",
    });
  }

  for (const scenario of scenarios) {
    if (!scenario.isComplete) {
      violations.push({
        rule: "bdd-incomplete-scenario",
        description: `Scenario "${scenario.title}" is missing Given, When, or Then`,
        severity: "error",
      });
    }
  }

  return {
    passed: violations.filter((v) => v.severity === "error").length === 0,
    scenarios,
    violations,
  };
}

// ─── Parser ─────────────────────────────────────────────────────────────────

function parseBDDScenarios(text: string): BDDScenario[] {
  const scenarios: BDDScenario[] = [];
  const blocks = text.split(/(?=Scenario:)/i).filter((s) => s.trim());

  for (const block of blocks) {
    const titleMatch = block.match(/Scenario:\s*(.+)/i);
    if (!titleMatch) continue;

    const title = (titleMatch[1] ?? "").trim();
    const given = extractSteps(block, "Given");
    const when = extractSteps(block, "When");
    const then = extractSteps(block, "Then");

    scenarios.push({
      title,
      given,
      when,
      then,
      isComplete:
        given.length > 0 && when.length > 0 && then.length > 0,
    });
  }

  return scenarios;
}

function extractSteps(block: string, keyword: string): string[] {
  const steps: string[] = [];
  let inSection = false;

  for (const line of block.split("\n")) {
    const keywordMatch = line.match(
      new RegExp(`^\\s*${keyword}\\s+(.+)`, "i")
    );
    if (keywordMatch) {
      inSection = true;
      const value = keywordMatch[1];
      if (value) steps.push(value.trim());
      continue;
    }
    if (inSection) {
      const andMatch = line.match(/^\s*And\s+(.+)/i);
      if (andMatch) {
        const value = andMatch[1];
        if (value) steps.push(value.trim());
      } else if (/^\s*(Given|When|Then)\s+/i.test(line)) {
        inSection = false;
      }
    }
  }

  return steps;
}
