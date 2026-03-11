import pino from "pino";
import { getEnv, isDevelopment } from "./env";

// ─── Root Logger ─────────────────────────────────────────────────────────────
// Structured JSON logging via Pino. Human-readable in dev, machine-parseable
// in production. All server code should use this instead of console.log.

function createRootLogger(): pino.Logger {
  const env = getEnv();

  return pino({
    level: env.LOG_LEVEL,
    ...(isDevelopment() && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
    }),
  });
}

let rootLogger: pino.Logger | undefined;

function getRootLogger(): pino.Logger {
  if (rootLogger === undefined) {
    rootLogger = createRootLogger();
  }
  return rootLogger;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the root logger instance.
 */
export function getLogger(): pino.Logger {
  return getRootLogger();
}

/**
 * Create a child logger with additional context fields.
 * Use for scoping logs to a specific domain (agent, service, etc.).
 */
export function createChildLogger(
  context: Record<string, unknown>
): pino.Logger {
  return getRootLogger().child(context);
}

/**
 * Create a logger scoped to a specific agent.
 * Matches the existing createAgentLogger pattern from src/lib/logger.ts.
 */
export function createAgentLogger(
  agentId: string,
  ticketRef?: string
): pino.Logger {
  return getRootLogger().child({
    agent: agentId,
    ...(ticketRef !== undefined ? { ticketRef } : {}),
  });
}
