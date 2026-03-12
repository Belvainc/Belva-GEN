import { OrchestratorEngine } from "./orchestrator/engine";
import { AgentRegistry } from "./agents/registry";
import { MessageBus } from "./agents/message-bus";
import { getJiraMCPClient } from "./mcp/jira";
import { getSlackNotificationClient } from "./mcp/slack";
import { getEnv } from "./config/env";
import { createChildLogger } from "./config/logger";

const logger = createChildLogger({ module: "server-context" });

// ─── Server Context ──────────────────────────────────────────────────────────
// Singleton providing access to all infrastructure providers.
// Services receive subset of context as explicit dependencies.

export interface ServerContext {
  readonly engine: OrchestratorEngine;
  readonly registry: AgentRegistry;
  readonly messageBus: MessageBus;
}

let _context: ServerContext | undefined;
let _initialized = false;

function createServerContext(): ServerContext {
  const env = getEnv();
  const messageBus = new MessageBus();
  const registry = new AgentRegistry();

  const engine = new OrchestratorEngine({
    approvalTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
    maxRevisionCycles: 3,
    maxConcurrentTasksPerEpic: env.NODE_ENV === "production" ? 3 : 2,
  });

  logger.info("Server context created");

  return { engine, registry, messageBus };
}

/**
 * Get the server context singleton.
 * Creates the context lazily on first access.
 */
export function getServerContext(): ServerContext {
  if (_context === undefined) {
    _context = createServerContext();
  }
  return _context;
}

/**
 * Initialize engine dependencies. Call once during server startup.
 * MCP clients may use stubs in dev mode.
 */
export async function initializeServerContext(): Promise<void> {
  if (_initialized) {
    logger.debug("Server context already initialized");
    return;
  }

  const ctx = getServerContext();
  const jiraClient = getJiraMCPClient();
  const slackClient = getSlackNotificationClient();

  await ctx.engine.initialize({
    jiraClient,
    slackClient,
    messageBus: ctx.messageBus,
    agentRegistry: ctx.registry,
  });

  _initialized = true;
  logger.info("Server context initialized with MCP clients");
}

/**
 * Check if the server context has been initialized.
 */
export function isContextInitialized(): boolean {
  return _initialized;
}

/**
 * For testing: inject mock context.
 */
export function setServerContext(context: ServerContext): void {
  _context = context;
  _initialized = true;
}

/**
 * For testing: reset context to uninitialized state.
 */
export function resetServerContext(): void {
  _context = undefined;
  _initialized = false;
}
