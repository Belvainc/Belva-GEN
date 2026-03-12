import type { JiraTicket } from "@/server/mcp/jira/types";
import type { GateViolation, GateResult } from "@/types/gates";

// ─── Bug-Specific DoR Rule Predicates ───────────────────────────────────────
// Each rule returns GateViolation | null following the Plan 02 pattern.

export function checkBugReproSteps(ticket: JiraTicket): GateViolation | null {
  const patterns = [
    /steps to reproduce/i,
    /how to reproduce/i,
    /reproduction steps/i,
    /^\s*\d+\.\s+/m, // Numbered list in description
  ];
  const hasRepro = patterns.some((p) => p.test(ticket.description));
  return hasRepro
    ? null
    : {
        rule: "bug-repro-steps",
        description: "Bug report missing reproduction steps",
        severity: "error",
      };
}

export function checkBugExpectedActual(
  ticket: JiraTicket
): GateViolation | null {
  const hasExpected = /expected(\s+behavior)?[:\s]/i.test(ticket.description);
  const hasActual = /actual(\s+behavior)?[:\s]/i.test(ticket.description);
  return hasExpected && hasActual
    ? null
    : {
        rule: "bug-expected-actual",
        description:
          "Bug report missing expected vs actual behavior sections",
        severity: "error",
      };
}

export function checkBugAffectedArea(
  ticket: JiraTicket
): GateViolation | null {
  const patterns = [
    /affected (area|component|file)/i,
    /in\s+`?src\//,
    /component:\s*\w+/i,
    /file:\s*\S+/i,
  ];
  const hasArea = patterns.some((p) => p.test(ticket.description));
  return hasArea
    ? null
    : {
        rule: "bug-affected-area",
        description: "Bug report missing affected area or component",
        severity: "warning",
      };
}

export function checkBugStoryPoints(
  ticket: JiraTicket
): GateViolation | null {
  if (ticket.storyPoints === null) {
    return {
      rule: "bug-story-points",
      description: "Bug ticket missing story point estimate",
      severity: "error",
    };
  }
  return null;
}

export function checkBugGENLabel(ticket: JiraTicket): GateViolation | null {
  return ticket.labels.includes("GEN")
    ? null
    : {
        rule: "bug-gen-label",
        description:
          "Bug ticket missing GEN label (not eligible for auto-fix)",
        severity: "error",
      };
}

// ─── Evaluate All Bug DoR Rules ─────────────────────────────────────────────

const BUG_DOR_RULES = [
  checkBugReproSteps,
  checkBugExpectedActual,
  checkBugAffectedArea,
  checkBugStoryPoints,
  checkBugGENLabel,
] as const;

/**
 * Evaluate all bug-specific DoR rules against a ticket.
 * Returns a typed GateResult matching the gates.ts schema.
 */
export function evaluateBugDoR(ticket: JiraTicket): GateResult {
  const violations: GateViolation[] = [];
  for (const rule of BUG_DOR_RULES) {
    const violation = rule(ticket);
    if (violation !== null) {
      violations.push(violation);
    }
  }

  return {
    gateType: "dor",
    ticketRef: ticket.key,
    passed: violations.filter((v) => v.severity === "error").length === 0,
    evaluatedAt: new Date().toISOString(),
    violations,
  };
}
