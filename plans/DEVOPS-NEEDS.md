# DevOps Infrastructure Needs

> Tracking document for infrastructure provisioning requests. Each item has a priority, estimated effort, and blocking status.

## Status Legend

| Status | Meaning |
|--------|---------|
| ⬜ Pending | Not yet requested |
| 🟡 Requested | Ticket created, awaiting action |
| 🟢 Complete | Provisioned and verified |
| ❌ Blocked | Blocked by other work |

---

## Active Requests

### 1. Jira API Credentials

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Effort** | 15 minutes |
| **Blocks** | Plan 01 (Jira MCP integration) |
| **Status** | ⬜ Pending |

**Tasks:**

- [ ] Create Jira API token for service account (or use existing user)
  - Go to: https://id.atlassian.com/manage-profile/security/api-tokens
  - Create token with label `belva-gen-service`
- [ ] Store credentials in AWS Secrets Manager:
  - `/belva-gen/jira-base-url` → `https://your-org.atlassian.net`
  - `/belva-gen/jira-user-email` → service account email
  - `/belva-gen/jira-api-token` → API token from step 1
- [ ] Add to deployment environment variables:
  - `JIRA_BASE_URL`
  - `JIRA_USER_EMAIL`
  - `JIRA_API_TOKEN`
  - `JIRA_PROJECT_KEY=BELVA`

**Verification:**

```bash
# Test API access (replace values)
curl -u "email@example.com:$JIRA_API_TOKEN" \
  "https://your-org.atlassian.net/rest/api/3/project/BELVA" \
  | jq '.key, .name'
# Should return: "BELVA" and project name
```

**Notes:**
- API token is tied to a user account — use a service account if possible
- Token has same permissions as the user who created it
- Required permissions: Read issues, Transition issues, Add comments

---

### 2. Jira Webhook Registration

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Effort** | 15 minutes |
| **Blocks** | Plan 01 (Jira MCP integration) |
| **Status** | ⬜ Pending |

**Tasks:**

- [ ] Register webhook URL in Jira project settings:
  - Go to: Jira → Project Settings → Webhooks (or System → Webhooks for global)
  - URL: `https://belva-gen.example.com/api/webhooks/jira`
- [ ] Configure events:
  - `jira:issue_created`
  - `jira:issue_updated`
  - `issue_property_set` (for label changes)
- [ ] (Optional) Store `WEBHOOK_SECRET` in AWS Secrets Manager
  - Note: Jira Cloud webhooks don't use HMAC by default — relies on URL secrecy
  - Only needed if using Atlassian Connect JWT signing

**Verification:**

- Create/update an issue in BELVA project
- Check application logs for webhook receipt
- Or use Jira webhook history to see delivery status

**Notes:**
- Webhook URL must be publicly accessible (or via VPN tunnel)
- For local dev, use ngrok or similar tunnel
- Jira retries failed webhooks for up to 8 hours

---

### 3. Slack Incoming Webhook

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Effort** | 20 minutes |
| **Blocks** | Plan 03 (Slack notifications), Plan 04 (Orchestrator), Plan 06 (Approvals) |
| **Status** | ⬜ Pending |

**Tasks:**

- [ ] Create Slack App "Belva-GEN Notifications" in workspace
- [ ] Enable Incoming Webhooks feature
- [ ] Add webhook to `#belva-approvals` channel
- [ ] Store webhook URL in AWS Secrets Manager: `/belva-gen/slack-webhook-url`
- [ ] Add to deployment environment variables as `SLACK_WEBHOOK_URL`

**Verification:**

```bash
curl -X POST -H 'Content-Type: application/json' \
  --data '{"text":"Test from Belva-GEN"}' \
  "$SLACK_WEBHOOK_URL"
# Should return "ok" and message appears in #belva-approvals
```

**Notes:**
- No bot token, OAuth, or interactive components needed
- One-way notification system (outbound only)
- Future phase may upgrade to full bot for inline approvals

---

### 4. Jira Cloud for Slack (Optional)

| Field | Value |
|-------|-------|
| **Priority** | Low |
| **Effort** | 10 minutes |
| **Blocks** | Nothing (nice-to-have) |
| **Status** | ⬜ Pending |

**Tasks:**

- [ ] Install "Jira Cloud for Slack" from Slack App Directory
- [ ] Connect to Atlassian workspace
- [ ] Configure channel notifications for BELVA project in `#belva-notifications`

**Notes:**
- Supplements custom approval notifications with standard Jira status updates
- Zero code required — just Slack admin action

---

### 5. Anthropic API Credentials (LLM Task Decomposition)

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Effort** | 15 minutes |
| **Blocks** | Plan 04 (Orchestrator Core Loop — task decomposition) |
| **Status** | ⬜ Pending |

**Tasks:**

- [ ] Create Anthropic API key at https://console.anthropic.com/settings/keys
  - Use organization key (not personal) for production
  - Label: `belva-gen-orchestrator`
- [ ] Store credentials in AWS Secrets Manager:
  - `/belva-gen/anthropic-api-key` → API key from step 1
- [ ] Add to deployment environment variables:
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_MODEL=claude-sonnet-4-20250514` (configurable)
- [ ] Add `@anthropic-ai/sdk` npm dependency to project

**Verification:**

```bash
# Test API access
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":100,"messages":[{"role":"user","content":"Say hello"}]}'
# Should return a valid response with "hello" content
```

**Notes:**
- Used for ticket decomposition into task graphs with dependency ordering
- Claude Sonnet recommended for balance of capability and cost
- Consider usage limits: task decomposition happens once per ticket, not high volume
- Fallback: structured templates if LLM unavailable (degraded mode)

---

### 6. GitHub Token (PR Creation & Management)

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Effort** | 15 minutes |
| **Blocks** | Plan 09 (Bug Auto-Fix PR creation), Plan 10 (Feature/Epic PR creation) |
| **Status** | ⬜ Pending |

**Tasks:**

- [ ] Create GitHub Personal Access Token (Fine-Grained) or GitHub App
  - Go to: https://github.com/settings/tokens?type=beta (fine-grained)
  - Or create a GitHub App for machine-to-machine access
  - Label: `belva-gen-pr-automation`
- [ ] Configure token permissions:
  - `contents: write` (push branches)
  - `pull_requests: write` (create/update PRs, add labels)
  - `checks: read` (verify CI status before merge)
  - Scope to the target repository only
- [ ] Store credentials in AWS Secrets Manager:
  - `/belva-gen/github-token` → token from step 1
- [ ] Add to deployment environment variables:
  - `GITHUB_TOKEN`
  - `GITHUB_REPO=owner/repo-name` (format: `owner/repo`)

**Verification:**

```bash
# Test API access
curl -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$GITHUB_REPO" \
  | jq '.full_name, .permissions'
# Should return repo name and permissions object with push: true
```

**Notes:**
- Fine-grained tokens preferred over classic tokens (scoped to single repo)
- GitHub App tokens auto-rotate and are more secure for production
- Used by `@octokit/rest` in `src/server/services/pr.service.ts`
- Token must have push access to create feature/fix branches

---

## Future Requests (Not Yet Needed)

### Production Database (PostgreSQL)

| Field | Value |
|-------|-------|
| **Priority** | High (before staging deployment) |
| **Effort** | 1-2 hours |
| **Blocks** | Staging/production deployment |
| **Status** | ⬜ Pending |

**Tasks:**

- [ ] Provision RDS PostgreSQL 16 instance
- [ ] Configure security groups for EKS access
- [ ] Create database `belva_gen`
- [ ] Store connection string in AWS Secrets Manager: `/belva-gen/database-url`
- [ ] Run Prisma migrations

---

### Production Redis

| Field | Value |
|-------|-------|
| **Priority** | High (before staging deployment) |
| **Effort** | 30 minutes |
| **Blocks** | Staging/production deployment |
| **Status** | ⬜ Pending |

**Tasks:**

- [ ] Provision ElastiCache Redis 7 cluster
- [ ] Configure security groups for EKS access
- [ ] Store connection string in AWS Secrets Manager: `/belva-gen/redis-url`

---

## Completed Requests

_None yet_

---

## How to Use This Document

1. **Adding a request:** Copy the template below and fill in details
2. **Updating status:** Change the status emoji and check off tasks
3. **Moving to completed:** Cut the section and paste under "Completed Requests"

### Template

```markdown
### [Name]

| Field | Value |
|-------|-------|
| **Priority** | High / Medium / Low |
| **Effort** | X minutes/hours |
| **Blocks** | Plan XX, Plan YY |
| **Status** | ⬜ Pending |

**Tasks:**

- [ ] Task 1
- [ ] Task 2

**Verification:**

[How to verify it's working]

**Notes:**

[Any additional context]
```
