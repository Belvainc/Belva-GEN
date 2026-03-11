# Epic Lifecycle Management Skill

Validate and manage epics through Belva-GEN's 6-stage Epic Lifecycle.

---

## Purpose

Ensure epics follow proper governance through ideation, analysis, implementation, and measurement phases. This skill complements the code-level state machine in `src/server/orchestrator/state-machine.ts`.

---

## Usage

```markdown
Review epic [EPIC-KEY] against our Epic Lifecycle standards.
What stage is this epic in and what are the next steps?
```

---

## Epic Lifecycle Stages

### Stage 1: Funnel (Ideation)

**Entry Criteria:**

- Problem statement defined
- Strategic alignment confirmed
- Initial value hypothesis documented
- Epic owner assigned

**Verify:** Description has problem statement and owner is assigned.

### Stage 2: Refinement (Analysis)

**Entry Criteria:**

- Lean business case drafted
- Technical feasibility assessed
- MVP scope defined
- Success metrics identified
- Dependencies mapped
- Risk assessment completed
- Stakeholder alignment achieved

**Verify:** Epic description includes business case, success metrics, and dependencies.

### Stage 3: Approved (Committed)

**Entry Criteria:**

- Features decomposed into stories (child issues exist)
- Roadmap scheduled (fix version assigned)
- Team assigned
- Communication plan in place
- DoR validation passed (`.github/skills/dor-validation/SKILL.md`)

**Verify:** Has child issues, fix version, and team assignments.

### Stage 4: In Progress (Implementation)

**Ongoing Checkpoints:**

- Sprint goals aligned to epic
- Scope managed (changes through change control)
- Dependencies tracked
- Risks monitored weekly
- Quality gates passing (tests, type-check, lint)
- Human plan approval obtained before agent execution

**Verify:** Child issues progressing, no stale items (> 14 days without update).

### Stage 5: Review (Validation)

**Entry Criteria:**

- All tasks completed by specialized agents
- DoD validation passed (`.github/skills/dod-validation/SKILL.md`)
- All unit and E2E tests pass within performance budgets
- Security scan clean
- Human review completed

**Verify:** All child issues closed, DoD gate passed.

### Stage 6: Done (Released)

**Entry Criteria:**

- Squash-merged to main per git-safety rules
- Documentation complete
- Stakeholder sign-off
- Monitoring in place

**Verify:** Code on main, documentation attached.

---

## Epic Type Classification

| Type | Description | Indicators |
| ---- | ----------- | ---------- |
| **Business Epic** | Delivers value directly to users | Labels: `feature`, `enhancement`, `ux` |
| **Enabler Epic** | Builds technical foundation | Labels: `infrastructure`, `refactor`, `security` |

---

## Validation Process

### Step 1: Fetch Epic and Children

```
jira_search(jql="key = <EPIC_KEY> OR parent = <EPIC_KEY>", fields="*all")
```

### Step 2: Determine Current Stage

Check:

1. Does epic have child issues? (Funnel → Refinement if no, Refinement → Approved if yes)
2. Are children in progress? (Approved → In Progress)
3. Are all children done? (In Progress → Review)
4. Has DoD passed and code been merged? (Review → Done)

### Step 3: Verify Stage Gate Criteria

Use the criteria listed above for the identified stage.

---

## State Machine Mapping

This skill's stages map to the code state machine in `src/server/orchestrator/state-machine.ts`:

| Skill Stage | Code State | Trigger |
| ----------- | ---------- | ------- |
| Funnel | `funnel` | Initial registration |
| Refinement | `refinement` | `ticket-triaged` |
| Approved | `approved` | `dor-passed` |
| In Progress | `in-progress` | `plan-approved` |
| Review | `review` | `task-completed` |
| Done | `done` | `dod-passed` |

---

## Output Format

```markdown
## Epic Review: [EPIC-KEY]

**Type:** Business Epic | Enabler Epic
**Current Stage:** [Stage Name]
**Status:** On Track | At Risk | Blocked

### Stage Gate Assessment

**[Current Stage] Criteria:**
- [x] Problem statement defined
- [x] Strategic alignment confirmed
- [ ] **Missing:** Success metrics not defined

### Progress Summary
- **Total Stories:** X
- **Completed:** Y (Z%)
- **In Progress:** A
- **Blocked:** B

### Issues to Address
1. [Issue description and recommendation]

### Next Actions
1. [What needs to happen to advance to next stage]

### Transition Recommendation
[Ready to advance to [Next Stage] | Needs work before advancing | Blocked - cannot proceed]
```

---

## Anti-Patterns to Flag

| Anti-Pattern | Flag As |
| ------------ | ------- |
| Skipping Refinement stage | Blocking — every epic needs analysis |
| Scope creep during In Progress | New scope must go to backlog |
| No success metrics before Done | Blocking — cannot measure without metrics |
| Epic with no children in Approved | Must decompose before implementation |
| Stale In Progress (> 30 days, no updates) | Review and update or close |
| Epic without owner | Blocking — must have accountable owner |
