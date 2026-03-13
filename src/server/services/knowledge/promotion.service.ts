import type { KnowledgeEntry } from "@prisma/client";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PromotionEvaluation {
  shouldPromote: boolean;
  promotionTarget: "shared-memory" | "rule" | "skill";
  reason: string;
}

// ─── Promotion Criteria ─────────────────────────────────────────────────────

const MIN_VALIDATED_COUNT = 2;
const MIN_CONFIDENCE = 0.7;

/**
 * Evaluate whether a knowledge entry should be promoted.
 *
 * Promotion criteria (from memory-management skill):
 * - validatedCount >= 2 (pattern observed in 2+ successful builds)
 * - confidence >= 0.7
 *
 * Promotion target selection:
 * - PATTERN/OPTIMIZATION → shared-memory (reusable across projects)
 * - GOTCHA → rule (prevent recurrence via automated checking)
 * - DECISION → skill (codify decision framework for future use)
 */
export function evaluateForPromotion(
  entry: KnowledgeEntry
): PromotionEvaluation {
  if (entry.validatedCount < MIN_VALIDATED_COUNT) {
    return {
      shouldPromote: false,
      promotionTarget: "shared-memory",
      reason: `Needs ${MIN_VALIDATED_COUNT - entry.validatedCount} more validation(s) (current: ${entry.validatedCount})`,
    };
  }

  if (entry.confidence < MIN_CONFIDENCE) {
    return {
      shouldPromote: false,
      promotionTarget: "shared-memory",
      reason: `Confidence too low: ${entry.confidence.toFixed(2)} (needs ${MIN_CONFIDENCE})`,
    };
  }

  const promotionTarget = resolvePromotionTarget(entry.category);

  logger.info(`Entry ${entry.id} eligible for promotion`, {
    category: entry.category,
    target: promotionTarget,
    validatedCount: entry.validatedCount,
    confidence: entry.confidence,
  });

  return {
    shouldPromote: true,
    promotionTarget,
    reason: `Validated ${entry.validatedCount} time(s) with ${entry.confidence.toFixed(2)} confidence`,
  };
}

// ─── Target Resolution ──────────────────────────────────────────────────────

function resolvePromotionTarget(
  category: KnowledgeEntry["category"]
): "shared-memory" | "rule" | "skill" {
  switch (category) {
    case "PATTERN":
    case "OPTIMIZATION":
      return "shared-memory";
    case "GOTCHA":
      return "rule";
    case "DECISION":
      return "skill";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}
