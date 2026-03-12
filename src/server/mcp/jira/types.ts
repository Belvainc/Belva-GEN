import { z } from "zod";

// ─── Jira API Raw Response Schemas ────────────────────────────────────────────
// These match the actual Jira REST API v3 response format.
// We transform these to our internal types via mapper functions.

export const JiraApiUserSchema = z.object({
  accountId: z.string(),
  displayName: z.string().optional(),
  emailAddress: z.string().optional(),
}).nullable();

export const JiraApiStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  statusCategory: z.object({
    id: z.number(),
    key: z.string(),
    name: z.string(),
  }).optional(),
});

export const JiraApiFieldsSchema = z.object({
  summary: z.string(),
  description: z.unknown().nullable(), // Can be ADF (Atlassian Document Format) or string
  issuetype: z.object({ name: z.string() }),
  status: JiraApiStatusSchema,
  assignee: JiraApiUserSchema.optional(),
  labels: z.array(z.string()).default([]),
  // Custom fields - these field IDs vary by Jira instance
  // Using unknown to handle different configurations
  customfield_10016: z.number().nullable().optional(), // Story points (common ID)
  customfield_10014: z.string().nullable().optional(), // Epic link (common ID)
  created: z.string(),
  updated: z.string(),
});

export const JiraApiIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: JiraApiFieldsSchema,
});
export type JiraApiIssue = z.infer<typeof JiraApiIssueSchema>;

// ─── Jira Search Response ─────────────────────────────────────────────────────

export const JiraSearchResponseSchema = z.object({
  startAt: z.number(),
  maxResults: z.number(),
  total: z.number(),
  issues: z.array(JiraApiIssueSchema),
});
export type JiraSearchResponse = z.infer<typeof JiraSearchResponseSchema>;

// ─── Jira Transitions Response ────────────────────────────────────────────────

export const JiraTransitionsResponseSchema = z.object({
  transitions: z.array(z.object({
    id: z.string(),
    name: z.string(),
    to: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })),
});
export type JiraTransitionsResponse = z.infer<typeof JiraTransitionsResponseSchema>;

// ─── Internal Types (Transformed) ─────────────────────────────────────────────

// ─── Jira Ticket ──────────────────────────────────────────────────────────────

export const JiraTicketSchema = z.object({
  id: z.string().min(1),
  key: z.string().regex(/^[A-Z]+-\d+$/),
  summary: z.string().min(1),
  description: z.string(),
  issueType: z.string().min(1),
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

// ─── Response Mappers ─────────────────────────────────────────────────────────
// Transform raw Jira API responses to our internal types.
// Never use type assertions on external data — these functions handle the mapping.

/**
 * Extract plain text from Jira description field.
 * Jira v3 uses Atlassian Document Format (ADF) which is a complex object.
 * For simplicity, we extract text content or return empty string.
 */
function extractDescription(description: unknown): string {
  if (typeof description === "string") {
    return description;
  }
  if (description === null || description === undefined) {
    return "";
  }
  // ADF format - try to extract text content
  if (typeof description === "object" && "content" in description) {
    try {
      const adf = description as { content?: Array<{ content?: Array<{ text?: string }> }> };
      const texts: string[] = [];
      for (const block of adf.content ?? []) {
        for (const inline of block.content ?? []) {
          if (inline.text !== undefined) {
            texts.push(inline.text);
          }
        }
      }
      return texts.join("\n");
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Extract acceptance criteria from custom field or description.
 * This is a heuristic - actual field varies by Jira configuration.
 */
function extractAcceptanceCriteria(fields: JiraApiIssue["fields"]): string {
  // Common pattern: look for "Acceptance Criteria" section in description
  const description = extractDescription(fields.description);
  const acMatch = description.match(/acceptance criteria[:\s]*([\s\S]*?)(?=\n\n|\z)/i);
  return acMatch?.[1]?.trim() ?? "";
}

/**
 * Map a raw Jira API issue to our internal JiraTicket type.
 */
export function mapJiraApiIssueToTicket(apiIssue: JiraApiIssue): JiraTicket {
  const { id, key, fields } = apiIssue;
  
  return {
    id,
    key,
    summary: fields.summary,
    description: extractDescription(fields.description),
    issueType: fields.issuetype.name,
    status: fields.status.name,
    assignee: fields.assignee?.displayName ?? null,
    labels: fields.labels,
    storyPoints: fields.customfield_10016 ?? null,
    acceptanceCriteria: extractAcceptanceCriteria(fields),
    epicKey: fields.customfield_10014 ?? null,
    createdAt: new Date(fields.created).toISOString(),
    updatedAt: new Date(fields.updated).toISOString(),
  };
}

/**
 * Map a Jira transitions response to our internal JiraTransition array.
 */
export function mapJiraTransitions(response: JiraTransitionsResponse): JiraTransition[] {
  return response.transitions.map((t) => ({
    id: t.id,
    name: t.name,
    to: {
      id: t.to.id,
      name: t.to.name,
    },
  }));
}
