import { z } from "zod";

// ─── Environment Schema ──────────────────────────────────────────────────────
// Validates all environment variables at startup. App crashes immediately
// if required vars are missing — fail fast, not at first request.

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://belva:belva@localhost:5432/belva_dev"),

  // Redis
  REDIS_URL: z
    .string()
    .default("redis://localhost:6379"),

  // Jira MCP (optional — stubs used when absent)
  JIRA_BASE_URL: z.string().url().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_PROJECT_KEY: z.string().default("BELVA"),

  // Slack MCP (optional — stubs used when absent)
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APPROVAL_CHANNEL: z.string().default("#belva-approvals"),
  SLACK_NOTIFICATION_CHANNEL: z.string().default("#belva-notifications"),

  // Webhook security
  WEBHOOK_SECRET: z
    .string()
    .min(32)
    .default("dev-webhook-secret-must-be-32-chars-min"),

  // Logging
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  // Server
  PORT: z.coerce.number().int().positive().default(3000),

  // OpenTelemetry (optional)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default("belva-gen"),
});

export type Env = z.infer<typeof envSchema>;

// ─── Lazy Initialization ─────────────────────────────────────────────────────
// Parse once on first access, cache the result. This avoids crashing during
// build time (Next.js compiles server code before env is available).

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached === undefined) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}

/**
 * Check if we're in development mode.
 * Safe to call even before full env validation.
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}
