import type { OrchestratorEngine } from "../orchestrator/engine";
import type { JiraWebhookPayload } from "../mcp/jira/types";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ module: "webhook-service" });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebhookServiceDeps {
  engine: OrchestratorEngine;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Process a Jira webhook event.
 * Registers new GEN-labeled tickets and handles status transitions.
 */
export async function handleJiraWebhook(
  deps: WebhookServiceDeps,
  payload: JiraWebhookPayload
): Promise<void> {
  const { issue, webhookEvent } = payload;

  // Check for GEN label
  const labels = issue.fields.labels;
  const hasGenLabel =
    Array.isArray(labels) && labels.includes("GEN");

  if (!hasGenLabel) {
    logger.debug({ issueKey: issue.key }, "Ignoring non-GEN ticket");
    return;
  }

  logger.info(
    { issueKey: issue.key, event: webhookEvent },
    "Processing GEN ticket webhook"
  );

  if (
    webhookEvent === "jira:issue_created" ||
    webhookEvent === "jira:issue_updated"
  ) {
    // Check if epic already exists
    const existingContext = deps.engine.getEpic(issue.key);

    if (existingContext === undefined) {
      // New GEN ticket - register in orchestrator
      await deps.engine.registerEpic(issue.key);
      logger.info({ issueKey: issue.key }, "Registered new GEN epic");
    }
  }

  // Handle status transitions from changelog
  if (webhookEvent === "jira:issue_updated" && payload.changelog !== undefined) {
    const statusChange = payload.changelog.items?.find(
      (item) => item.field === "status"
    );

    if (statusChange !== undefined) {
      logger.info(
        {
          issueKey: issue.key,
          from: statusChange.fromString,
          to: statusChange.toString,
        },
        "Jira status changed"
      );
      // Note: Status changes are handled by the orchestrator's event handlers
      // via the DoR/DoD gate evaluation flow, not directly here
    }
  }
}
