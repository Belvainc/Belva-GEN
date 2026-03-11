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
  taskType: z.enum(["backend", "frontend", "testing", "orchestration"]),
  targetAgent: z.string().min(1),
  ticketRef: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().int().min(1).max(10).default(5),
});
export type AgentTaskJobData = z.infer<typeof AgentTaskJobDataSchema>;

export const NotificationJobDataSchema = z.object({
  channel: z.string().min(1),
  message: z.string().min(1),
  ticketRef: z.string().optional(),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),
});
export type NotificationJobData = z.infer<typeof NotificationJobDataSchema>;

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

/**
 * Close all queue connections. Called during shutdown.
 */
export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    webhookQueue.close(),
    agentTaskQueue.close(),
    notificationQueue.close(),
  ]);
}
