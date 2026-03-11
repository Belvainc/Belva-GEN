import type { SlackMessage, SlackApproval } from "./types";
import { SlackApprovalSchema } from "./schemas";
import { parseOrThrow } from "@/lib/validation";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

export interface SlackMCPClientConfig {
  approvalChannel: string;
  notificationChannel: string;
}

/**
 * Slack MCP client for sending approval requests and notifications.
 * All responses are validated with Zod schemas before returning.
 */
export class SlackMCPClient {
  private readonly config: SlackMCPClientConfig;

  constructor(config: SlackMCPClientConfig) {
    this.config = config;
    logger.info("Slack MCP client initialized", {
      approvalChannel: config.approvalChannel,
    });
  }

  /**
   * Send an approval request to the configured Slack channel.
   */
  async sendApprovalRequest(
    ticketRef: string,
    planSummary: string,
    dashboardUrl: string
  ): Promise<string> {
    logger.info(`Sending approval request for ${ticketRef} to Slack`, {
      planSummaryLength: planSummary.length,
      dashboardUrl,
    });
    // TODO: Implement MCP protocol call to Slack
    // Returns the message timestamp for tracking
    throw new Error(`Not implemented: sendApprovalRequest(${ticketRef})`);
  }

  /**
   * Send a notification message to the configured Slack channel.
   */
  async sendNotification(message: SlackMessage): Promise<void> {
    logger.info(`Sending notification to ${message.channel}`);
    // TODO: Implement MCP protocol call to Slack
    throw new Error("Not implemented: sendNotification");
  }

  /**
   * Parse and validate an incoming Slack approval action.
   */
  parseApprovalAction(raw: unknown): SlackApproval {
    return parseOrThrow(SlackApprovalSchema, raw);
  }
}
