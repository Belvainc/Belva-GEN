import type { SlackWebhookPayload } from "./types";
import { SlackWebhookPayloadSchema } from "./schemas";
import { createChildLogger } from "@/server/config/logger";
import { withRetry } from "@/server/lib/retry";

const logger = createChildLogger({ module: "slack-notification" });

export interface SlackNotificationClientConfig {
  webhookUrl: string;
}

/**
 * Slack notification client using Incoming Webhooks.
 * Sends one-way notifications to a configured Slack channel.
 * All payloads are validated with Zod before sending.
 */
export class SlackNotificationClient {
  private readonly webhookUrl: string;

  constructor(config: SlackNotificationClientConfig) {
    this.webhookUrl = config.webhookUrl;
    logger.info("Slack notification client initialized (webhook mode)");
  }

  /**
   * Send a notification to Slack via Incoming Webhook.
   * Validates payload structure before sending.
   * Includes retry logic for transient failures.
   */
  async send(
    payload: SlackWebhookPayload,
    signal?: AbortSignal
  ): Promise<void> {
    // Validate payload before sending
    const validatedPayload = SlackWebhookPayloadSchema.parse(payload);

    logger.debug(
      { hasBlocks: validatedPayload.blocks !== undefined },
      "Sending Slack notification"
    );

    await withRetry(
      async () => {
        signal?.throwIfAborted();

        const response = await fetch(this.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validatedPayload),
          signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Slack webhook failed: ${response.status} ${response.statusText} - ${text}`
          );
        }

        logger.debug("Slack notification sent successfully");
      },
      {
        maxAttempts: 3,
        baseDelayMs: 500,
        signal,
      }
    );
  }
}

/**
 * Stub client for development/testing when SLACK_WEBHOOK_URL is not configured.
 * Logs messages instead of sending to Slack.
 */
export class SlackNotificationClientStub extends SlackNotificationClient {
  constructor() {
    // Pass a dummy URL since we won't use it
    super({ webhookUrl: "https://hooks.slack.com/stub" });
    logger.info("Slack notification client initialized (STUB mode - no webhook configured)");
  }

  override async send(
    payload: SlackWebhookPayload,
    _signal?: AbortSignal
  ): Promise<void> {
    // Validate payload even in stub mode
    SlackWebhookPayloadSchema.parse(payload);

    logger.info(
      { text: payload.text, blockCount: payload.blocks?.length ?? 0 },
      "[STUB] Would send Slack notification"
    );
  }
}
