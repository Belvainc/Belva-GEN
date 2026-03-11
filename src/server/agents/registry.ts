import type { AgentId } from "@/types/agent-protocol";
import type { AgentConfig, AgentStatus } from "./types";
import { AgentConfigSchema } from "./types";
import { parseOrThrow } from "@/lib/validation";
import { logger } from "@/lib/logger";

/**
 * Registry of all known agents and their configurations.
 * The orchestrator uses this to look up agents by ID or capability.
 */
export class AgentRegistry {
  private readonly agents: Map<AgentId, AgentConfig> = new Map();
  private readonly statuses: Map<AgentId, AgentStatus> = new Map();

  /**
   * Register an agent with its configuration.
   */
  register(config: unknown): void {
    const validated = parseOrThrow(AgentConfigSchema, config);
    this.agents.set(validated.agentId, validated);
    this.statuses.set(validated.agentId, {
      agentId: validated.agentId,
      status: "idle",
      currentTask: null,
      lastHeartbeat: new Date().toISOString(),
    });
    logger.info(`Agent registered: ${validated.agentId} (${validated.name})`);
  }

  /**
   * Get an agent's configuration by ID.
   */
  getConfig(agentId: AgentId): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get an agent's current status.
   */
  getStatus(agentId: AgentId): AgentStatus | undefined {
    return this.statuses.get(agentId);
  }

  /**
   * Update an agent's status.
   */
  updateStatus(agentId: AgentId, status: Partial<AgentStatus>): void {
    const current = this.statuses.get(agentId);
    if (current === undefined) {
      logger.warn(`Cannot update status for unregistered agent: ${agentId}`);
      return;
    }
    this.statuses.set(agentId, {
      ...current,
      ...status,
      lastHeartbeat: new Date().toISOString(),
    });
  }

  /**
   * Get all registered agents.
   */
  getAllConfigs(): ReadonlyArray<AgentConfig> {
    return Array.from(this.agents.values());
  }

  /**
   * Get all agent statuses.
   */
  getAllStatuses(): ReadonlyArray<AgentStatus> {
    return Array.from(this.statuses.values());
  }

  /**
   * Find agents capable of handling a specific task type.
   */
  findByTaskType(taskType: string): ReadonlyArray<AgentConfig> {
    return Array.from(this.agents.values()).filter((config) =>
      config.capabilities.taskTypes.includes(taskType as never)
    );
  }
}
