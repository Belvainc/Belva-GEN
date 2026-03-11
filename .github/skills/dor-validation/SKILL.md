# Skill: Definition of Ready (DoR) Validation

## Purpose

Validates that a Jira ticket meets all readiness criteria before any coding agent is spawned. This gate prevents underspecified work from entering the development pipeline.

## Trigger

Called by @orchestrator-project when a ticket transitions from **Refinement → Approved**.

---

## Validation Steps

### Step 1: BDD Format Check

Acceptance criteria MUST follow Given/When/Then (GWT) format.

**Valid example:**
```
GIVEN a user is authenticated on the dashboard
WHEN they navigate to /dashboard/approvals
THEN they see a list of pending plan approvals sorted by creation date
AND each approval card shows the ticket reference, agent assignments, and risk level
```

**Rejection criteria:**
- Vague narratives without GWT structure
- Missing GIVEN (no context), missing WHEN (no trigger), missing THEN (no expected outcome)
- Criteria that combine multiple unrelated behaviors in a single GWT block

### Step 2: Scope Clarity

- **Title:** Must be a single actionable statement, <100 characters
- **Description** must include these sections:
  - **Context:** Why this work is needed
  - **Requirements:** What must be built (specific, measurable)
  - **Out-of-Scope:** What is explicitly excluded from this ticket
- **Assignee agent type:** Exactly one primary type — `backend`, `frontend`, or `testing`
  - Cross-cutting tickets must be split into separate tickets per agent type

### Step 3: Testable Acceptance Criteria

Each criterion must be independently verifiable with a concrete, measurable outcome.

**Reject criteria containing:**
- "should work correctly"
- "looks good"
- "as expected"
- "performs well"
- Any subjective or unmeasurable language

**Require criteria specifying:**
- Specific response codes, latency thresholds, or state transitions
- Exact UI behavior (element visibility, navigation, error messages)
- Data validation rules with examples of valid/invalid input

### Step 4: Complexity Estimate

- Must have a Fibonacci story point estimate: **1, 2, 3, 5, 8, or 13**
- Tickets estimated at **>8 points** must be split into sub-tasks before approval
- Estimate must be present before the ticket can be approved
- If no estimate exists, return to Refinement with a request to size

### Step 5: Dependencies Declared

- Any `blocked-by` relationships must be documented in Jira ticket links
- External API dependencies must list:
  - Endpoint URL or service name
  - Expected request/response schema
  - Authentication requirements
- Infrastructure dependencies (new env vars, services, permissions) must be listed

---

## Output

### PASS
- All 5 validation steps satisfied
- Emit `DoRPassEvent` with validation timestamp and ticket reference
- Ticket transitions to **Approved** state
- Orchestrator may proceed to plan generation

### FAIL
- Return structured failure report:
  ```
  DoR Validation Failed for [BELVA-XXX]

  Failed Steps:
  - Step 2: Scope Clarity — missing "Out-of-Scope" section
  - Step 4: Complexity Estimate — no story points assigned

  Remediation:
  - Add an "Out-of-Scope" section to the ticket description
  - Add a Fibonacci story point estimate (1-13)
  ```
- Ticket remains in **Refinement** state
- Notify ticket assignee via Slack with failure details
