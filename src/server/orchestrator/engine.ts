import type { AgentId, TaskType } from "@/types/agent-protocol";
import type { DomainEvent, EpicState } from "@/types/events";
import type { GateResult } from "@/types/gates";
import type { EpicContext, OrchestratorConfig } from "./types";
import { OrchestratorConfigSchema } from "./types";
import { validateTransition } from "./state-machine";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

/**
 * Core orchestration engine that drives the epic lifecycle.
 * Receives events, evaluates gates, and delegates work to specialized agents.
 */
export class OrchestratorEngine {
  private readonly config: OrchestratorConfig;
  private readonly epics: Map<string, EpicContext> = new Map();

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = OrchestratorConfigSchema.parse(config ?? {});
    logger.info("Orchestrator engine initialized", {
      approvalTimeoutMs: this.config.approvalTimeoutMs,
      maxRevisionCycles: this.config.maxRevisionCycles,
    });
  }

  /**
   * Process an incoming domain event and determine the next action.
   */
  async handleEvent(event: DomainEvent): Promise<void> {
    logger.info(`Processing event: ${event.kind}`, { ticketRef: event.ticketRef });

    switch (event.kind) {
      case "dor-pass":
        await this.onDoRPass(event.ticketRef);
        break;
      case "dor-fail":
        logger.warn(`DoR failed for ${event.ticketRef}`, {
          failures: event.failures.length,
        });
        break;
      case "plan-approved":
        await this.onPlanApproved(event.ticketRef);
        break;
      case "plan-rejected":
        await this.onPlanRejected(event.ticketRef);
        break;
      case "plan-revision-requested":
        await this.onPlanRevisionRequested(event.ticketRef, event.revisionCount);
        break;
      case "plan-expired":
        logger.warn(`Plan expired for ${event.ticketRef}`);
        break;
      case "dod-pass":
        await this.onDoDPass(event.ticketRef);
        break;
      case "dod-fail":
        logger.warn(`DoD failed for ${event.ticketRef}`, {
          failures: event.failures.length,
        });
        break;
      case "epic-state-transition":
        logger.info(
          `Epic ${event.ticketRef}: ${event.fromState} → ${event.toState}`,
          { reason: event.reason }
        );
        break;
      default: {
        const _exhaustive: never = event;
        throw new Error(`Unhandled event kind: ${(_exhaustive as DomainEvent).kind}`);
      }
    }
  }

  /**
   * Transition an epic to a new state after validation.
   */
  transitionEpic(
    ticketRef: string,
    targetState: EpicState,
    trigger: string
  ): GateResult {
    const epic = this.epics.get(ticketRef);
    if (epic === undefined) {
      return {
        gateType: "dor",
        ticketRef,
        passed: false,
        evaluatedAt: new Date().toISOString(),
        violations: [
          {
            rule: "epic-exists",
            description: `Epic ${ticketRef} not found in registry`,
            severity: "error",
          },
        ],
      };
    }

    const result = validateTransition(epic.currentState, targetState, trigger);

    if (!result.valid) {
      return {
        gateType: "dor",
        ticketRef,
        passed: false,
        evaluatedAt: new Date().toISOString(),
        violations: [
          {
            rule: "valid-transition",
            description: result.reason,
            severity: "error",
          },
        ],
      };
    }

    epic.currentState = targetState;
    epic.updatedAt = new Date().toISOString();

    logger.info(`Epic ${ticketRef} transitioned to ${targetState}`, {
      trigger,
    });

    return {
      gateType: "dor",
      ticketRef,
      passed: true,
      evaluatedAt: new Date().toISOString(),
      violations: [],
    };
  }

  /**
   * Register a new epic in the engine.
   */
  registerEpic(ticketRef: string): void {
    const now = new Date().toISOString();
    this.epics.set(ticketRef, {
      ticketRef,
      currentState: "funnel",
      assignedAgents: [],
      revisionCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    logger.info(`Epic ${ticketRef} registered in funnel state`);
  }

  /**
   * Determine which agent should handle a given task type.
   */
  resolveAgent(taskType: TaskType): AgentId {
    switch (taskType) {
      case "backend":
      case "orchestration":
        return "node-backend";
      case "frontend":
        return "next-ux";
      case "testing":
        return "ts-testing";
      default: {
        const _exhaustive: never = taskType;
        throw new Error(`Unknown task type: ${String(_exhaustive)}`);
      }
    }
  }

  getEpic(ticketRef: string): EpicContext | undefined {
    return this.epics.get(ticketRef);
  }

  getAllEpics(): ReadonlyArray<EpicContext> {
    return Array.from(this.epics.values());
  }

  private async onDoRPass(ticketRef: string): Promise<void> {
    this.transitionEpic(ticketRef, "approved", "dor-passed");
    logger.info(`DoR passed for ${ticketRef}, awaiting plan approval`);
    // TODO: Generate implementation plan and trigger human-plan-approval
  }

  private async onPlanApproved(ticketRef: string): Promise<void> {
    this.transitionEpic(ticketRef, "in-progress", "plan-approved");
    logger.info(`Plan approved for ${ticketRef}, delegating to agents`);
    // TODO: Create TaskAssignment messages and dispatch via message bus
  }

  private async onPlanRejected(ticketRef: string): Promise<void> {
    this.transitionEpic(ticketRef, "refinement", "plan-rejected");
    logger.info(`Plan rejected for ${ticketRef}, returning to refinement`);
  }

  private async onPlanRevisionRequested(
    ticketRef: string,
    revisionCount: number
  ): Promise<void> {
    if (revisionCount >= this.config.maxRevisionCycles) {
      logger.warn(
        `Max revision cycles (${this.config.maxRevisionCycles}) reached for ${ticketRef}`
      );
    }
    logger.info(`Plan revision #${revisionCount} requested for ${ticketRef}`);
    // TODO: Re-run planning with feedback, re-trigger human-plan-approval
  }

  private async onDoDPass(ticketRef: string): Promise<void> {
    this.transitionEpic(ticketRef, "done", "dod-passed");
    logger.info(`DoD passed for ${ticketRef}, proceeding to squash-merge`);
    // TODO: Trigger squash-merge per git-safety rules
  }
}
