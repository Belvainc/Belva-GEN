import type { JiraTicket } from "@/server/mcp/jira/types";
import type { GateViolation } from "@/types/gates";

// ─── Problem Statement ───────────────────────────────────────────────────────

/**
 * Check that the description contains a Problem or Motivation section.
 * This ensures the business need is clearly articulated.
 */
export function checkProblemStatement(ticket: JiraTicket): GateViolation | null {
  const hasProblem = /\b(problem|motivation|pain\s*point|challenge)\b/i.test(
    ticket.description
  );

  if (!hasProblem) {
    return {
      rule: "problem-statement",
      description:
        "Description must include a 'Problem' or 'Motivation' section explaining the business need",
      severity: "error",
    };
  }

  return null;
}

// ─── Value Hypothesis ────────────────────────────────────────────────────────

/**
 * Check that the description contains a Value, Business Value, or Impact section.
 * Stakeholders need to see expected business impact before approving.
 */
export function checkValueHypothesis(ticket: JiraTicket): GateViolation | null {
  const hasValue = /\b(value|business\s*value|impact|benefit|roi)\b/i.test(
    ticket.description
  );

  if (!hasValue) {
    return {
      rule: "value-hypothesis",
      description:
        "Description must include a 'Value' or 'Impact' section describing expected business benefit",
      severity: "error",
    };
  }

  return null;
}

// ─── Owner Assigned ──────────────────────────────────────────────────────────

/**
 * Check that the ticket has an assignee (owner).
 * Every epic needs a responsible owner before stakeholder review.
 */
export function checkOwnerAssigned(ticket: JiraTicket): GateViolation | null {
  if (ticket.assignee === null || ticket.assignee.trim() === "") {
    return {
      rule: "owner-assigned",
      description: "Ticket must have an assignee (owner) before stakeholder review",
      severity: "error",
    };
  }

  return null;
}

// ─── Strategic Alignment ─────────────────────────────────────────────────────

/**
 * Check that the description mentions strategic alignment or goals.
 * Warning-only: helps stakeholders evaluate priority.
 */
export function checkStrategicAlignment(
  ticket: JiraTicket
): GateViolation | null {
  const hasAlignment =
    /\b(strategic\s*alignment|goal|objective|initiative|roadmap)\b/i.test(
      ticket.description
    );

  if (!hasAlignment) {
    return {
      rule: "strategic-alignment",
      description:
        "Consider adding a 'Strategic Alignment' section linking this to a product goal or initiative",
      severity: "warning",
    };
  }

  return null;
}
