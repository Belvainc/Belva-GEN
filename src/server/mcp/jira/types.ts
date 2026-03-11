import { z } from "zod";

// ─── Jira Ticket ──────────────────────────────────────────────────────────────

export const JiraTicketSchema = z.object({
  id: z.string().min(1),
  key: z.string().regex(/^[A-Z]+-\d+$/),
  summary: z.string().min(1),
  description: z.string(),
  status: z.string().min(1),
  assignee: z.string().nullable(),
  labels: z.array(z.string()),
  storyPoints: z.number().nullable(),
  acceptanceCriteria: z.string(),
  epicKey: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type JiraTicket = z.infer<typeof JiraTicketSchema>;

// ─── Jira Epic ────────────────────────────────────────────────────────────────

export const JiraEpicSchema = z.object({
  id: z.string().min(1),
  key: z.string().regex(/^[A-Z]+-\d+$/),
  summary: z.string().min(1),
  status: z.string().min(1),
  childTickets: z.array(z.string()),
});
export type JiraEpic = z.infer<typeof JiraEpicSchema>;

// ─── Jira Transition ──────────────────────────────────────────────────────────

export const JiraTransitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  to: z.object({
    id: z.string(),
    name: z.string(),
  }),
});
export type JiraTransition = z.infer<typeof JiraTransitionSchema>;

// ─── Webhook Payload ──────────────────────────────────────────────────────────

export const JiraWebhookPayloadSchema = z.object({
  webhookEvent: z.string().min(1),
  timestamp: z.number(),
  issue: z.object({
    id: z.string(),
    key: z.string(),
    fields: z.record(z.string(), z.unknown()),
  }),
  changelog: z
    .object({
      items: z.array(
        z.object({
          field: z.string(),
          fromString: z.string().nullable(),
          toString: z.string().nullable(),
        })
      ),
    })
    .optional(),
});
export type JiraWebhookPayload = z.infer<typeof JiraWebhookPayloadSchema>;
