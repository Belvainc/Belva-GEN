import type { TaskAssignment, TaskCompletion } from "@/types/agent-protocol";
import type { AgentRegistry } from "./registry";
import type { MessageBus } from "./message-bus";
import { getExecutor } from "./execution";
import { composeSystemPrompt, composeOpenClawPrompt } from "./execution/prompt-composer";
import type { ExecutionRequest } from "./execution/types";
import { getEnv } from "@/server/config/env";
import { prisma } from "@/server/db/client";
import { createAgentLogger } from "@/lib/logger";
import { getConfigValue } from "@/server/services/system-config.service";

const logger = createAgentLogger("orchestrator-project");

/**
 * Agent runner that manages task execution lifecycle.
 * Receives task assignments, dispatches to agents via the configured
 * AgentExecutor, and reports completions back to the MessageBus.
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
   * Execute a task assignment by delegating to the configured AgentExecutor.
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

    const executor = getExecutor();
    const executorType = getEnv().AGENT_EXECUTOR;

    try {
      // Compose system prompt based on executor type
      let systemPrompt: string;

      if (executorType === "openclaw" && agentConfig.role) {
        // OpenClaw: load from project repo's openclaw/agents/<role>.md + SOUL.md
        const repoPath = await this.resolveRepoPath(ticketRef);
        systemPrompt = await composeOpenClawPrompt(
          agentConfig.role,
          repoPath
        );
      } else {
        // Legacy: load from .claude/agents/<agentId>.md + .claude/rules/
        systemPrompt = await composeSystemPrompt(
          targetAgent,
          agentConfig.ownedPaths
        );
      }

      // Build execution request
      const timeoutMs = await getConfigValue<number>("taskTimeoutMs");

      const request: ExecutionRequest = {
        taskId: assignment.id,
        agentId: targetAgent,
        taskType,
        ticketRef,
        description: assignment.description,
        constraints: assignment.constraints,
        acceptanceCriteria: assignment.acceptanceCriteria,
        domainPaths: agentConfig.ownedPaths,
        systemPrompt,
        model: agentConfig.preferredModel ?? undefined,
        timeoutMs,
      };

      // Execute via the configured executor (mock, claude, or openclaw)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

      try {
        const result = await executor.execute(request, controller.signal);

        // Publish task completion
        await this.messageBus.publish({
          kind: "task-completion",
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          sourceAgent: targetAgent,
          taskAssignmentId: assignment.id,
          changedFiles: result.changedFiles,
          testRequirements: result.testRequirements,
          summary: result.summary,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Task ${assignment.id} execution failed: ${errorMessage}`);

      // Publish failure completion
      await this.messageBus.publish({
        kind: "task-completion",
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        sourceAgent: targetAgent,
        taskAssignmentId: assignment.id,
        changedFiles: [],
        testRequirements: [],
        summary: `Execution failed: ${errorMessage}`,
      });
    } finally {
      // Always reset agent status
      this.registry.updateStatus(targetAgent, {
        status: "idle",
        currentTask: null,
      });
    }
  }

  /**
   * Resolve the repo path for a ticket by looking up its pipeline's project.
   * Falls back to current working directory if not found.
   */
  private async resolveRepoPath(ticketRef: string): Promise<string> {
    try {
      const pipeline = await prisma.pipeline.findUnique({
        where: { epicKey: ticketRef },
        include: { project: true },
      });

      if (pipeline?.project?.repoPath) {
        return pipeline.project.repoPath;
      }
    } catch {
      logger.warn(`Failed to resolve repo path from pipeline for ${ticketRef}`);
    }

    // Fallback to current project
    return process.cwd();
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

    // DoD validation is triggered by the orchestrator engine when all tasks
    // for an epic are complete (engine.onTaskCompleted → triggerDoDValidation).
    // The engine subscribes to task-completion events on the same message bus.
  }
}
