import type { AgentRegistry } from "../agents/registry";
import type { AgentStatus, AgentConfig } from "../agents/types";
import type { AgentId } from "@/types/agent-protocol";
import { NotFoundError } from "@/lib/errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentServiceDeps {
  registry: AgentRegistry;
}

export interface AgentWithStatus {
  config: AgentConfig;
  status: AgentStatus;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Get all registered agents with their current statuses.
 */
export async function getAllAgentStatuses(
  deps: AgentServiceDeps
): Promise<AgentWithStatus[]> {
  const configs = deps.registry.getAllConfigs();
  return configs.map((config) => {
    const status = deps.registry.getStatus(config.agentId);
    return {
      config,
      status: status ?? createOfflineStatus(config.agentId),
    };
  });
}

/**
 * Get a specific agent's status by ID.
 */
export async function getAgentStatus(
  deps: AgentServiceDeps,
  agentId: AgentId
): Promise<AgentWithStatus> {
  const config = deps.registry.getConfig(agentId);
  if (config === undefined) {
    throw new NotFoundError(`Agent ${agentId} not found`, "agent", agentId);
  }
  const status = deps.registry.getStatus(agentId);
  return {
    config,
    status: status ?? createOfflineStatus(agentId),
  };
}

/**
 * Update an agent's heartbeat timestamp.
 */
export async function updateAgentHeartbeat(
  deps: AgentServiceDeps,
  agentId: AgentId
): Promise<void> {
  const config = deps.registry.getConfig(agentId);
  if (config === undefined) {
    throw new NotFoundError(`Agent ${agentId} not found`, "agent", agentId);
  }
  deps.registry.updateStatus(agentId, {
    lastHeartbeat: new Date().toISOString(),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createOfflineStatus(agentId: AgentId): AgentStatus {
  return {
    agentId,
    status: "offline",
    currentTask: null,
    lastHeartbeat: new Date().toISOString(),
  };
}
