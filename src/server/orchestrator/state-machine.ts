import type { EpicState } from "@/types/events";
import type { Transition } from "./types";

/**
 * Valid state transitions for the epic lifecycle.
 * Each transition defines: source state → target state, what triggers it, and optional guard conditions.
 */
const VALID_TRANSITIONS: readonly Transition[] = [
  // Stage 1: Ideate — stakeholder approval gate
  { from: "funnel", to: "funnel", trigger: "awaiting-stakeholder", guard: "Ideation validation must pass" },
  { from: "funnel", to: "refinement", trigger: "ideation-approved", guard: "Stakeholder must approve" },
  { from: "funnel", to: "funnel", trigger: "ideation-rejected" },
  { from: "funnel", to: "refinement", trigger: "ticket-triaged" },

  // Stage 2: Ready — DoR + team confirmation
  { from: "refinement", to: "refinement", trigger: "awaiting-team-confirmation", guard: "DoR must pass first" },
  { from: "refinement", to: "approved", trigger: "dor-passed", guard: "DoR validation must pass" },
  { from: "refinement", to: "funnel", trigger: "sent-back", guard: "Missing required fields" },

  // Stage 3: Plan — human plan approval
  { from: "approved", to: "in-progress", trigger: "plan-approved", guard: "Human approval required" },
  { from: "approved", to: "refinement", trigger: "plan-rejected" },

  // Stage 4: Implement — task execution with abort protocol
  { from: "in-progress", to: "review", trigger: "task-completed" },
  { from: "in-progress", to: "approved", trigger: "task-blocked" },
  { from: "in-progress", to: "in-progress", trigger: "task-reassigned" },

  // Stage 5: Review — structured review + DoD
  { from: "review", to: "review", trigger: "review-requested" },
  { from: "review", to: "done", trigger: "dod-passed", guard: "DoD validation must pass" },
  { from: "review", to: "in-progress", trigger: "dod-failed" },
] as const;

export type TransitionResult =
  | { valid: true; transition: Transition }
  | { valid: false; reason: string };

/**
 * Check if a state transition is valid and return the matching transition.
 */
export function validateTransition(
  from: EpicState,
  to: EpicState,
  trigger: string
): TransitionResult {
  const match = VALID_TRANSITIONS.find(
    (t) => t.from === from && t.to === to && t.trigger === trigger
  );

  if (match !== undefined) {
    return { valid: true, transition: match };
  }

  return {
    valid: false,
    reason: `Invalid transition: ${from} → ${to} (trigger: ${trigger}). No matching transition rule found.`,
  };
}

/**
 * Get all valid target states from a given state.
 */
export function getValidNextStates(from: EpicState): readonly EpicState[] {
  return VALID_TRANSITIONS
    .filter((t) => t.from === from)
    .map((t) => t.to);
}

/**
 * Get all valid transitions from a given state.
 */
export function getTransitionsFrom(from: EpicState): readonly Transition[] {
  return VALID_TRANSITIONS.filter((t) => t.from === from);
}
