# Plan 01: JIRA MCP Integration & Webhook Pipeline

## Overview

Implement the Jira MCP client to connect Belva-GEN to Jira, enabling ticket reads, status transitions, and comment posting. Wire the webhook processing pipeline so that Jira events flow through BullMQ into the orchestrator, with "GEN" label detection auto-initializing the planning workflow.

## Prerequisites

- Docker infrastructure running (PostgreSQL + Redis via `make infra-up`)
- Jira project with webhook configured to POST to `/api/webhooks/jira`
- Environment variables set: `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Jira client class | `src/server/mcp/jira/client.ts` | Stub — all methods throw "Not implemented" |
| Jira Zod schemas | `src/server/mcp/jira/schemas.ts` | Complete — `JiraTicketSchema`, `JiraEpicSchema`, `JiraWebhookPayloadSchema` |
| Jira types | `src/server/mcp/jira/types.ts` | Partial — needs `JiraSearchResponseSchema`, response mappers |
| Webhook API route | `src/app/api/webhooks/jira/route.ts` | Partial — validates payload, **BUG: parses JSON before signature verify** |
| Webhook queue | `src/server/queues/index.ts` | Complete — `webhook-processing` queue with `WebhookJobDataSchema` |
| Webhook worker | `src/server/workers/index.ts` | Stub — `processWebhook()` logs but doesn't route |
| Env config | `src/server/config/env.ts` | Partial — missing `JIRA_USER_EMAIL` for Basic auth |
| MCP safety rules | `.claude/rules/mcp-safety.md` | Complete — safe/dangerous operation matrix |

## Scope

### In Scope

- Implement `JiraMCPClient` methods: `getTicket()`, `transitionTicket()`, `addComment()`
- Add `searchTickets()` method for "GEN" label polling (fallback if webhooks are delayed)
- Add webhook signature verification (HMAC via `WEBHOOK_SECRET`)
- Wire webhook route → BullMQ queue → worker → orchestrator
- "GEN" label detection in webhook payloads to auto-register epics
- Unit tests for client methods and webhook processing

### Out of Scope

- Jira ticket creation (read-only + transitions + comments)
- Full-content description updates (MCP safety: dangerous operation)
- Slack notifications for Jira events (Plan 03)
- Orchestrator event handling logic (Plan 04)

## Research Questions (Resolved)

1. **Jira REST API vs MCP protocol** — ✅ RESOLVED: Use direct REST API with `fetch`. No MCP SDK dependency. The `mcpCall` references in stubs are legacy comments to remove.
2. **Jira webhook signature format** — ✅ RESOLVED: Jira Cloud webhooks do NOT use HMAC by default (relies on URL secrecy). Atlassian Connect apps use JWT. Make signature verification **optional/configurable** — skip if header absent, verify if present.
3. **Jira API authentication** — ✅ RESOLVED: Basic Auth with `email:apiToken` base64-encoded. Requires adding `JIRA_USER_EMAIL` to env schema.
4. **Webhook vs polling** — ✅ RESOLVED: Implement both. Webhooks for real-time, `searchTickets()` for initial load and as fallback.
5. **Rate limiting** — ✅ RESOLVED: Yes, wrap all Jira API calls in `CircuitBreaker` + `withRetry()` per `infrastructure.md` rules. Jira Cloud has rate limits (~100 req/min for REST API).

## Architecture Decisions

### AD-01: Direct REST API with fetch

Use Node.js native `fetch` for Jira REST API calls rather than adding an MCP SDK dependency. Rationale: simpler, fewer dependencies, and the MCP protocol can be added as a wrapper layer later. All responses validated through existing Zod schemas.

### AD-02: Queue-first webhook processing

Webhook route immediately enqueues to BullMQ, returns 200. Worker processes asynchronously. Rationale: fast webhook acknowledgment prevents Jira timeouts and retries; queue provides retry/DLQ for processing failures.

### AD-03: Optional HMAC webhook verification

Verify webhook signatures **only if signature header is present**. Jira Cloud webhooks don't include HMAC by default. Use `WEBHOOK_SECRET` when signature exists, otherwise rely on URL secrecy + Zod validation. This supports both standard Jira webhooks and Atlassian Connect JWT-signed webhooks.

### AD-04: Mandatory resilience wrappers

All Jira REST API calls must be wrapped in `CircuitBreaker.execute(() => withRetry(...))` per `infrastructure.md` rules. This prevents cascading failures and handles Jira rate limits gracefully. Circuit breaker config: 5 failures → open, 30s cooldown.

### AD-05: Response transformation layer

Jira REST API responses have nested structures (e.g., `fields.status.name`) that differ from our flat `JiraTicket` schema. Add explicit mapping functions to transform Jira API responses to internal types. Never use type assertions on external data.

## Implementation Steps

### Step 1: Add JIRA_USER_EMAIL to environment schema

**Files:** `src/server/config/env.ts`

Add the missing email env var for Basic auth:

```typescript
// Add to envSchema:
JIRA_USER_EMAIL: z.string().email().optional(),
```

### Step 2: Implement Jira REST client methods

**Files:** `src/server/mcp/jira/client.ts`

Replace the three TODO methods with actual Jira REST API calls:

```typescript
// getTicket: GET /rest/api/3/issue/{key}
// transitionTicket: POST /rest/api/3/issue/{key}/transitions
// addComment: POST /rest/api/3/issue/{key}/comment
```

- Extend `JiraMCPClientConfig` with `email` and `apiToken`
- Use `Authorization: Basic ${base64(email:apiToken)}` header
- **Wrap all fetch calls in `CircuitBreaker.execute(() => withRetry(...))`** per AD-04
- Add response mapping functions to transform Jira API responses to internal schemas
- Validate all mapped responses with Zod schemas from `schemas.ts`
- Respect MCP safety: only use safe operations (read, transition, comment, label)
- Add `AbortSignal` parameter for timeout control per `async-concurrency.md` rule

### Step 3: Add JiraSearchResponseSchema and searchTickets method

**Files:** `src/server/mcp/jira/types.ts`, `src/server/mcp/jira/client.ts`

First, add schema for the Jira search endpoint response:

```typescript
// Jira /rest/api/3/search returns this structure:
export const JiraSearchResponseSchema = z.object({
  startAt: z.number(),
  maxResults: z.number(),
  total: z.number(),
  issues: z.array(JiraApiIssueSchema), // Raw Jira format, then map to JiraTicket[]
});
```

Then add the search method:

```typescript
async searchTickets(jql: string, signal?: AbortSignal): Promise<JiraTicket[]>
// Default JQL: `project = ${projectKey} AND labels = "GEN" AND status != Done`
```

- **Validate projectKey matches `/^[A-Z]+$/` before building JQL** (prevent JQL injection)
- Uses Jira JQL search API: `GET /rest/api/3/search`
- Validate raw response with `JiraSearchResponseSchema`
- Map each issue through `mapJiraApiIssueToTicket()` transformation function
- Used for initial load and as polling fallback

### Step 4: Fix webhook route — raw body before JSON parse

**Files:** `src/app/api/webhooks/jira/route.ts`

**CRITICAL BUG FIX:** The current route calls `request.json()` before signature verification, but HMAC requires the raw string body. Fix order:

```typescript
export async function POST(request: NextRequest) {
  // 1. Read RAW body first (needed for HMAC)
  const rawBody = await request.text();
  
  // 2. Verify signature IF header present (optional for standard Jira webhooks)
  const signature = request.headers.get('x-hub-signature-256');
  if (signature !== null) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json(errorResponse('UNAUTHORIZED', 'Invalid signature'), { status: 401 });
    }
  }
  
  // 3. THEN parse JSON
  const body: unknown = JSON.parse(rawBody);
  
  // 4. Validate with Zod
  const result = safeParse(JiraWebhookPayloadSchema, body);
  // ...
}
```

- Use existing `verifyWebhookSignature()` from `src/server/lib/webhook-auth.ts`
- Make verification optional (skip if no signature header) per AD-03

### Step 5: Wire webhook route to BullMQ queue

**Files:** `src/app/api/webhooks/jira/route.ts`

After validation, enqueue the payload:

```typescript
await webhookQueue.add('jira-event', {
  source: 'jira',
  payload: result.data,
  receivedAt: new Date().toISOString(),
  signature: signature ?? undefined, // Already extracted in step 4
});
```

### Step 6: Implement webhook worker routing

**Files:** `src/server/workers/index.ts`

In `processWebhook()`, route based on source:

```typescript
if (data.source === 'jira') {
  const jiraClient = getJiraMCPClient(); // singleton
  const payload = jiraClient.parseWebhookPayload(data.payload);

  // Detect "GEN" label
  if (hasGenLabel(payload)) {
    // Register epic in orchestrator and transition to refinement
    const engine = getOrchestratorEngine(); // singleton - see Step 7
    await engine.registerEpic(payload.issue.key);
    await engine.handleEvent({
      kind: 'epic-state-transition',
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ticketRef: payload.issue.key,
      fromState: 'funnel',
      toState: 'refinement',
      reason: 'GEN label detected via Jira webhook',
    });
  }
}
```

**Note:** This requires `getOrchestratorEngine()` singleton access from workers. Either:
- Create minimal `ServerContext` now (align with `service-layer.md` rules), OR
- Add `getOrchestratorEngine()` to `src/server/orchestrator/index.ts` as interim solution
```

### Step 7: Create JiraMCPClient and OrchestratorEngine singletons

**Files:** `src/server/mcp/jira/index.ts`, `src/server/orchestrator/index.ts`

Update `src/server/mcp/jira/index.ts` with lazy singleton:

```typescript
import { getEnv } from '@/server/config/env';
import { JiraMCPClient } from './client';
import { CircuitBreaker } from '@/server/lib/circuit-breaker';

let instance: JiraMCPClient | undefined;
let circuitBreaker: CircuitBreaker | undefined;

export function getJiraMCPClient(): JiraMCPClient {
  if (instance === undefined) {
    const env = getEnv();
    circuitBreaker = new CircuitBreaker({ name: 'jira-api', failureThreshold: 5, cooldownMs: 30_000 });
    instance = new JiraMCPClient({
      baseUrl: env.JIRA_BASE_URL ?? 'https://jira.example.com',
      projectKey: env.JIRA_PROJECT_KEY,
      email: env.JIRA_USER_EMAIL ?? '',
      apiToken: env.JIRA_API_TOKEN ?? '',
      circuitBreaker,
    });
  }
  return instance;
}
```

Add similar `getOrchestratorEngine()` to `src/server/orchestrator/index.ts`.

**Tech debt note:** These singletons should be consolidated into `ServerContext` per `service-layer.md` in a future refactor (Plan 05).

### Step 8: Add GEN label detection helper with type guard

**Files:** `src/server/mcp/jira/client.ts`

**CRITICAL:** `JiraWebhookPayloadSchema` types `fields` as `z.record(z.string(), z.unknown())`, so `fields.labels` is `unknown`, not `string[]`. Need proper type guard:

```typescript
/**
 * Type guard to check if a value is a string array.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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
  return labels.includes('GEN');
}
```

## Testing Requirements

### Unit Tests

- `__tests__/server/mcp/jira/client.test.ts`
  - Test `getTicket()` with mocked fetch (success + error + invalid response)
  - Test `transitionTicket()` with mocked fetch
  - Test `addComment()` with mocked fetch
  - Test `searchTickets()` with mocked fetch
  - Test `searchTickets()` rejects invalid projectKey (JQL injection prevention)
  - Test `parseWebhookPayload()` with valid and invalid payloads
  - Test `hasGenLabel()` with various label combinations
  - Test `hasGenLabel()` handles non-array labels gracefully (type guard)
  - Test response mapping transforms Jira API format to internal schema
  - Test circuit breaker integration (mock failure threshold)
- `__tests__/server/workers/webhook.test.ts`
  - Test webhook worker routes Jira payloads correctly
  - Test GEN label detection triggers epic registration
- `__tests__/app/api/webhooks/jira/route.test.ts`
  - Test webhook signature verification (valid, invalid, missing)
  - Test Zod validation rejection
  - Test successful enqueue

### Budget Constraints

- Unit test suite must complete in <3 seconds
- Zero skipped tests
- Minimum 80% line coverage for `src/server/mcp/jira/`

## Acceptance Criteria

- [ ] `JIRA_USER_EMAIL` added to env schema for Basic auth
- [ ] `JiraMCPClient.getTicket()` fetches, maps, and Zod-validates a Jira ticket
- [ ] `JiraMCPClient.transitionTicket()` updates ticket status via REST API
- [ ] `JiraMCPClient.addComment()` appends a comment to a ticket
- [ ] `JiraMCPClient.searchTickets()` queries tickets with JQL and validates results
- [ ] `searchTickets()` validates projectKey format before building JQL (injection prevention)
- [ ] All Jira client methods wrapped in `CircuitBreaker` + `withRetry()`
- [ ] Response mapping functions transform Jira API format to internal schemas
- [ ] Webhook endpoint reads raw body BEFORE JSON parsing for signature verification
- [ ] Webhook signature verification is optional (only if header present)
- [ ] Validated webhook payloads are enqueued to `webhook-processing` BullMQ queue
- [ ] Webhook worker detects "GEN" label with proper type guard and registers epic
- [ ] All Jira API responses validated with Zod schemas (zero `any` types)
- [ ] `AbortSignal` support on all async methods
- [ ] No dangerous MCP operations (no full-content updates)
- [ ] Unit tests pass within 3-second budget
- [ ] 80%+ line coverage on `src/server/mcp/jira/`

## Dependencies

- **Depends on:** None (first plan in sequence)
- **Blocks:** Plan 04 (Orchestrator Core Loop — needs Jira events), Plan 09 (Bug Pipeline — needs ticket reads)

## Estimated Conversations

2-3 conversations:
1. Env update + Jira client implementation with resilience wrappers
2. Webhook route fix + worker routing + singleton setup
3. Tests and edge cases
