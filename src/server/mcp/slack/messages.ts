import type { SlackWebhookPayload, SlackBlock } from "./types";

// ─── Risk Level Indicators ───────────────────────────────────────────────────

const RISK_EMOJI: Record<"low" | "medium" | "high", string> = {
  low: "🟢",
  medium: "🟡",
  high: "🔴",
};

const RISK_COLOR: Record<"low" | "medium" | "high", string> = {
  low: "#36a64f", // green
  medium: "#daa520", // goldenrod
  high: "#dc3545", // red
};

// ─── Status Indicators ───────────────────────────────────────────────────────

const STATUS_EMOJI: Record<
  "approved" | "rejected" | "completed" | "failed",
  string
> = {
  approved: "✅",
  rejected: "❌",
  completed: "🎉",
  failed: "⚠️",
};

// ─── Approval Request Payload ────────────────────────────────────────────────

export interface ApprovalRequestParams {
  ticketRef: string;
  title: string;
  riskLevel: "low" | "medium" | "high";
  dashboardUrl: string;
}

/**
 * Build a Slack Block Kit payload for an approval request notification.
 * Includes ticket reference, risk level indicator, and dashboard link button.
 */
export function buildApprovalRequestPayload(
  params: ApprovalRequestParams
): SlackWebhookPayload {
  const { ticketRef, title, riskLevel, dashboardUrl } = params;
  const riskEmoji = RISK_EMOJI[riskLevel];

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📋 ${ticketRef}: ${truncate(title, 100)}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${riskEmoji} *Risk Level:* ${capitalize(riskLevel)}\n\nA plan is ready for your review.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Review in Dashboard", emoji: true },
          url: dashboardUrl,
          style: "primary",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Ticket: <${dashboardUrl}|${ticketRef}> • Awaiting human approval`,
        },
      ],
    },
  ];

  return {
    text: `Plan ready for approval: ${ticketRef}`, // Fallback for notifications
    blocks,
    attachments: [
      {
        color: RISK_COLOR[riskLevel],
        fallback: `${ticketRef}: ${title} - ${riskLevel} risk`,
      },
    ],
  };
}

// ─── Status Update Payload ───────────────────────────────────────────────────

export interface StatusUpdateParams {
  ticketRef: string;
  status: "approved" | "rejected" | "completed" | "failed";
  message: string;
}

/**
 * Build a simple Slack notification for status updates.
 * Uses plain text with emoji indicators.
 */
export function buildStatusUpdatePayload(
  params: StatusUpdateParams
): SlackWebhookPayload {
  const { ticketRef, status, message } = params;
  const emoji = STATUS_EMOJI[status];

  return {
    text: `${emoji} *${ticketRef}*: ${message}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${ticketRef}*: ${message}`,
        },
      },
    ],
  };
}

// ─── Generic Notification Payload ────────────────────────────────────────────

export interface GenericNotificationParams {
  title: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
}

const LEVEL_EMOJI: Record<"info" | "success" | "warning" | "error", string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "🚨",
};

/**
 * Build a generic notification payload for system messages.
 */
export function buildGenericNotificationPayload(
  params: GenericNotificationParams
): SlackWebhookPayload {
  const { title, message, level } = params;
  const emoji = LEVEL_EMOJI[level];

  return {
    text: `${emoji} ${title}: ${message}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} ${title}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: message },
      },
    ],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
