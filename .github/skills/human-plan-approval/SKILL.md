# Skill: Human Plan Approval Gate

## Purpose

Enforces mandatory human review and approval before any agent executes implementation work. This is the critical human-in-the-loop checkpoint that prevents autonomous code changes without oversight.

## Trigger

Called by @orchestrator-project after a ticket passes DoR validation and an implementation plan has been generated.

---

## Workflow Steps

### Step 1: Generate Plan Summary

Compile the implementation plan including:

- **Ticket reference:** Jira ID, title, and story points
- **Files to be created/modified:** Full paths with brief description of changes
- **Agent assignments:** Which specialized agent handles each component
- **Estimated complexity:** Low / Medium / High with rationale
- **Risk areas:** Potential failure points, breaking changes, or security concerns
- **Test plan outline:** What tests will be written and what they cover
- **Dependencies:** Any prerequisites or blocked-by tickets

### Step 2: Present for Approval

#### Primary Channel: Dashboard UI
- Display plan at `/dashboard/approvals` with:
  - Structured plan summary from Step 1
  - Diff-preview of proposed file changes (when possible)
  - Three action buttons: **Approve** / **Request Changes** / **Reject**
  - Free-text comment field for feedback

#### Secondary Channel: Slack Notification
- Send structured message to configured approval channel via Slack MCP
- Include:
  - Ticket reference and plan summary
  - Deep link to dashboard approval page
  - Risk level indicator
- Do NOT include full plan in Slack — link to dashboard for details

### Step 3: Await Response

**BLOCK all execution** until one of the following occurs:

| Response | Event Emitted | Behavior |
|----------|--------------|----------|
| Human clicks **Approve** | `PlanApprovedEvent` | Proceed to execution |
| Human clicks **Request Changes** | `PlanRevisionRequestedEvent` | Re-plan with feedback |
| Human clicks **Reject** | `PlanRejectedEvent` | Close task |
| Timeout (configurable, default: 24 hours) | `PlanExpiredEvent` | Keep in queue |

**Critical rules:**
- NO automatic approval under any circumstances
- NO timeout-to-approve (timeout keeps the plan pending, does not approve it)
- NO bypass mechanism — every plan must be explicitly approved by a human

### Step 4: Process Response

#### Approved
- Orchestrator proceeds with task delegation to specialized agents
- Approval recorded in audit log with timestamp, approver identity, and plan hash

#### Revision Requested
- Parse human feedback from the comment field
- Re-run planning phase with human feedback incorporated as additional constraints
- Return to Step 2 with the revised plan
- Track revision count — alert if >3 revisions (may indicate poorly scoped ticket)

#### Rejected
- Update Jira ticket status to **Blocked**
- Add Jira comment with rejection reason
- Notify original requester via Slack
- No further agent work on this ticket until re-submitted

#### Expired
- Send reminder notification via Slack
- Keep ticket in **Awaiting Approval** state
- Plan remains viewable on dashboard for eventual action

---

## Security & Audit

- Only users with `approver` role can approve, request changes, or reject plans
- All approval actions are audit-logged with:
  - Timestamp (ISO 8601)
  - User identity
  - Action taken (approve/revise/reject)
  - Plan hash (SHA-256) to prove which plan was approved
  - Comment text (if any)
- Audit log is append-only and tamper-evident
- Dashboard approval UI requires authenticated session (VPN + auth middleware)
