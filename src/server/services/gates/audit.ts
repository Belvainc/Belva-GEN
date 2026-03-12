import type { Prisma } from "@prisma/client";
import type { GateResult } from "@/types/gates";
import { prisma } from "@/server/db/client";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

/**
 * Log a gate decision to the audit trail.
 *
 * Every gate evaluation (pass or fail) is recorded for compliance.
 * The full GateResult is stored as JSON payload for debugging and audit.
 *
 * @param gateResult - The result of the gate evaluation
 * @param agentId - Optional agent ID that triggered the evaluation
 */
export async function logGateDecision(
  gateResult: GateResult,
  agentId?: string
): Promise<void> {
  const action = `gate.${gateResult.gateType}.${gateResult.passed ? "passed" : "failed"}`;

  logger.info(`Logging gate decision: ${action}`, {
    ticketRef: gateResult.ticketRef,
    violationCount: gateResult.violations.length,
  });

  await prisma.auditLog.create({
    data: {
      action,
      entityType: "pipeline",
      entityId: gateResult.ticketRef,
      agentId,
      payload: gateResult as unknown as Prisma.JsonObject,
    },
  });
}
