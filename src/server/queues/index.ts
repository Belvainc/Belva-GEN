import { Queue, type JobsOptions } from "bullmq";
import { z } from "zod";
import { getEnv } from "@/server/config/env";

// BullMQ bundles its own ioredis — pass URL string, not our Redis instance.
function getConnectionUrl(): string {
  return getEnv().REDIS_URL;
}

// ─── Queue Names ─────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  WEBHOOK_PROCESSING: "webhook-processing",
  AGENT_TASKS: "agent-tasks",
  NOTIFICATIONS: "notifications",
  EXPIRATION_CHECKS: "expiration-checks",
} as const;

// ─── Job Data Schemas ────────────────────────────────────────────────────────

export const WebhookJobDataSchema = z.object({
  source: z.enum(["jira", "slack"]),
  payload: z.record(z.string(), z.unknown()),
  receivedAt: z.string().datetime(),
  signature: z.string().optional(),
});
export type WebhookJobData = z.infer<typeof WebhookJobDataSchema>;

export const AgentTaskJobDataSchema = z.object({
  taskType: z.enum(["backend", "frontend", "testing", "documentation", "orchestration"]),
  targetAgent: z.string().min(1),
  ticketRef: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().int().min(1).max(10).default(5),
});
export type AgentTaskJobData = z.infer<typeof AgentTaskJobDataSchema>;

// ─── Notification Job Data (Slack) ───────────────────────────────────────────

const ApprovalRequestNotificationSchema = z.object({
  type: z.literal("approval_request"),
  ticketRef: z.string().min(1),
  title: z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  dashboardUrl: z.string().url(),
});

const StatusUpdateNotificationSchema = z.object({
  type: z.literal("status_update"),
  ticketRef: z.string().min(1),
  status: z.enum(["approved", "rejected", "completed", "failed"]),
  message: z.string().min(1),
});

export const NotificationJobDataSchema = z.discriminatedUnion("type", [
  ApprovalRequestNotificationSchema,
  StatusUpdateNotificationSchema,
]);
export type NotificationJobData = z.infer<typeof NotificationJobDataSchema>;

// ─── Expiration Check Job Data ───────────────────────────────────────────────

export const ExpirationCheckJobDataSchema = z.object({
  triggeredAt: z.string().datetime(),
});
export type ExpirationCheckJobData = z.infer<typeof ExpirationCheckJobDataSchema>;

// ─── Default Job Options ─────────────────────────────────────────────────────

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600, // 24 hours
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600, // 7 days (DLQ retention)
  },
};

// ─── Queue Instances ─────────────────────────────────────────────────────────

export const webhookQueue = new Queue<WebhookJobData>(
  QUEUE_NAMES.WEBHOOK_PROCESSING,
  {
    connection: { url: getConnectionUrl() },
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  }
);

export const agentTaskQueue = new Queue<AgentTaskJobData>(
  QUEUE_NAMES.AGENT_TASKS,
  {
    connection: { url: getConnectionUrl() },
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      priority: 5,
    },
  }
);

export const notificationQueue = new Queue<NotificationJobData>(
  QUEUE_NAMES.NOTIFICATIONS,
  {
    connection: { url: getConnectionUrl() },
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 2,
    },
  }
);

export const expirationQueue = new Queue<ExpirationCheckJobData>(
  QUEUE_NAMES.EXPIRATION_CHECKS,
  {
    connection: { url: getConnectionUrl() },
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 1, // Don't retry if it fails - will run again on next schedule
    },
  }
);

/**
 * Close all queue connections. Called during shutdown.
 */
export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    webhookQueue.close(),
    agentTaskQueue.close(),
    notificationQueue.close(),
    expirationQueue.close(),
  ]);
}

// ─── Repeatable Jobs ─────────────────────────────────────────────────────────

/** Expiration check interval (1 hour in milliseconds) */
const EXPIRATION_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Start the expiration check repeatable job.
 * Should be called once at server startup after workers are initialized.
 */
export async function startExpirationChecker(): Promise<void> {
  // Remove any existing repeatable job to avoid duplicates
  const existingJobs = await expirationQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    if (job.name === "check-expirations") {
      await expirationQueue.removeRepeatableByKey(job.key);
    }
  }

  // Add new repeatable job
  await expirationQueue.add(
    "check-expirations",
    { triggeredAt: new Date().toISOString() },
    {
      repeat: {
        every: EXPIRATION_CHECK_INTERVAL_MS,
      },
      jobId: "expiration-checker-repeatable",
    }
  );
}

/**
 * Stop the expiration check repeatable job.
 * Call during shutdown to clean up.
 */
export async function stopExpirationChecker(): Promise<void> {
  const existingJobs = await expirationQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    if (job.name === "check-expirations") {
      await expirationQueue.removeRepeatableByKey(job.key);
    }
  }
}
