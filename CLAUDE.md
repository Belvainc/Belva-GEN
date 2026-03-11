# Belva-GEN — Claude Code Configuration

> Autonomous development framework: Node.js/TypeScript backend orchestrating OpenClaw agents, paired with a Next.js/React dashboard for human-in-the-loop governance.

## Tech Stack

| Component | Technology | Purpose |
| --------- | ---------- | ------- |
| Framework | Next.js 16 (App Router) | Dashboard UI + API routes |
| UI | React 19 + Tailwind CSS v4 | Server/Client Components |
| Language | TypeScript 5 (strict) | All source code |
| Validation | Zod | Runtime schema validation for all agent communication |
| Orchestration | OpenClaw | Multi-agent task execution |
| MCP | Jira + Slack | External service integrations |
| Database | PostgreSQL 16 + Prisma ORM | Persistent state (agents, pipelines, approvals, audit) |
| Cache | Redis 7 + ioredis | Session cache, rate limiting, BullMQ backing store |
| Queues | BullMQ | Typed job queues with retry/DLQ (webhooks, agent tasks, notifications) |
| Logging | Pino | Structured JSON logging with request context |
| Unit Tests | Jest + ts-jest | Backend + component testing |
| E2E Tests | Playwright | Dashboard user journey testing |

## Critical Rules

1. **Zero `any` types** — use `unknown` + type guards. Validate all external data with Zod.
2. **Squash-merge only** — no force push, no `reset --hard`, no `checkout .`. See `.claude/rules/git-safety.md`.
3. **Test performance budgets** — unit suite <3s, E2E suite <60s, zero skipped tests.
4. **MCP safety** — never re-submit full content for metadata-only MCP operations.
5. **Human approval required** — no auto-merge, no timeout-to-approve.

## Agents

Specialized subagents in `.claude/agents/` — use them for domain-specific tasks:

| Agent | Domain | Invoke |
| ----- | ------ | ------ |
| `orchestrator-project` | Jira, DoR/DoD, epic lifecycle, task routing | "Use orchestrator-project to..." |
| `node-backend` | Node.js, APIs, database, queues, MCP integrations | "Use node-backend to..." |
| `next-ux` | React, Next.js, Tailwind, dashboard UI | "Use next-ux to..." |
| `ts-testing` | Jest, Playwright, coverage, budgets | "Use ts-testing to..." |

## Skills

Skills are shared with GitHub Copilot via symlink: `.claude/skills/` → `.github/skills/`

### Governance Skills

- `dor-validation` — Definition of Ready gate (BDD format, scope, estimates, dependencies)
- `dod-validation` — Definition of Done gate (tests, security, edge cases, architecture)
- `human-plan-approval` — Mandatory human review before agent execution

### Product Skills

- `story-writing` — BDD story format with Given/When/Then acceptance criteria
- `bug-writing` — Structured bug reports with severity and priority
- `epic-lifecycle` — 6-stage epic governance (Funnel → Refinement → Approved → In Progress → Review → Done)
- `jira-extraction` — Extract Jira ticket info from PRs, branches, descriptions

### Engineering Skills

- `component-scaffolding` — Atomic design component creation workflow (classify → create → test → export)
- `review-synthesis` — Structured PR review verdict generation (partition → check → validate → synthesize)
- `accessibility-audit` — WCAG 2.1 AA compliance checklist for UI changes

### Process Skills

- `memory-management` — When to promote agent learnings (personal → shared → rule/skill)

## Rules

Path-specific rules in `.claude/rules/` — auto-applied based on file paths:

| Rule | Applies To | Purpose |
| ---- | ---------- | ------- |
| `ts-strict-mode.md` | `src/**/*.ts`, `src/**/*.tsx` | Zero `any`, Zod validation, explicit types |
| `git-safety.md` | `**/*` | Forbidden commands, squash-merge, branch naming |
| `testing-budgets.md` | `**/*.test.ts`, `e2e/**` | Performance budgets, zero skipped tests |
| `mcp-safety.md` | `**/*` | Safe MCP tool usage |
| `component-architecture.md` | `src/components/**`, `src/app/dashboard/**/*.tsx` | Atomic design, Tailwind tokens, server/client split |
| `accessibility.md` | `src/components/**/*.tsx`, `src/app/dashboard/**/*.tsx` | WCAG 2.1 AA, ARIA, keyboard navigation |
| `async-concurrency.md` | `src/server/**/*.ts`, `src/app/api/**/*.ts` | Async patterns, AbortController, error propagation |
| `service-layer.md` | `src/app/api/**/*.ts`, `src/server/**/*.ts` | Three-layer architecture, ServerContext singleton |
| `frontend-performance.md` | `src/app/**/*.tsx`, `src/components/**/*.tsx` | CWV targets, bundle budgets, streaming |
| `data-fetching.md` | `src/app/dashboard/**/*.tsx`, `src/components/organisms/**/*.tsx` | Server-first fetch, caching, loading/error states |
| `infrastructure.md` | `src/server/**/*.ts`, `src/app/api/**/*.ts`, `prisma/**` | Database, cache, queues, resilience, logging, webhooks |

## Quick Commands

```bash
# Command menu
make help                # Show all target categories
make <category>-help     # Show targets for a category

# Development
make dev                 # Start Next.js dev server (localhost:3000)
make build               # Production build

# Setup
make setup               # Full setup (install + verify + playwright)
make verify-env          # Check tool versions

# Quality (before commits)
make quality             # ESLint + TypeScript type-check
make lint                # ESLint only
make type-check          # tsc --noEmit only

# Testing
make test-all            # Unit + E2E with summary
make test-unit           # Unit tests only
make test-e2e            # Playwright E2E
make test-coverage       # Jest with coverage
make test-budgets        # Check performance budgets

# Status & Clean
make status              # Project health overview
make clean               # Remove build artifacts
make clean-hard          # Also remove node_modules

# Infrastructure
make infra-up            # Start PostgreSQL + Redis (Docker Compose)
make infra-down          # Stop infrastructure
make db-migrate          # Run Prisma migrations
make db-studio           # Open Prisma Studio
make health              # Check service health endpoint
```

> All `make` targets delegate to `npm run` scripts or `scripts/*.sh`. You can always use `npm run <script>` directly.

## Agent Memory

Agents can promote learnings to shared memory. See `.github/skills/memory-management/SKILL.md` for when and how to promote personal context → shared knowledge → rules/skills.

## Project Structure

```
src/
  app/                    # Next.js App Router
    dashboard/            # HITL dashboard (overview, agents, pipeline, approvals)
    api/                  # API routes (agents, approvals, pipeline, webhooks)
  components/             # Atomic design component library
    atoms/                # Button, Badge, Input, Text, Spinner
    molecules/            # StatusBadge, NavItem, FormField
    organisms/            # AgentStatusTable, ApprovalCard, PipelineColumn
  server/                 # Node.js backend
    config/               # Environment (env.ts), Pino logger, Redis client, request context
    db/                   # Prisma client singleton
    orchestrator/         # OpenClaw engine, state machine
    mcp/                  # Jira + Slack MCP integrations
    agents/               # Agent registry, runner, message bus
    services/             # Business logic layer (agent, approval, pipeline, webhook)
    queues/               # BullMQ typed job queues (webhook, agent-task, notification)
    workers/              # BullMQ job processors
    lib/                  # Retry, circuit breaker, rate limiter, webhook auth, shutdown
  types/                  # Shared TypeScript types + Zod schemas
  lib/                    # Shared utilities (validation, logging, errors)
prisma/                   # Database schema and migrations
e2e/                      # Playwright E2E tests
```
