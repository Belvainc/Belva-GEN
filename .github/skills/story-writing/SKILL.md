# Story Writing Skill

Write Jira stories from a stakeholder perspective with BDD acceptance criteria.

---

## Purpose

Ensure stories describe **business outcomes**, not implementation tasks. Stories should be understandable by any stakeholder who asks "why are we doing this?"

---

## Usage

```markdown
Write a Jira story for [feature/change].
Use the story-writing skill for BDD format.
```

---

## Story Format

### Title

Describe the **outcome**, not the technique.

| Bad (implementation) | Good (outcome) |
| -------------------- | -------------- |
| Add WebSocket support to agent runner | Real-time agent status updates on dashboard |
| Refactor message bus to use Redis | Reliable message delivery across agent restarts |
| Add Zod validation to webhook | Prevent malformed Jira events from crashing pipeline |

**Test:** Would a non-technical stakeholder understand why this matters from the title alone?

### Description

```
**As a** [end user role — never "developer" or "engineer"],
**I want** [capability, not implementation],
**so that** [business value — the most important clause].
```

The "so that" clause is **the reason the story exists**. If you can't articulate it, the story isn't ready.

| Bad "so that" | Good "so that" |
| ------------- | -------------- |
| so that the code is cleaner | so that new agent types can be added without regression risk |
| so that we use fewer API calls | so that approval workflows complete before the reviewer's context expires |
| so that the system is faster | so that the dashboard loads agent status within 2 seconds of page open |

### Context Section

Two to three sentences max. Connect to the business problem. Name the incident, user complaint, or business need that triggered this work. Link to related tickets.

---

## Acceptance Criteria

### Use Given/When/Then for Business Behavior

Acceptance criteria describe **what users observe**, not what developers build.

```
**Scenario: [descriptive name]**
Given [precondition a stakeholder would understand]
When [action or event that triggers behavior]
Then [observable outcome]
```

### Rules

1. **No implementation details** — no mention of Zod schemas, message bus, WebSockets, or TypeScript types
2. **No technical assertions** — "unit tests pass" is Definition of Done, not acceptance criteria
3. **Domain language only** — if a project manager wouldn't understand the words, rewrite
4. **Concrete values** — not "fast" but "within 2 seconds"; not "many" but "50 agents"
5. **Observable outcomes** — "the approval card shows risk level" not "HumanApprovalRequest includes riskLevel field"

### Good Example

```
Scenario: Agent completes task successfully
Given an agent is assigned a backend task for ticket BELVA-042
When the agent reports task completion
Then the dashboard pipeline view moves the ticket to "Review" stage
And the orchestrator triggers DoD validation automatically

Scenario: Human rejects implementation plan
Given a plan is pending approval on the dashboard
When the reviewer clicks "Reject" and provides a reason
Then no agent work begins
And the ticket returns to "Refinement" in the pipeline
```

### Bad Example (implementation dressed as AC)

```
- [ ] TaskCompletion message published to MessageBus
- [ ] AgentRunner updates registry status to idle
- [ ] OrchestratorEngine.handleEvent processes dod-pass event
```

**Why it's bad:** These are tasks for the developer, not outcomes for the user.

---

## Anti-Patterns to Catch

| Anti-Pattern | Fix |
| ------------ | --- |
| "As a developer, I want..." | Rewrite from end-user perspective. Who benefits? |
| Title describes implementation | Rewrite as outcome. What does the business gain? |
| AC is a task checklist | Rewrite as Given/When/Then behavior scenarios |
| "Unit tests pass" as AC | Move to Definition of Done — it applies to all stories |
| Technical jargon in AC | Replace with domain language |
| No "so that" clause | Add it. If you can't, the story may not have clear business value |
| AC says "should work correctly" | Replace with specific scenario describing correct behavior |

---

## INVEST Self-Check

Before submitting, verify:

| Criterion | Question |
| --------- | -------- |
| **I**ndependent | Can this ship without other stories completing first? |
| **N**egotiable | Is the implementation approach left to the developer? |
| **V**aluable | Would a stakeholder care if this shipped tomorrow? |
| **E**stimable | Does the team understand the scope well enough to size it? |
| **S**mall | Can this be completed in a single sprint? |
| **T**estable | Can every AC be verified with a pass/fail result? |

---

## Where Implementation Details Go

Implementation details are valuable but belong in **comments**, not the story body.

| Content | Location |
| ------- | -------- |
| User story, business context, AC | Story description |
| Files to change, technical approach, architecture | Comment on the story |
| RFC, design docs, diagrams | Linked Confluence page |
| Code quality, test coverage, review | Definition of Done (applies to all stories) |

---

## Process

```
1. Identify the business outcome (why are we doing this?)
2. Write the title as the outcome
3. Write As a/I want/So that from the end user's perspective
4. Write Given/When/Then scenarios for each key behavior
5. Put implementation details in a comment
6. Self-check against INVEST and anti-patterns
7. Link supporting documents (RFC, related tickets)
```
