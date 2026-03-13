import { OrchestratorEngine } from "./orchestrator/engine";
import { AgentRegistry } from "./agents/registry";
import { MessageBus } from "./agents/message-bus";
import { getJiraMCPClient } from "./mcp/jira";
import { getSlackNotificationClient } from "./mcp/slack";
import { getEnv } from "./config/env";
import { createChildLogger } from "./config/logger";
import { getConfigValue } from "./services/system-config.service";

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

/**
 * Load orchestrator config from SystemConfig (DB + Redis cache).
 * Falls back to defaults if DB is unavailable.
 */
async function loadOrchestratorConfig(): Promise<{
  approvalTimeoutMs: number;
  maxRevisionCycles: number;
  maxConcurrentTasksPerEpic: number;
  enableSlackNotifications: boolean;
}> {
  try {
    const [approvalTimeoutMs, maxRevisionCycles, maxConcurrentTasksPerEpic, enableSlackNotifications] =
      await Promise.all([
        getConfigValue<number>("approvalTimeoutMs"),
        getConfigValue<number>("maxRevisionCycles"),
        getConfigValue<number>("maxConcurrentTasksPerEpic"),
        getConfigValue<boolean>("enableSlackNotifications"),
      ]);
    return { approvalTimeoutMs, maxRevisionCycles, maxConcurrentTasksPerEpic, enableSlackNotifications };
  } catch (error) {
    logger.warn(
      { error },
      "Failed to load system config, using hardcoded defaults"
    );
    const env = getEnv();
    return {
      approvalTimeoutMs: 24 * 60 * 60 * 1000,
      maxRevisionCycles: 3,
      maxConcurrentTasksPerEpic: env.NODE_ENV === "production" ? 3 : 2,
      enableSlackNotifications: true,
    };
  }
}

function createServerContext(config: {
  approvalTimeoutMs: number;
  maxRevisionCycles: number;
  maxConcurrentTasksPerEpic: number;
  enableSlackNotifications: boolean;
}): ServerContext {
  const messageBus = new MessageBus();
  const registry = new AgentRegistry();

  const engine = new OrchestratorEngine(config);

  logger.info(config, "Server context created with system config");

  return { engine, registry, messageBus };
}

/**
 * Get the server context singleton.
 * Creates the context lazily on first access with default config.
 * For production use, call initializeServerContext() first.
 */
export function getServerContext(): ServerContext {
  if (_context === undefined) {
    const env = getEnv();
    _context = createServerContext({
      approvalTimeoutMs: 24 * 60 * 60 * 1000,
      maxRevisionCycles: 3,
      maxConcurrentTasksPerEpic: env.NODE_ENV === "production" ? 3 : 2,
      enableSlackNotifications: true,
    });
  }
  return _context;
}

/**
 * Initialize engine dependencies. Call once during server startup.
 * Loads system config from DB, then initializes MCP clients.
 */
export async function initializeServerContext(): Promise<void> {
  if (_initialized) {
    logger.debug("Server context already initialized");
    return;
  }

  // Load config from DB (or defaults)
  const config = await loadOrchestratorConfig();
  _context = createServerContext(config);

  const ctx = _context;
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
