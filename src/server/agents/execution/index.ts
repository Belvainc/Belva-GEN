import type { AgentExecutor } from "./types";
import { MockAgentExecutor } from "./mock-executor";
import { ClaudeCodeExecutor } from "./claude-executor";
import { getEnv } from "@/server/config/env";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "executor-factory" });

// ─── Lazy Singleton ─────────────────────────────────────────────────────────
// Executor is created once on first access, matching the existing singleton
// pattern used by prisma client, redis, and other server singletons.

let executor: AgentExecutor | undefined;

/**
 * Get the configured AgentExecutor singleton.
 * Selection is controlled by `AGENT_EXECUTOR` env var:
 * - "mock" (default): MockAgentExecutor — no external calls
 * - "claude": ClaudeCodeExecutor — Anthropic API
 * - "openclaw": reserved for future OpenClaw integration
 */
export function getExecutor(): AgentExecutor {
  if (executor === undefined) {
    const executorType = getEnv().AGENT_EXECUTOR;

    switch (executorType) {
      case "mock":
        executor = new MockAgentExecutor();
        break;
      case "claude":
        executor = new ClaudeCodeExecutor();
        break;
      case "openclaw":
        // Future: OpenClawExecutor
        logger.warn("OpenClaw executor not yet implemented, falling back to mock");
        executor = new MockAgentExecutor();
        break;
    }

    logger.info({ executorType }, "Agent executor initialized");
  }

  return executor;
}

/**
 * Reset the executor singleton. Used in tests.
 */
export function resetExecutor(): void {
  executor = undefined;
}

// Re-export types for convenience
export type { AgentExecutor, ExecutionRequest, ExecutionResult } from "./types";
