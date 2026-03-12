import type { JiraTicket } from "@/server/mcp/jira/types";
import type { GateViolation } from "@/types/gates";

// ─── BDD Format Detection ─────────────────────────────────────────────────────

/**
 * Check that acceptance criteria follow Given/When/Then BDD format.
 * Must contain all three keywords: GIVEN, WHEN, THEN.
 */
export function checkBDDFormat(ticket: JiraTicket): GateViolation | null {
  const hasGiven = /\bGIVEN\b/i.test(ticket.acceptanceCriteria);
  const hasWhen = /\bWHEN\b/i.test(ticket.acceptanceCriteria);
  const hasThen = /\bTHEN\b/i.test(ticket.acceptanceCriteria);

  if (!hasGiven || !hasWhen || !hasThen) {
    const found = [
      hasGiven ? "GIVEN" : "",
      hasWhen ? "WHEN" : "",
      hasThen ? "THEN" : "",
    ]
      .filter(Boolean)
      .join(", ");

    return {
      rule: "bdd-format",
      description: `Acceptance criteria must follow Given/When/Then format. Found: ${found || "none"}`,
      severity: "error",
    };
  }

  return null;
}

// ─── Story Points ─────────────────────────────────────────────────────────────

const VALID_STORY_POINTS = [1, 2, 3, 5, 8, 13];
const LARGE_STORY_POINTS_THRESHOLD = 8;

/**
 * Check that story points are present and use Fibonacci values.
 */
export function checkStoryPoints(ticket: JiraTicket): GateViolation | null {
  if (ticket.storyPoints === null) {
    return {
      rule: "story-points-required",
      description: "Story points must be estimated before approval",
      severity: "error",
    };
  }

  if (!VALID_STORY_POINTS.includes(ticket.storyPoints)) {
    return {
      rule: "story-points-fibonacci",
      description: `Story points must be Fibonacci (1, 2, 3, 5, 8, 13). Found: ${ticket.storyPoints}`,
      severity: "error",
    };
  }

  return null;
}

/**
 * Generate warning for large story points (>8).
 * Does not block — just recommends splitting.
 */
export function checkStoryPointsWarning(
  ticket: JiraTicket
): GateViolation | null {
  if (
    ticket.storyPoints !== null &&
    ticket.storyPoints > LARGE_STORY_POINTS_THRESHOLD
  ) {
    return {
      rule: "story-points-large",
      description: `Story points (${ticket.storyPoints}) exceed recommended size (${LARGE_STORY_POINTS_THRESHOLD}). Consider splitting.`,
      severity: "warning",
    };
  }

  return null;
}

// ─── Scope Clarity ────────────────────────────────────────────────────────────

/**
 * Check that description contains an Out-of-Scope section.
 */
export function checkOutOfScope(ticket: JiraTicket): GateViolation | null {
  const hasOutOfScope = /out[- ]?of[- ]?scope/i.test(ticket.description);

  if (!hasOutOfScope) {
    return {
      rule: "out-of-scope-section",
      description: "Description must include an 'Out-of-Scope' section",
      severity: "error",
    };
  }

  return null;
}

/**
 * Check that title is concise (<100 characters).
 */
export function checkTitleLength(ticket: JiraTicket): GateViolation | null {
  const MAX_TITLE_LENGTH = 100;

  if (ticket.summary.length > MAX_TITLE_LENGTH) {
    return {
      rule: "title-length",
      description: `Title exceeds ${MAX_TITLE_LENGTH} characters (${ticket.summary.length}). Must be concise.`,
      severity: "error",
    };
  }

  return null;
}

// ─── Bug-Specific Checks ──────────────────────────────────────────────────────

/**
 * Determine if a ticket is a bug based on labels or title.
 */
function isBugTicket(ticket: JiraTicket): boolean {
  const hasBugLabel = ticket.labels.some(
    (l) => l.toLowerCase() === "bug" || l.toLowerCase() === "bugfix"
  );
  const hasBugInTitle =
    ticket.summary.toLowerCase().includes("bug") ||
    ticket.summary.toLowerCase().includes("fix");

  return hasBugLabel || hasBugInTitle;
}

/**
 * Check that bug tickets include reproduction steps and expected/actual behavior.
 */
export function checkBugReproductionSteps(
  ticket: JiraTicket
): GateViolation | null {
  if (!isBugTicket(ticket)) {
    return null;
  }

  const hasReproSteps = /repro(duction)?[- ]?steps|steps to reproduce/i.test(
    ticket.description
  );

  if (!hasReproSteps) {
    return {
      rule: "bug-reproduction-steps",
      description: "Bug tickets must include reproduction steps",
      severity: "error",
    };
  }

  return null;
}

/**
 * Check that bug tickets include expected vs actual behavior.
 */
export function checkBugExpectedActual(
  ticket: JiraTicket
): GateViolation | null {
  if (!isBugTicket(ticket)) {
    return null;
  }

  const hasExpected = /expected/i.test(ticket.description);
  const hasActual = /actual/i.test(ticket.description);

  if (!hasExpected || !hasActual) {
    return {
      rule: "bug-expected-actual",
      description: "Bug tickets must include expected vs actual behavior",
      severity: "error",
    };
  }

  return null;
}
