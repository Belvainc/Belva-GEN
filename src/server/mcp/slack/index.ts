import { getEnv } from "@/server/config/env";
import {
  SlackNotificationClient,
  SlackNotificationClientStub,
} from "./client";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "slack-mcp" });

// ─── Singleton Instance ──────────────────────────────────────────────────────

let instance: SlackNotificationClient | undefined;

/**
 * Get the Slack notification client singleton.
 * Returns a stub client if SLACK_WEBHOOK_URL is not configured.
 */
export function getSlackNotificationClient(): SlackNotificationClient {
  if (instance === undefined) {
    const env = getEnv();

    if (env.SLACK_WEBHOOK_URL !== undefined) {
      instance = new SlackNotificationClient({
        webhookUrl: env.SLACK_WEBHOOK_URL,
      });
      logger.info("Slack notification client initialized with webhook");
    } else {
      instance = new SlackNotificationClientStub();
      logger.warn(
        "SLACK_WEBHOOK_URL not configured - using stub client (messages will be logged, not sent)"
      );
    }
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetSlackNotificationClient(): void {
  instance = undefined;
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { SlackNotificationClient, SlackNotificationClientStub } from "./client";
export type { SlackNotificationClientConfig } from "./client";

export {
  buildApprovalRequestPayload,
  buildStatusUpdatePayload,
  buildGenericNotificationPayload,
} from "./messages";
export type {
  ApprovalRequestParams,
  StatusUpdateParams,
  GenericNotificationParams,
} from "./messages";

export type {
  SlackWebhookPayload,
  SlackNotificationJobData,
  ApprovalRequestNotification,
  StatusUpdateNotification,
  SlackMessage,
  SlackApproval,
  SlackChannel,
} from "./types";
