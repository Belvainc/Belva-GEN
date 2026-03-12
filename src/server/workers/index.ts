import { Worker, type Job } from "bullmq";
import { getEnv } from "@/server/config/env";
import {
  QUEUE_NAMES,
  WebhookJobDataSchema,
  AgentTaskJobDataSchema,
  NotificationJobDataSchema,
  ExpirationCheckJobDataSchema,
  type WebhookJobData,
  type AgentTaskJobData,
  type NotificationJobData,
  type ExpirationCheckJobData,
} from "@/server/queues";
import { createChildLogger } from "@/server/config/logger";
import { getJiraMCPClient, hasGenLabel } from "@/server/mcp/jira";
import {
  getSlackNotificationClient,
  buildApprovalRequestPayload,
  buildStatusUpdatePayload,
} from "@/server/mcp/slack";
import { SlackApprovalSchema } from "@/server/mcp/slack/types";
import { getOrchestratorEngine } from "@/server/orchestrator";
import { prisma } from "@/server/db/client";
import { checkExpiringApprovals } from "./expiration-checker";
import { randomUUID } from "node:crypto";

const logger = createChildLogger({ module: "workers" });

// ─── Webhook Worker ──────────────────────────────────────────────────────

async function processWebhook(job: Job<WebhookJobData>): Promise<void> {
  const data = WebhookJobDataSchema.parse(job.data);
  logger.info({ source: data.source, jobId: job.id }, "Processing webhook");

  if (data.source === "jira") {
    await processJiraWebhook(data, job.id ?? "unknown");
  } else if (data.source === "slack") {
    await processSlackWebhook(data, job.id ?? "unknown");
  }

  logger.info({ source: data.source, jobId: job.id }, "Webhook processed");
}

/**
 * Process a Jira webhook event.
 * Detects "GEN" label and registers epics in the orchestrator.
 */
async function processJiraWebhook(
  data: WebhookJobData,
  jobId: string
): Promise<void> {
  const jiraClient = getJiraMCPClient();
  const engine = getOrchestratorEngine();

  // Parse and validate the webhook payload
  const payload = jiraClient.parseWebhookPayload(data.payload);
  const issueKey = payload.issue.key;

  logger.info(
    { issueKey, event: payload.webhookEvent, jobId },
    "Processing Jira webhook"
  );

  // Check for GEN label to auto-register epics
  if (hasGenLabel(payload)) {
    logger.info({ issueKey, jobId }, "GEN label detected - registering epic");

    // Register the epic in the orchestrator
    engine.registerEpic(issueKey);

    // Emit state transition event to move from funnel to refinement
    await engine.handleEvent({
      kind: "epic-state-transition",
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ticketRef: issueKey,
      fromState: "funnel",
      toState: "refinement",
      reason: "GEN label detected via Jira webhook",
    });

    logger.info(
      { issueKey, jobId },
      "Epic registered and transitioned to refinement"
    );
  }

  // Log changelog if present (useful for tracking field changes)
  if (payload.changelog !== undefined) {
    for (const item of payload.changelog.items) {
      logger.debug(
        {
          issueKey,
          field: item.field,
          from: item.fromString,
          to: item.toString,
          jobId,
        },
        "Jira field changed"
      );
    }
  }
}

/**
 * Process a Slack interactive webhook (approval actions).
 * Parses the action payload, finds the matching approval, and dispatches
 * the appropriate engine event.
 */
async function processSlackWebhook(
  data: WebhookJobData,
  jobId: string
): Promise<void> {
  const engine = getOrchestratorEngine();

  const parseResult = SlackApprovalSchema.safeParse(data.payload);
  if (!parseResult.success) {
    logger.warn({ jobId, error: parseResult.error.message }, "Invalid Slack approval payload");
    return;
  }

  const { userId, action, comment } = parseResult.data;

  // Find the pending approval matching this Slack interaction
  const pendingApproval = await prisma.approval.findFirst({
    where: { status: "PENDING" },
    include: { pipeline: true },
    orderBy: { createdAt: "desc" },
  });

  if (pendingApproval === null) {
    logger.warn({ jobId, userId }, "No pending approval found for Slack action");
    return;
  }

  const ticketRef = pendingApproval.pipeline.epicKey;

  logger.info(
    { ticketRef, userId, action, jobId },
    "Processing Slack approval action"
  );

  if (action === "approved") {
    await engine.handleEvent({
      kind: "plan-approved",
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ticketRef,
      approverIdentity: userId,
      planHash: pendingApproval.planHash ?? "",
    });
  } else if (action === "rejected") {
    await engine.handleEvent({
      kind: "plan-rejected",
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ticketRef,
      reviewerIdentity: userId,
      reason: comment ?? "Rejected via Slack",
    });
  } else if (action === "revision-requested") {
    const epic = engine.getEpic(ticketRef);
    await engine.handleEvent({
      kind: "plan-revision-requested",
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ticketRef,
      reviewerIdentity: userId,
      revisionCount: (epic?.revisionCount ?? 0) + 1,
      feedback: comment ?? "Revision requested via Slack",
    });
  }

  // Update approval record (revision-requested maps to REJECTED in Prisma — no REVISION_REQUESTED enum value)
  const prismaStatus = action === "approved" ? "APPROVED" as const : "REJECTED" as const;
  await prisma.approval.update({
    where: { id: pendingApproval.id },
    data: {
      status: prismaStatus,
      decidedByLegacy: userId,
      decidedAt: new Date(),
      reason: comment ?? undefined,
    },
  });

  logger.info({ ticketRef, action, jobId }, "Slack approval action processed");
}

// ─── Agent Task Worker ───────────────────────────────────────────────────

async function processAgentTask(job: Job<AgentTaskJobData>): Promise<void> {
  const data = AgentTaskJobDataSchema.parse(job.data);
  logger.info(
    { targetAgent: data.targetAgent, ticketRef: data.ticketRef, jobId: job.id },
    "Processing agent task"
  );

  // Dispatch task assignment via message bus to the agent runner
  const engine = getOrchestratorEngine();
  if (engine.deps === undefined) {
    logger.error({ jobId: job.id }, "Engine not initialized, cannot dispatch task");
    throw new Error("Engine not initialized");
  }

  await engine.deps.messageBus.publish({
    kind: "task-assignment",
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    sourceAgent: "orchestrator-project",
    targetAgent: data.targetAgent,
    taskType: data.taskType,
    ticketRef: data.ticketRef,
    description: data.description,
    constraints: [],
    acceptanceCriteria: [],
  });

  logger.info(
    { targetAgent: data.targetAgent, ticketRef: data.ticketRef, jobId: job.id },
    "Agent task dispatched via message bus"
  );
}

// ─── Notification Worker ─────────────────────────────────────────────────

async function processNotification(
  job: Job<NotificationJobData>
): Promise<void> {
  const data = NotificationJobDataSchema.parse(job.data);
  const slackClient = getSlackNotificationClient();

  logger.info(
    { type: data.type, ticketRef: data.ticketRef, jobId: job.id },
    "Processing notification"
  );

  if (data.type === "approval_request") {
    const payload = buildApprovalRequestPayload({
      ticketRef: data.ticketRef,
      title: data.title,
      riskLevel: data.riskLevel,
      dashboardUrl: data.dashboardUrl,
    });
    await slackClient.send(payload);
  } else if (data.type === "status_update") {
    const payload = buildStatusUpdatePayload({
      ticketRef: data.ticketRef,
      status: data.status,
      message: data.message,
    });
    await slackClient.send(payload);
  }

  logger.info(
    { type: data.type, ticketRef: data.ticketRef, jobId: job.id },
    "Notification sent"
  );
}

// ─── Expiration Check Worker ─────────────────────────────────────────────

async function processExpirationCheck(
  job: Job<ExpirationCheckJobData>
): Promise<void> {
  const data = ExpirationCheckJobDataSchema.parse(job.data);
  logger.info({ triggeredAt: data.triggeredAt, jobId: job.id }, "Running expiration check");

  const result = await checkExpiringApprovals();

  logger.info(
    {
      soonToExpire: result.soonToExpire,
      expired: result.expired,
      errors: result.errors.length,
      jobId: job.id,
    },
    "Expiration check completed"
  );
}

// ─── Worker Instances ────────────────────────────────────────────────────

let webhookWorker: Worker<WebhookJobData> | undefined;
let agentTaskWorker: Worker<AgentTaskJobData> | undefined;
let notificationWorker: Worker<NotificationJobData> | undefined;
let expirationWorker: Worker<ExpirationCheckJobData> | undefined;

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

  expirationWorker = new Worker<ExpirationCheckJobData>(
    QUEUE_NAMES.EXPIRATION_CHECKS,
    processExpirationCheck,
    { connection, concurrency: 1 } // Only one at a time
  );

  // Error handlers
  for (const [name, worker] of Object.entries({
    webhook: webhookWorker,
    agentTask: agentTaskWorker,
    notification: notificationWorker,
    expiration: expirationWorker,
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
    expirationWorker?.close(),
  ]);
  logger.info("All workers stopped");
}

// Re-export expiration checker for direct use in tests or API routes
export { checkExpiringApprovals } from "./expiration-checker";
