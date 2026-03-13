import type { AgentId } from "@/types/agent-protocol";
import type { OrchestratorEngine } from "./engine";
import { prisma } from "@/server/db/client";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AbortDecision {
  action: "reassign" | "escalate" | "abort";
  targetAgent?: AgentId;
  reason: string;
}

// ─── Abort Protocol ──────────────────────────────────────────────────────────

/**
 * Decide how to handle a blocked task based on the blocker type.
 *
 * - dependency: check if the dependency can be unblocked, else escalate
 * - error: attempt reassignment (max 1 retry), then escalate
 * - complexity: always escalate to human
 * - timeout: abort the task
 */
export async function handleTaskBlocked(
  engine: OrchestratorEngine,
  ticketRef: string,
  taskId: string,
  agentId: string,
  reason: string,
  blockerType: string
): Promise<AbortDecision> {
  logger.info(`Abort protocol invoked for ${taskId}`, {
    ticketRef,
    agentId,
    blockerType,
    reason,
  });

  switch (blockerType) {
    case "dependency": {
      // Check if the dependency is tracked and can be unblocked
      const epic = engine.getEpic(ticketRef);
      if (epic !== undefined) {
        const completedIds = new Set(epic.completedTaskIds);
        const taskNode = epic.taskGraph?.nodes.find((n) => n.taskId === taskId);
        const unblockedDeps = taskNode?.dependsOn.filter(
          (dep) => !completedIds.has(dep)
        );

        if (unblockedDeps !== undefined && unblockedDeps.length > 0) {
          logger.info(`Task ${taskId} blocked on dependencies: ${unblockedDeps.join(", ")}`);
          return {
            action: "escalate",
            reason: `Blocked on incomplete dependencies: ${unblockedDeps.join(", ")}`,
          };
        }
      }

      return {
        action: "escalate",
        reason: `Dependency blocker: ${reason}`,
      };
    }

    case "error": {
      // Check if we've already retried this task
      const retryCount = await getTaskRetryCount(ticketRef, taskId);

      if (retryCount < 1) {
        // Attempt reassignment (retry with same agent type)
        await incrementTaskRetryCount(ticketRef, taskId);
        logger.info(`Reassigning task ${taskId} (retry ${retryCount + 1})`);

        return {
          action: "reassign",
          targetAgent: agentId as AgentId,
          reason: `Retrying after error: ${reason}`,
        };
      }

      // Max retries exceeded — escalate
      return {
        action: "escalate",
        reason: `Task failed after ${retryCount + 1} attempt(s): ${reason}`,
      };
    }

    case "complexity": {
      // Always escalate complex blockers to human
      return {
        action: "escalate",
        reason: `Complexity blocker requires human judgment: ${reason}`,
      };
    }

    case "timeout": {
      // Abort timed-out tasks
      return {
        action: "abort",
        reason: `Task timed out: ${reason}`,
      };
    }

    default: {
      logger.warn(`Unknown blocker type: ${blockerType}`);
      return {
        action: "escalate",
        reason: `Unknown blocker (${blockerType}): ${reason}`,
      };
    }
  }
}

// ─── Retry Tracking ──────────────────────────────────────────────────────────

async function getTaskRetryCount(
  ticketRef: string,
  taskId: string
): Promise<number> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { epicKey: ticketRef },
  });
  if (pipeline === null) return 0;

  const metadata = pipeline.metadata as Record<string, unknown> | null;
  const retries = metadata?.taskRetries as Record<string, number> | undefined;
  return retries?.[taskId] ?? 0;
}

async function incrementTaskRetryCount(
  ticketRef: string,
  taskId: string
): Promise<void> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { epicKey: ticketRef },
  });
  if (pipeline === null) return;

  const metadata = (pipeline.metadata as Record<string, unknown> | null) ?? {};
  const retries = (metadata.taskRetries as Record<string, number> | undefined) ?? {};
  retries[taskId] = (retries[taskId] ?? 0) + 1;

  await prisma.pipeline.update({
    where: { epicKey: ticketRef },
    data: {
      metadata: { ...metadata, taskRetries: retries },
    },
  });
}
