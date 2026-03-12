import type { JiraTicket, JiraWebhookPayload, JiraTransition } from "./types";
import {
  JiraWebhookPayloadSchema,
  JiraApiIssueSchema,
  JiraSearchResponseSchema,
  JiraTransitionsResponseSchema,
  mapJiraApiIssueToTicket,
  mapJiraTransitions,
} from "./schemas";
import { JiraTicketSchema } from "./types";
import { parseOrThrow } from "@/lib/validation";
import { createAgentLogger } from "@/lib/logger";
import { withRetry } from "@/server/lib/retry";
import type { CircuitBreaker } from "@/server/lib/circuit-breaker";
import { ValidationError } from "@/lib/errors";

const logger = createAgentLogger("orchestrator-project");

export interface JiraMCPClientConfig {
  baseUrl: string;
  projectKey: string;
  email: string;
  apiToken: string;
  circuitBreaker: CircuitBreaker;
}

/**
 * Validate that a project key is safe for JQL injection.
 * Project keys must be uppercase letters only.
 */
function validateProjectKey(projectKey: string): void {
  if (!/^[A-Z]+$/.test(projectKey)) {
    throw new ValidationError(
      `Invalid project key format: ${projectKey}. Must be uppercase letters only.`,
      { projectKey }
    );
  }
}

/**
 * Jira REST API client for reading tickets, updating status, and processing webhooks.
 * All responses are validated with Zod schemas before returning.
 * All API calls are wrapped in CircuitBreaker + retry for resilience.
 */
export class JiraMCPClient {
  private readonly config: JiraMCPClientConfig;
  private readonly authHeader: string;

  constructor(config: JiraMCPClientConfig) {
    this.config = config;
    // Jira Cloud uses Basic auth with email:apiToken
    this.authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
    logger.info("Jira client initialized", { projectKey: config.projectKey });
  }

  /**
   * Make an authenticated request to the Jira REST API.
   * Wrapped in circuit breaker + retry for resilience.
   */
  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      signal?: AbortSignal;
      parseResponse?: (data: unknown) => T;
    } = {}
  ): Promise<T> {
    const { body, signal, parseResponse } = options;
    const url = `${this.config.baseUrl}${path}`;

    return this.config.circuitBreaker.execute(() =>
      withRetry(
        async () => {
          signal?.throwIfAborted();

          const response = await fetch(url, {
            method,
            headers: {
              "Authorization": this.authHeader,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal,
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error");
            throw new Error(
              `Jira API error: ${response.status} ${response.statusText} - ${errorText}`
            );
          }

          // Some endpoints return 204 No Content
          if (response.status === 204) {
            return undefined as T;
          }

          const data: unknown = await response.json();

          if (parseResponse !== undefined) {
            return parseResponse(data);
          }

          return data as T;
        },
        { signal, maxAttempts: 3, baseDelayMs: 1000 }
      )
    );
  }

  /**
   * Fetch a Jira ticket by key and validate the response.
   */
  async getTicket(ticketKey: string, signal?: AbortSignal): Promise<JiraTicket> {
    logger.info(`Fetching ticket: ${ticketKey}`);

    const ticket = await this.request<JiraTicket>(
      "GET",
      `/rest/api/3/issue/${encodeURIComponent(ticketKey)}`,
      {
        signal,
        parseResponse: (data) => {
          const apiIssue = parseOrThrow(JiraApiIssueSchema, data);
          const mapped = mapJiraApiIssueToTicket(apiIssue);
          // Validate the mapped result against our internal schema
          return parseOrThrow(JiraTicketSchema, mapped);
        },
      }
    );

    logger.info(`Fetched ticket: ${ticketKey}`, { status: ticket.status });
    return ticket;
  }

  /**
   * Get available transitions for a ticket.
   */
  async getTransitions(ticketKey: string, signal?: AbortSignal): Promise<JiraTransition[]> {
    logger.info(`Fetching transitions for: ${ticketKey}`);

    return this.request<JiraTransition[]>(
      "GET",
      `/rest/api/3/issue/${encodeURIComponent(ticketKey)}/transitions`,
      {
        signal,
        parseResponse: (data) => {
          const response = parseOrThrow(JiraTransitionsResponseSchema, data);
          return mapJiraTransitions(response);
        },
      }
    );
  }

  /**
   * Update the status of a Jira ticket.
   */
  async transitionTicket(
    ticketKey: string,
    transitionId: string,
    signal?: AbortSignal
  ): Promise<void> {
    logger.info(`Transitioning ticket ${ticketKey} with transition ${transitionId}`);

    await this.request<void>(
      "POST",
      `/rest/api/3/issue/${encodeURIComponent(ticketKey)}/transitions`,
      {
        signal,
        body: {
          transition: { id: transitionId },
        },
      }
    );

    logger.info(`Transitioned ticket: ${ticketKey}`);
  }

  /**
   * Add a comment to a Jira ticket.
   * Uses Atlassian Document Format (ADF) for the comment body.
   */
  async addComment(
    ticketKey: string,
    comment: string,
    signal?: AbortSignal
  ): Promise<void> {
    logger.info(`Adding comment to ticket ${ticketKey}`, {
      commentLength: comment.length,
    });

    // Jira v3 API uses Atlassian Document Format (ADF) for comments
    const adfBody = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: comment,
            },
          ],
        },
      ],
    };

    await this.request<void>(
      "POST",
      `/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment`,
      {
        signal,
        body: { body: adfBody },
      }
    );

    logger.info(`Added comment to ticket: ${ticketKey}`);
  }

  /**
   * Create a new Jira ticket (e.g. story sub-ticket under an epic).
   * Returns the created ticket.
   */
  async createTicket(
    fields: {
      summary: string;
      description: string;
      issueType: string;
      parentKey?: string;
      labels?: string[];
      storyPoints?: number;
    },
    signal?: AbortSignal
  ): Promise<JiraTicket> {
    logger.info("Creating Jira ticket", { summary: fields.summary, parentKey: fields.parentKey });

    const body: Record<string, unknown> = {
      fields: {
        project: { key: this.config.projectKey },
        summary: fields.summary,
        description: {
          version: 1,
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: fields.description }],
            },
          ],
        },
        issuetype: { name: fields.issueType },
        ...(fields.parentKey !== undefined && { parent: { key: fields.parentKey } }),
        ...(fields.labels !== undefined && { labels: fields.labels }),
        ...(fields.storyPoints !== undefined && { story_points: fields.storyPoints }),
      },
    };

    const created = await this.request<{ key: string }>(
      "POST",
      "/rest/api/3/issue",
      { signal, body }
    );

    // Fetch the full ticket to return validated data
    return this.getTicket(created.key, signal);
  }

  /**
   * Search for tickets using JQL.
   * Used for initial load and as polling fallback for webhook events.
   */
  async searchTickets(jql: string, signal?: AbortSignal): Promise<JiraTicket[]> {
    // Validate project key to prevent JQL injection
    validateProjectKey(this.config.projectKey);

    logger.info("Searching tickets", { jql });

    const tickets = await this.request<JiraTicket[]>(
      "GET",
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=100`,
      {
        signal,
        parseResponse: (data) => {
          const response = parseOrThrow(JiraSearchResponseSchema, data);
          return response.issues.map((issue) => {
            const mapped = mapJiraApiIssueToTicket(issue);
            return parseOrThrow(JiraTicketSchema, mapped);
          });
        },
      }
    );

    logger.info(`Found ${tickets.length} tickets`);
    return tickets;
  }

  /**
   * Search for tickets with the "GEN" label that need processing.
   * Convenience method that builds the JQL automatically.
   */
  async searchGenLabeledTickets(signal?: AbortSignal): Promise<JiraTicket[]> {
    validateProjectKey(this.config.projectKey);
    
    const jql = `project = ${this.config.projectKey} AND labels = "GEN" AND status != Done ORDER BY created DESC`;
    return this.searchTickets(jql, signal);
  }

  /**
   * Validate and parse an incoming Jira webhook payload.
   */
  parseWebhookPayload(raw: unknown): JiraWebhookPayload {
    return parseOrThrow(JiraWebhookPayloadSchema, raw);
  }
}

// ─── GEN Label Detection ──────────────────────────────────────────────────────

/**
 * Type guard to check if a value is a string array.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Check if a Jira webhook payload has the "GEN" label.
 * Safely handles the `unknown` type of fields.labels.
 */
export function hasGenLabel(payload: JiraWebhookPayload): boolean {
  const labels = payload.issue.fields?.labels;
  if (!isStringArray(labels)) {
    return false;
  }
  return labels.includes("GEN");
}
