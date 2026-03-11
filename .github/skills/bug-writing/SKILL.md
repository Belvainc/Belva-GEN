# Bug Writing Skill

Write Jira bugs that are specific, reproducible, and actionable — from the user's perspective.

---

## Purpose

Ensure bugs describe **what went wrong for the user**, not what the developer needs to change. A well-written bug lets anyone — QA, product, support, or engineering — understand the impact and reproduce the problem without a Slack conversation.

---

## Usage

```markdown
Write a Jira bug for [problem description].
Use the bug-writing skill.
```

---

## Bug Format

### Title

Describe the **symptom**, not the cause or the fix.

Format: `[Area] What happens — when it should [correct behavior]`

| Bad (assumes cause / vague) | Good (factual symptom) |
| --------------------------- | ---------------------- |
| Fix dashboard rendering bug | Dashboard agent cards show "offline" for active agents |
| Pipeline broken | Pipeline view does not update after approval — requires page refresh |
| WebSocket issue | Agent status changes not reflected in real-time on overview page |

**Tests:**

- Could someone reproduce this from the title alone? (specificity)
- Does it describe what the user *sees*, not what the code *does*? (perspective)
- Is it free of blame, emotion, and assumptions about root cause? (objectivity)

### Description

Structure the description with these sections in order:

#### 1. Problem Statement (2-3 sentences)

What is happening, who is affected, and why it matters. Write from the user's perspective.

#### 2. Business Impact

State the real-world consequences. This drives priority decisions.

```
**Impact:**
- **Who:** All dashboard users reviewing agent approvals
- **Frequency:** Every approval workflow
- **Consequence:** Approvers cannot see plan details, blocking all agent execution
- **Workaround:** Refresh page manually after each status change
```

#### 3. Steps to Reproduce

Numbered, specific, starting from a known state.

```
**Steps to Reproduce:**
1. Log in to the dashboard at /dashboard
2. Navigate to /dashboard/approvals
3. Wait for a pending approval to appear
4. Click "Approve"
5. Observe the approval card state
```

#### 4. Expected vs Actual Behavior

```
**Expected:** Approval card updates to show "Approved" status and agent work begins.
**Actual:** Approval card remains in "Pending" state. Page refresh required to see update.
```

#### 5. Environment

```
**Environment:**
- URL: http://localhost:3000/dashboard/approvals
- Browser: Chrome 131 / macOS
- Node.js: v20.12.1
- Reproducibility: Always
```

#### 6. Evidence (optional but strongly encouraged)

Screenshots, console errors, network tab output, relevant log lines.

---

## Acceptance Criteria

### Use Given/When/Then for the Correct Behavior

Bug AC describes **what should happen after the fix** — not the fix itself.

```
Scenario: Approval status updates in real-time
Given a pending approval is visible on the approvals page
When the reviewer clicks "Approve"
Then the approval card immediately shows "Approved" status
And the pipeline view moves the ticket to "In Progress"
```

### AC Rules

1. **Describe correct behavior** — not the code change, not "bug is fixed"
2. **No implementation details** — no mention of functions, message bus, or state management
3. **Domain language only** — if a project manager wouldn't understand, rewrite
4. **Cover the reported path AND edge cases**
5. **Each scenario is independently testable**

---

## Severity vs Priority

### Severity (Technical Impact)

| Severity | Definition | Example |
| -------- | ---------- | ------- |
| **Critical** | System unusable, data loss, security breach, no workaround | Dashboard inaccessible, agents execute without approval |
| **Major** | Core feature broken, significant user impact | Approval workflow doesn't update state |
| **Moderate** | Feature works but incorrectly in specific conditions | Pipeline view shows wrong stage for re-approved tickets |
| **Minor** | Cosmetic, edge case, or low-frequency annoyance | Tooltip text truncated on narrow screens |

### Priority (Business Urgency)

| Priority | When to Use |
| -------- | ----------- |
| **Highest** | Fix immediately — governance is compromised |
| **High** | Fix this sprint — significant user impact |
| **Medium** | Fix next sprint — workaround exists |
| **Low** | Fix when convenient — minor annoyance |
| **Lowest** | Backlog — cosmetic or theoretical edge case |

---

## Anti-Patterns to Catch

| Anti-Pattern | Fix |
| ------------ | --- |
| Vague title ("Bug on page") | Be specific: what page, what behavior, what's wrong |
| Assumes root cause ("WebSocket disconnected") | Report the symptom: "Agent status not updating in real-time" |
| Missing steps to reproduce | Write numbered steps from a known starting state |
| No expected vs actual | Always state both — it defines the exit criteria |
| "Should work correctly" as AC | Write Given/When/Then with concrete values |
| Implementation as AC ("Fix the state update") | Describe correct user-facing behavior |

---

## Process

```
1. Confirm it's a bug (not a feature request or expected behavior)
2. Reproduce the issue and document exact steps
3. Write the title as the symptom (factual, specific)
4. Write the structured description (Problem → Impact → Steps → Expected/Actual → Environment)
5. Assess severity (technical impact) and priority (business urgency)
6. Write Given/When/Then AC describing correct behavior after fix
7. Attach evidence (screenshots, logs, console output)
8. Put root cause analysis or implementation notes in a comment
```
