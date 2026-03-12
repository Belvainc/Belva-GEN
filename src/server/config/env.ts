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
    .default("postgresql://james@localhost:5432/belva_gen_dev"),

  // Redis
  REDIS_URL: z
    .string()
    .default("redis://localhost:6379"),

  // Jira integration (optional — stubs used when absent)
  JIRA_BASE_URL: z.string().url().optional(),
  JIRA_USER_EMAIL: z.string().email().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_PROJECT_KEY: z.string().default("BELVA"),

  // Slack Notifications (optional — stubs used when absent)
  // Use Incoming Webhook URL, not Bot Token
  SLACK_WEBHOOK_URL: z.string().url().optional(),

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

  // Agent execution
  AGENT_EXECUTOR: z
    .enum(["mock", "claude", "openclaw"])
    .default("mock"),

  // Anthropic LLM (optional — stubs used when absent)
  // Used for task decomposition and agent execution
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),

  // GitHub (for PR creation in Plans 09/10)
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO: z.string().optional(), // format: "owner/repo"

  // OpenClaw (future)
  OPENCLAW_ENDPOINT: z.string().url().optional(),
  OPENCLAW_API_KEY: z.string().optional(),

  // Authentication
  JWT_SECRET: z
    .string()
    .min(32)
    .default("dev-jwt-secret-must-be-at-least-32-characters"),
  ENCRYPTION_KEY: z
    .string()
    .length(64)
    .default("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),

  // Seed admin user (used by prisma/seed.ts)
  SEED_ADMIN_EMAIL: z.string().email().default("admin@belva.dev"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("admin-dev-password-change-me"),

  // Human Approval Flow
  // Dashboard URL for approval links in Slack notifications
  DASHBOARD_URL: z.string().url().default("http://localhost:3000"),
  // Deprecated: replaced by RBAC user roles. Kept for backward compatibility.
  ALLOWED_APPROVERS: z.string().optional(),
  // Slack channel for approval notifications
  SLACK_APPROVAL_CHANNEL: z.string().default("#approvals"),
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

/**
 * Check if a user is allowed to approve plans.
 * In development, all users are allowed if ALLOWED_APPROVERS is not set.
 * In production, requires explicit configuration.
 */
export function isAllowedApprover(userId: string): boolean {
  const env = getEnv();
  const allowedList = env.ALLOWED_APPROVERS;

  // In development, allow all if not configured
  if (allowedList === undefined) {
    return isDevelopment();
  }

  const approvers = allowedList.split(",").map((s) => s.trim().toLowerCase());
  return approvers.includes(userId.toLowerCase());
}
