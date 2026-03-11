import type { AgentId } from "@/types/agent-protocol";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  agent?: AgentId;
  ticketRef?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

function formatEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
  ];

  if (entry.agent !== undefined) {
    parts.push(`[${entry.agent}]`);
  }

  if (entry.ticketRef !== undefined) {
    parts.push(`[${entry.ticketRef}]`);
  }

  parts.push(entry.message);

  return parts.join(" ");
}

function log(
  level: LogLevel,
  message: string,
  context?: { agent?: AgentId; ticketRef?: string; data?: Record<string, unknown> }
): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case "debug":
      console.debug(formatted, entry.data ?? "");
      break;
    case "info":
      console.info(formatted, entry.data ?? "");
      break;
    case "warn":
      console.warn(formatted, entry.data ?? "");
      break;
    case "error":
      console.error(formatted, entry.data ?? "");
      break;
  }
}

/**
 * Create a logger scoped to a specific agent context.
 */
export function createAgentLogger(agent: AgentId, ticketRef?: string) {
  const ctx = { agent, ticketRef };

  return {
    debug: (message: string, data?: Record<string, unknown>): void =>
      log("debug", message, { ...ctx, data }),
    info: (message: string, data?: Record<string, unknown>): void =>
      log("info", message, { ...ctx, data }),
    warn: (message: string, data?: Record<string, unknown>): void =>
      log("warn", message, { ...ctx, data }),
    error: (message: string, data?: Record<string, unknown>): void =>
      log("error", message, { ...ctx, data }),
  };
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>): void =>
    log("debug", message, { data }),
  info: (message: string, data?: Record<string, unknown>): void =>
    log("info", message, { data }),
  warn: (message: string, data?: Record<string, unknown>): void =>
    log("warn", message, { data }),
  error: (message: string, data?: Record<string, unknown>): void =>
    log("error", message, { data }),
};
