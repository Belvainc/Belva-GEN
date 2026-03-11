# Jira Extraction Skill

Extract and parse Jira ticket information from PRs, branches, and descriptions.

---

## Purpose

Consistently identify Jira ticket references across all PR and branch conventions so the orchestrator can link code changes to tracked work.

---

## Usage

```markdown
Extract the Jira ticket from this PR.
Use the jira-extraction skill.
```

---

## Ticket Identification

Find the Jira key in these locations (in order):

1. **PR title**: `BELVA-123: Feature description`
2. **Branch name**: `feature/BELVA-456-some-feature`
3. **PR description**: `Fixes BELVA-789` or `Closes GEN-101`

**Pattern**: `[A-Z]+-\d+`

**Known prefixes:**

- `BELVA-` — Product features and epics
- `GEN-` — Belva-GEN specific tickets
- `DEVOP-` — DevOps/infrastructure
- `TB-` — Tech debt / bugs

---

## Extraction Process

1. Search PR title for pattern
2. If not found, search branch name
3. If not found, search PR body
4. Return first match or "Not found"

---

## Jira Data to Fetch

When Jira MCP is available, fetch:

| Field | Purpose |
| ----- | ------- |
| Summary | Ticket title |
| Description | Full context |
| Acceptance Criteria | "Done when..." items |
| Issue Type | Bug/Story/Task affects review focus |
| Status | Should be "In Progress" or "In Review" |
| Linked Issues | Dependencies and related work |
| Epic | Parent feature context |
| Story Points | Complexity estimate |

---

## Output Format

```markdown
**Jira Ticket:** [KEY] - [Summary]
**Type:** [Bug/Story/Task/Epic]
**Status:** [Current status]
**Story Points:** [Estimate]

**Acceptance Criteria:**
- ✅ Criterion 1 - **Evidence:** <file/feature>
- ⚠️ Criterion 2 - **Status:** Partially addressed
- ❌ Criterion 3 - **Status:** Not addressed

**Dependencies:** [Linked issues or "None"]
```

---

## When Jira Unavailable

If no Jira MCP or ticket not found:

```markdown
**Jira Ticket:** Not found in PR description
**Note:** Unable to validate against acceptance criteria
```

---

## Integration with Orchestrator

The orchestrator agent uses this skill to:

1. Extract ticket references from incoming webhook events (`src/app/api/webhooks/jira/route.ts`)
2. Link `TaskAssignment` messages to specific tickets via the `ticketRef` field
3. Validate that all PRs reference a tracked ticket before DoD gate passes

The ticket key regex pattern is also defined in the Jira types at `src/server/mcp/jira/types.ts` as `z.string().regex(/^[A-Z]+-\d+$/)`.
