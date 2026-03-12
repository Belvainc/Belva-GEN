import { z } from "zod";

// ─── Slack Webhook Payload ────────────────────────────────────────────────────
// Structure for Incoming Webhook POST body

export const SlackTextObjectSchema = z.object({
  type: z.enum(["plain_text", "mrkdwn"]),
  text: z.string(),
  emoji: z.boolean().optional(),
});
export type SlackTextObject = z.infer<typeof SlackTextObjectSchema>;

export const SlackBlockSchema = z.object({
  type: z.string(),
  text: SlackTextObjectSchema.optional(),
  block_id: z.string().optional(),
  elements: z.array(z.record(z.string(), z.unknown())).optional(),
  accessory: z.record(z.string(), z.unknown()).optional(),
});
export type SlackBlock = z.infer<typeof SlackBlockSchema>;

export const SlackAttachmentSchema = z.object({
  color: z.string().optional(),
  text: z.string().optional(),
  fallback: z.string().optional(),
});
export type SlackAttachment = z.infer<typeof SlackAttachmentSchema>;

export const SlackWebhookPayloadSchema = z.object({
  text: z.string().optional(), // Fallback text for notifications
  blocks: z.array(SlackBlockSchema).optional(),
  attachments: z.array(SlackAttachmentSchema).optional(),
  unfurl_links: z.boolean().optional(),
  unfurl_media: z.boolean().optional(),
});
export type SlackWebhookPayload = z.infer<typeof SlackWebhookPayloadSchema>;

// ─── Notification Job Types ───────────────────────────────────────────────────

export const ApprovalRequestNotificationSchema = z.object({
  type: z.literal("approval_request"),
  ticketRef: z.string().min(1),
  title: z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  dashboardUrl: z.string().url(),
});
export type ApprovalRequestNotification = z.infer<
  typeof ApprovalRequestNotificationSchema
>;

export const StatusUpdateNotificationSchema = z.object({
  type: z.literal("status_update"),
  ticketRef: z.string().min(1),
  status: z.enum(["approved", "rejected", "completed", "failed"]),
  message: z.string().min(1),
});
export type StatusUpdateNotification = z.infer<
  typeof StatusUpdateNotificationSchema
>;

export const SlackNotificationJobDataSchema = z.discriminatedUnion("type", [
  ApprovalRequestNotificationSchema,
  StatusUpdateNotificationSchema,
]);
export type SlackNotificationJobData = z.infer<
  typeof SlackNotificationJobDataSchema
>;

// ─── Legacy Types (kept for compatibility) ────────────────────────────────────

export const SlackMessageSchema = z.object({
  channel: z.string().min(1),
  text: z.string().min(1),
  blocks: z
    .array(z.record(z.string(), z.unknown()))
    .optional(),
  threadTs: z.string().optional(),
});
export type SlackMessage = z.infer<typeof SlackMessageSchema>;

export const SlackApprovalSchema = z.object({
  channelId: z.string().min(1),
  messageTs: z.string().min(1),
  userId: z.string().min(1),
  action: z.enum(["approved", "revision-requested", "rejected"]),
  comment: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type SlackApproval = z.infer<typeof SlackApprovalSchema>;

export const SlackChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isPrivate: z.boolean(),
});
export type SlackChannel = z.infer<typeof SlackChannelSchema>;
