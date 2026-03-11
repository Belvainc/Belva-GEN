import { z } from "zod";

// ─── Slack Message ────────────────────────────────────────────────────────────

export const SlackMessageSchema = z.object({
  channel: z.string().min(1),
  text: z.string().min(1),
  blocks: z
    .array(z.record(z.string(), z.unknown()))
    .optional(),
  threadTs: z.string().optional(),
});
export type SlackMessage = z.infer<typeof SlackMessageSchema>;

// ─── Slack Approval ───────────────────────────────────────────────────────────

export const SlackApprovalSchema = z.object({
  channelId: z.string().min(1),
  messageTs: z.string().min(1),
  userId: z.string().min(1),
  action: z.enum(["approved", "revision-requested", "rejected"]),
  comment: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type SlackApproval = z.infer<typeof SlackApprovalSchema>;

// ─── Slack Channel ────────────────────────────────────────────────────────────

export const SlackChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isPrivate: z.boolean(),
});
export type SlackChannel = z.infer<typeof SlackChannelSchema>;
