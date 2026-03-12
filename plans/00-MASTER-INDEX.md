# Belva-GEN Implementation Plans — Master Index

> 10 plans organized by dependency order across 3 phases.
> Each plan is a self-contained, conversation-sized unit of work.

## Dependency Graph

```
Plan 01 ─────────────────────────────────┐
Plan 02 ──┐                              │
Plan 03 ──┼──> Plan 04 ──> Plan 06 ──> Plan 09 ──> Plan 10
Plan 05 ──┘         │
                    └──> Plan 07 ──────────────────────────> Plan 10
Plan 08 (independent, parallel track)
```

## Phase 1: Agent Guidance & Process Governance

| Plan | Title | Key Deliverables | Status |
|------|-------|------------------|--------|
| [01](01-jira-mcp-integration.md) | JIRA MCP Integration & Webhook Pipeline | Jira client, webhook processing, "GEN" label monitoring | Not Started |
| [02](02-governance-gates.md) | DoR/DoD Gate Enforcement | Gate validation logic, orchestrator gate handlers, audit trail | Not Started |
| [03](03-slack-mcp-notifications.md) | Slack MCP & Notification System | Slack client, approval notifications, channel routing | Not Started |
| [04](04-orchestrator-core-loop.md) | Orchestrator Core Loop & Agent Routing | Event handler wiring, task dispatch, agent resolution, service layer | Not Started |

## Phase 2: Infrastructure & Core Orchestration

| Plan | Title | Key Deliverables | Status |
|------|-------|------------------|--------|
| [05](05-service-layer-api.md) | Service Layer & API Foundation | Three-layer architecture, API route connections, request context | Not Started |
| [06](06-human-approval-flow.md) | Human-Gated Planning & Approval Flow | Plan generation, approval UI, Slack approval routing, timeout handling | Not Started |
| [07](07-dashboard-component-library.md) | Dashboard UI & Component Library | Atomic design components, dashboard pages, real-time data | Not Started |
| [08](08-openclaw-agent-execution.md) | OpenClaw Integration & Hybrid Deployment | Agent execution runtime, Docker/EC2 deployment, local dev parity | Not Started |

## Phase 3: Phased Rollout & Use Cases

| Plan | Title | Key Deliverables | Status |
|------|-------|------------------|--------|
| [09](09-bug-autofix-pipeline.md) | Stage 1 — Bug Auto-Fix Pipeline | Low-complexity automation, single-agent loop, auto-merge on green | Not Started |
| [10](10-feature-epic-pipelines.md) | Stages 2 & 3 — Feature & Epic Pipelines | Multi-agent features, epic decomposition, parallel execution, merge sequencing | Not Started |

## Cross-Cutting Concerns

Testing infrastructure (unit + E2E) is built incrementally within each plan rather than as a separate effort.
Each plan includes its own test requirements matching the budgets in `.claude/rules/testing-budgets.md`.

## Conversation Sizing

Each plan is scoped to be completable in 1-2 focused Claude Code conversations:
- Plans 01-03: ~1 conversation each (MCP client + tests)
- Plans 04-05: ~1-2 conversations each (orchestrator wiring + service layer)
- Plans 06-07: ~2 conversations each (UI-heavy, component library)
- Plan 08: ~1-2 conversations (OpenClaw research + integration)
- Plans 09-10: ~1-2 conversations each (pipeline assembly from prior work)

## How to Use These Plans

1. Work plans in order (01 → 10), respecting the dependency graph
2. Each plan has **Research Questions** that should be answered before implementation
3. Each plan has **Acceptance Criteria** that define "done"
4. Use the `human-plan-approval` skill before starting implementation on any plan
5. Update this index as plans are completed
