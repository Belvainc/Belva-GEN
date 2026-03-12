import { prisma } from "@/server/db/client";
import { getSlackNotificationClient } from "@/server/mcp/slack";
import { getEnv } from "@/server/config/env";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "expiration-checker" });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpirationCheckResult {
  soonToExpire: number;
  expired: number;
  errors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Time before expiration to send reminder (1 hour) */
const REMINDER_THRESHOLD_MS = 60 * 60 * 1000;

/** How long to extend expired approvals (24 hours) */
const EXTENSION_DURATION_MS = 24 * 60 * 60 * 1000;

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Check for expiring approvals and send reminders.
 * Run this on a schedule (e.g., every hour via BullMQ repeatable job).
 *
 * IMPORTANT: This function NEVER auto-approves. Expired approvals are extended
 * and reminders are sent, but human decision is always required.
 */
export async function checkExpiringApprovals(): Promise<ExpirationCheckResult> {
  const env = getEnv();
  const slackClient = getSlackNotificationClient();
  const errors: string[] = [];
  let soonToExpireCount = 0;
  let expiredCount = 0;

  const now = new Date();
  const reminderThreshold = new Date(now.getTime() + REMINDER_THRESHOLD_MS);

  // ─── Find approvals expiring soon (within 1 hour) ─────────────────────────

  try {
    const soonToExpire = await prisma.approval.findMany({
      where: {
        status: "PENDING",
        expiresAt: {
          lte: reminderThreshold,
          gt: now,
        },
      },
    });

    for (const approval of soonToExpire) {
      try {
        const dashboardUrl = `${env.DASHBOARD_URL}/dashboard/approvals?id=${approval.id}`;

        await slackClient.send({
          text: `⏰ Reminder: Approval for ${approval.pipelineId} expires in less than 1 hour`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `⏰ *Approval Expiring Soon*\n\nThe plan for \`${approval.pipelineId}\` expires in less than 1 hour.\n\n<${dashboardUrl}|Review Now>`,
              },
            },
          ],
        });

        soonToExpireCount++;
        logger.info(
          { approvalId: approval.id, pipelineId: approval.pipelineId },
          "Sent expiration reminder"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Reminder failed for ${approval.id}: ${message}`);
        logger.error({ approvalId: approval.id, error: message }, "Failed to send reminder");
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Query for soon-to-expire failed: ${message}`);
    logger.error({ error: message }, "Failed to query soon-to-expire approvals");
  }

  // ─── Find expired approvals — extend them, send reminder ──────────────────
  // CRITICAL: NO AUTO-APPROVAL. We extend the deadline and notify, that's all.

  try {
    const expired = await prisma.approval.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
    });

    for (const approval of expired) {
      try {
        // Extend expiration (DO NOT auto-approve)
        const newExpiresAt = new Date(now.getTime() + EXTENSION_DURATION_MS);

        await prisma.approval.update({
          where: { id: approval.id },
          data: { expiresAt: newExpiresAt },
        });

        // Send reminder
        const dashboardUrl = `${env.DASHBOARD_URL}/dashboard/approvals?id=${approval.id}`;

        await slackClient.send({
          text: `🔴 Approval for ${approval.pipelineId} has expired and been extended`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `🔴 *Approval Expired*\n\nThe approval for \`${approval.pipelineId}\` has expired.\nDeadline extended to ${newExpiresAt.toISOString()}.\n\n*Human decision required — no auto-approval.*\n\n<${dashboardUrl}|Review Now>`,
              },
            },
          ],
        });

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: "approval.expired",
            entityType: "Approval",
            entityId: approval.id,
            payload: {
              oldExpiresAt: approval.expiresAt?.toISOString(),
              newExpiresAt: newExpiresAt.toISOString(),
              pipelineId: approval.pipelineId,
            },
          },
        });

        expiredCount++;
        logger.info(
          {
            approvalId: approval.id,
            pipelineId: approval.pipelineId,
            newExpiresAt: newExpiresAt.toISOString(),
          },
          "Extended expired approval"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Extension failed for ${approval.id}: ${message}`);
        logger.error({ approvalId: approval.id, error: message }, "Failed to extend approval");
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Query for expired failed: ${message}`);
    logger.error({ error: message }, "Failed to query expired approvals");
  }

  logger.info(
    { soonToExpire: soonToExpireCount, expired: expiredCount, errorCount: errors.length },
    "Expiration check complete"
  );

  return {
    soonToExpire: soonToExpireCount,
    expired: expiredCount,
    errors,
  };
}
