import { getEnv } from "@/server/config/env";
import { JiraMCPClient } from "./client";
import { CircuitBreaker } from "@/server/lib/circuit-breaker";

export { JiraMCPClient, hasGenLabel } from "./client";
export type { JiraMCPClientConfig } from "./client";
export type { JiraTicket, JiraEpic, JiraTransition, JiraWebhookPayload } from "./types";
export {
  mapJiraApiIssueToTicket,
  mapJiraTransitions,
} from "./types";

// ─── Singleton ────────────────────────────────────────────────────────────────
// Lazy singleton that reads config from environment.
// Tech debt: Will be consolidated into ServerContext per service-layer.md in Plan 05.

let instance: JiraMCPClient | undefined;
let circuitBreaker: CircuitBreaker | undefined;

/**
 * Get the singleton Jira client instance.
 * Lazily initializes on first call using environment configuration.
 */
export function getJiraMCPClient(): JiraMCPClient {
  if (instance === undefined) {
    const env = getEnv();

    circuitBreaker = new CircuitBreaker({
      name: "jira-api",
      failureThreshold: 5,
      cooldownMs: 30_000,
      monitorWindowMs: 60_000,
    });

    instance = new JiraMCPClient({
      baseUrl: env.JIRA_BASE_URL ?? "https://jira.example.com",
      projectKey: env.JIRA_PROJECT_KEY,
      email: env.JIRA_USER_EMAIL ?? "",
      apiToken: env.JIRA_API_TOKEN ?? "",
      circuitBreaker,
    });
  }
  return instance;
}

/**
 * Reset the singleton. Used in tests.
 */
export function resetJiraMCPClient(): void {
  instance = undefined;
  circuitBreaker = undefined;
}
