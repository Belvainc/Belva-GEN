# Plan 03: Slack Notification System (Simplified)

## Overview

Implement one-way Slack notifications using Incoming Webhooks. The system notifies humans via Slack when plans need approval, with deep links to the dashboard where all approval actions occur. **No Slack bot or interactive components required.**

This approach aligns with [Plan 06](06-human-approval-flow.md) AD-01: "Dashboard is the authoritative approval interface."

## Prerequisites

- BullMQ infrastructure running (Redis via `make infra-up`)
- Slack Incoming Webhook URL configured (see Infrastructure Requirements below)
- Environment variable set: `SLACK_WEBHOOK_URL`

## Infrastructure Requirements

### What DevOps Needs to Provision

| Item | Description | Who Can Do It | Time Estimate |
|------|-------------|---------------|---------------|
| **Slack Incoming Webhook** | Create webhook in Slack workspace settings | Any Slack admin | 5 minutes |
| **AWS Secrets Manager entry** | Store webhook URL securely | DevOps | 10 minutes |
| **Environment variable** | `SLACK_WEBHOOK_URL` in deployment config | DevOps | 5 minutes |

### Step-by-Step: Creating the Slack Webhook

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**
2. Name: `Belva-GEN Notifications`, Workspace: your workspace
3. **Incoming Webhooks** → Toggle **On**
4. **Add New Webhook to Workspace** → Select `#belva-approvals` channel
5. Copy the webhook URL (format: `https://hooks.slack.com/services/T.../B.../xxx`)
6. Store in AWS Secrets Manager at `/belva-gen/slack-webhook-url`

**No bot token, no OAuth, no interactive components, no signing secret needed.**

### Optional: Jira ↔ Slack Native Integration

For automatic ticket status notifications (free, zero code):
1. Install **Jira Cloud for Slack** from Slack App Directory
2. Connect to your Atlassian workspace
3. Configure channel notifications for BELVA project

This supplements custom approval notifications with standard Jira status updates.

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Slack client class | `src/server/mcp/slack/client.ts` | Stub — needs webhook implementation |
| Slack Zod schemas | `src/server/mcp/slack/schemas.ts` | Partial — needs webhook payload schema |
| Slack types | `src/server/mcp/slack/types.ts` | Partial — `SlackMessage` exists |
| Notifications queue | `src/server/queues/index.ts` | Complete — `notifications` queue defined |
| Notification worker | `src/server/workers/index.ts` | Stub — `sendNotification()` is TODO |
| Env config | `src/server/config/env.ts` | Needs update — add `SLACK_WEBHOOK_URL` |

## Scope

### In Scope

- Implement `SlackNotificationClient.send()` using Incoming Webhook
- Wire notification queue → worker → webhook POST
- Approval request messages with ticket ref, risk level, and dashboard deep link
- Status update notifications (plan approved, rejected, pipeline complete)
- Retry logic via BullMQ (transient failures)

### Out of Scope (Phase 2 — see Future Enhancements)

- Interactive Slack buttons (approve/reject inline)
- Two-way Slack conversations / chatbot functionality
- Slash commands
- User mentions / DMs
- Message updates (append-only model)

### Future Enhancements (Phase 2)

If user feedback shows dashboard click-through causes approval delays:
- Upgrade to full Slack App with Bot Token
- Add interactive buttons for simple approvals (bug fixes)
- Requires: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, webhook endpoint

## Architecture Decisions

### AD-01: Incoming Webhook (not Bot API)

Use Slack Incoming Webhooks instead of the Bot API. Rationale:
- **Simpler setup:** No OAuth, no app installation flow, no signing secrets
- **No attack surface:** System sends messages, doesn't receive them
- **Sufficient for MVP:** Dashboard handles all approval actions
- **Easy upgrade path:** Can add bot later if inline actions are needed

### AD-02: Queue-based notification delivery

All Slack messages go through the `notifications` BullMQ queue. This provides:
- Retry on transient failures (Slack returns 5xx)
- Dead letter queue for persistent failures
- Rate limiting to stay under Slack's 1 message/second limit
- Async operation for faster API response times

### AD-03: Dashboard-first approval flow

Slack notifications are **informational only** — they link to the dashboard where humans review full plan details and take action. Rationale:
- Complex plans don't fit in Slack messages
- Audit trail is cleaner with single approval interface
- Reduces Slack App complexity significantly

## Implementation Steps

### Step 1: Add SLACK_WEBHOOK_URL to env config

**Files:** `src/server/config/env.ts`, `.env.example`

Replace bot token with webhook URL:

```typescript
// Remove: SLACK_BOT_TOKEN
// Add:
SLACK_WEBHOOK_URL: z.string().url().optional(),
```

### Step 2: Create Slack notification client

**Files:** `src/server/mcp/slack/client.ts`

Rewrite client to use Incoming Webhook (no SDK needed):

```typescript
export interface SlackNotificationClientConfig {
  webhookUrl: string;
}

export class SlackNotificationClient {
  private readonly webhookUrl: string;

  constructor(config: SlackNotificationClientConfig) {
    this.webhookUrl = config.webhookUrl;
  }

  async send(payload: SlackWebhookPayload, signal?: AbortSignal): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    
    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }
  }
}
```

### Step 3: Define webhook payload schema

**Files:** `src/server/mcp/slack/schemas.ts`

Define Zod schema for outgoing webhook payload:

```typescript
export const SlackWebhookPayloadSchema = z.object({
  text: z.string().optional(), // Fallback text
  blocks: z.array(z.object({
    type: z.string(),
    text: z.object({
      type: z.string(),
      text: z.string(),
    }).optional(),
    elements: z.array(z.unknown()).optional(),
    accessory: z.unknown().optional(),
  })).optional(),
  attachments: z.array(z.object({
    color: z.string().optional(),
    text: z.string().optional(),
  })).optional(),
});

export type SlackWebhookPayload = z.infer<typeof SlackWebhookPayloadSchema>;
```

### Step 4: Create message builders

**Files:** `src/server/mcp/slack/messages.ts` (create)

Build rich notification payloads:

```typescript
export function buildApprovalRequestPayload(params: {
  ticketRef: string;
  title: string;
  riskLevel: 'low' | 'medium' | 'high';
  dashboardUrl: string;
}): SlackWebhookPayload {
  const riskEmoji = { low: '🟢', medium: '🟡', high: '🔴' }[params.riskLevel];
  
  return {
    text: `Plan ready for approval: ${params.ticketRef}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📋 ${params.ticketRef}: ${params.title}` },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${riskEmoji} *Risk Level:* ${params.riskLevel}\n\nA plan is ready for your review.`,
        },
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Review in Dashboard' },
          url: params.dashboardUrl,
          style: 'primary',
        }],
      },
    ],
  };
}

export function buildStatusUpdatePayload(params: {
  ticketRef: string;
  status: 'approved' | 'rejected' | 'completed' | 'failed';
  message: string;
}): SlackWebhookPayload {
  const statusEmoji = {
    approved: '✅',
    rejected: '❌',
    completed: '🎉',
    failed: '⚠️',
  }[params.status];

  return {
    text: `${statusEmoji} ${params.ticketRef}: ${params.message}`,
  };
}
```

### Step 5: Wire notification worker

**Files:** `src/server/workers/index.ts`

Implement worker to send via webhook:

```typescript
async function sendNotification(data: NotificationJobData): Promise<void> {
  const client = getSlackNotificationClient();
  
  if (data.type === 'approval_request') {
    const payload = buildApprovalRequestPayload({
      ticketRef: data.ticketRef,
      title: data.title,
      riskLevel: data.riskLevel,
      dashboardUrl: data.dashboardUrl,
    });
    await client.send(payload);
  } else if (data.type === 'status_update') {
    const payload = buildStatusUpdatePayload({
      ticketRef: data.ticketRef,
      status: data.status,
      message: data.message,
    });
    await client.send(payload);
  }
}
```

### Step 6: Create client singleton

**Files:** `src/server/mcp/slack/index.ts`

```typescript
let instance: SlackNotificationClient | undefined;

export function getSlackNotificationClient(): SlackNotificationClient {
  if (instance === undefined) {
    const env = getEnv();
    if (!env.SLACK_WEBHOOK_URL) {
      throw new Error('SLACK_WEBHOOK_URL is required');
    }
    instance = new SlackNotificationClient({
      webhookUrl: env.SLACK_WEBHOOK_URL,
    });
  }
  return instance;
}
```

## Testing Requirements

### Unit Tests

- `__tests__/server/mcp/slack/client.test.ts`
  - Test `send()` with mocked fetch
  - Test error handling (non-2xx responses)
  - Test AbortSignal cancellation
- `__tests__/server/mcp/slack/messages.test.ts`
  - Test `buildApprovalRequestPayload()` produces valid structure
  - Test different risk levels render correct emoji
  - Test `buildStatusUpdatePayload()` for each status type
- `__tests__/server/workers/notification.test.ts`
  - Test worker routes to correct message builder
  - Test retry behavior on transient failures (via BullMQ mocks)

### Integration Tests

- Notification queue → worker → mocked webhook (verify payload shape)

### Budget Constraints

- Unit test suite must complete in <3 seconds
- Zero skipped tests
- Minimum 80% line coverage for `src/server/mcp/slack/`

## Acceptance Criteria

- [ ] `SlackNotificationClient.send()` POSTs to configured webhook URL
- [ ] Approval request notifications include ticket ref, risk level, and dashboard link
- [ ] Status update notifications show appropriate emoji for each status type
- [ ] Notification worker processes queue jobs and sends via webhook
- [ ] Failed webhook calls are retried via BullMQ (up to 3 attempts)
- [ ] All payloads validated with Zod schemas (zero `any` types)
- [ ] `AbortSignal` support on async methods
- [ ] Unit tests pass within 3-second budget
- [ ] 80%+ line coverage on `src/server/mcp/slack/`
- [ ] `SLACK_WEBHOOK_URL` documented in `.env.example`

## Dependencies

- **Depends on:** None (can be worked in parallel with Plans 01-02)
- **Blocks:** Plan 04 (Orchestrator Core — needs notifications), Plan 06 (Human Approval — Slack routing)

## Estimated Effort

1 conversation: client implementation + message builders + worker wiring + tests.

---

## DevOps Checklist

Copy this to a DevOps ticket if infrastructure provisioning is needed:

```markdown
## Request: Slack Incoming Webhook for Belva-GEN

**Priority:** Medium (blocks approval notification flow)
**Estimated Time:** 20 minutes

### Tasks

1. [ ] Create Slack App "Belva-GEN Notifications" in workspace
2. [ ] Enable Incoming Webhooks feature
3. [ ] Add webhook to `#belva-approvals` channel
4. [ ] Store webhook URL in AWS Secrets Manager: `/belva-gen/slack-webhook-url`
5. [ ] Add to deployment environment variables as `SLACK_WEBHOOK_URL`
6. [ ] (Optional) Install "Jira Cloud for Slack" integration for ticket status updates

### Verification

- POST to webhook URL with `{"text": "Test message"}` returns 200 OK
- Message appears in `#belva-approvals` channel

### Notes

- No bot token, OAuth, or interactive components needed
- This is a one-way notification system (outbound only)
- Future phase may upgrade to full bot for inline approvals
```
