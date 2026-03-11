import { Worker, type Job } from "bullmq";
import { getEnv } from "@/server/config/env";
import {
  QUEUE_NAMES,
  WebhookJobDataSchema,
  AgentTaskJobDataSchema,
  NotificationJobDataSchema,
  type WebhookJobData,
  type AgentTaskJobData,
  type NotificationJobData,
} from "@/server/queues";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "workers" });

// ─── Webhook Worker ──────────────────────────────────────────────────────────

async function processWebhook(job: Job<WebhookJobData>): Promise<void> {
  const data = WebhookJobDataSchema.parse(job.data);
  logger.info({ source: data.source, jobId: job.id }, "Processing webhook");

  // TODO: Route to appropriate handler based on source
  // - jira: parseWebhookPayload → handleEvent
  // - slack: parseApprovalAction → handleApproval
  logger.info({ source: data.source, jobId: job.id }, "Webhook processed");
}

// ─── Agent Task Worker ───────────────────────────────────────────────────────

async function processAgentTask(job: Job<AgentTaskJobData>): Promise<void> {
  const data = AgentTaskJobDataSchema.parse(job.data);
  logger.info(
    { targetAgent: data.targetAgent, ticketRef: data.ticketRef, jobId: job.id },
    "Processing agent task"
  );

  // TODO: Dispatch task assignment via message bus
  logger.info(
    { targetAgent: data.targetAgent, jobId: job.id },
    "Agent task dispatched"
  );
}

// ─── Notification Worker ─────────────────────────────────────────────────────

async function processNotification(
  job: Job<NotificationJobData>
): Promise<void> {
  const data = NotificationJobDataSchema.parse(job.data);
  logger.info(
    { channel: data.channel, jobId: job.id },
    "Sending notification"
  );

  // TODO: Send via Slack MCP client
  logger.info(
    { channel: data.channel, jobId: job.id },
    "Notification sent"
  );
}

// ─── Worker Instances ────────────────────────────────────────────────────────

let webhookWorker: Worker<WebhookJobData> | undefined;
let agentTaskWorker: Worker<AgentTaskJobData> | undefined;
let notificationWorker: Worker<NotificationJobData> | undefined;

/**
 * Start all BullMQ workers. Call once at server startup.
 */
export function startWorkers(): void {
  // BullMQ bundles its own ioredis — pass URL string, not our Redis instance.
  const connection = { url: getEnv().REDIS_URL };

  webhookWorker = new Worker<WebhookJobData>(
    QUEUE_NAMES.WEBHOOK_PROCESSING,
    processWebhook,
    { connection, concurrency: 5 }
  );

  agentTaskWorker = new Worker<AgentTaskJobData>(
    QUEUE_NAMES.AGENT_TASKS,
    processAgentTask,
    { connection, concurrency: 3 }
  );

  notificationWorker = new Worker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATIONS,
    processNotification,
    { connection, concurrency: 2 }
  );

  // Error handlers
  for (const [name, worker] of Object.entries({
    webhook: webhookWorker,
    agentTask: agentTaskWorker,
    notification: notificationWorker,
  })) {
    worker.on("failed", (job, err) => {
      logger.error(
        { worker: name, jobId: job?.id, error: err.message },
        "Job failed"
      );
    });

    worker.on("error", (err) => {
      logger.error({ worker: name, error: err.message }, "Worker error");
    });
  }

  logger.info("All workers started");
}

/**
 * Gracefully shut down all workers. Drains in-progress jobs before closing.
 */
export async function stopWorkers(): Promise<void> {
  logger.info("Stopping workers...");
  await Promise.allSettled([
    webhookWorker?.close(),
    agentTaskWorker?.close(),
    notificationWorker?.close(),
  ]);
  logger.info("All workers stopped");
}
