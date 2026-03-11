import type { TaskAssignment, TaskCompletion } from "@/types/agent-protocol";
import type { AgentRegistry } from "./registry";
import type { MessageBus } from "./message-bus";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

/**
 * Agent runner that manages task execution lifecycle.
 * Receives task assignments, dispatches to agents, and reports completions.
 */
export class AgentRunner {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly messageBus: MessageBus
  ) {
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    this.messageBus.subscribe("task-assignment", async (message) => {
      await this.executeTask(message);
    });

    this.messageBus.subscribe("task-completion", async (message) => {
      this.handleCompletion(message);
    });

    logger.info("Agent runner subscriptions initialized");
  }

  /**
   * Execute a task assignment by delegating to the target agent.
   */
  private async executeTask(assignment: TaskAssignment): Promise<void> {
    const { targetAgent, taskType, ticketRef } = assignment;

    const agentConfig = this.registry.getConfig(targetAgent);
    if (agentConfig === undefined) {
      logger.error(`Agent ${targetAgent} not found in registry`);
      return;
    }

    const canHandle = agentConfig.capabilities.taskTypes.includes(taskType);
    if (!canHandle) {
      logger.error(
        `Agent ${targetAgent} cannot handle task type: ${taskType}`
      );
      return;
    }

    // Update agent status to busy
    this.registry.updateStatus(targetAgent, {
      status: "busy",
      currentTask: ticketRef,
    });

    logger.info(
      `Task ${assignment.id} assigned to ${targetAgent} for ${ticketRef}`
    );

    // TODO: Implement actual agent execution via OpenClaw
    // The agent will process the task and publish a TaskCompletion message
  }

  /**
   * Handle a task completion report from an agent.
   */
  private handleCompletion(completion: TaskCompletion): void {
    const { sourceAgent, taskAssignmentId, summary } = completion;

    // Update agent status back to idle
    this.registry.updateStatus(sourceAgent, {
      status: "idle",
      currentTask: null,
    });

    logger.info(
      `Task ${taskAssignmentId} completed by ${sourceAgent}: ${summary}`
    );

    // TODO: Trigger DoD validation via orchestrator engine
  }
}
