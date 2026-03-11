# Belva-GEN

Autonomous development framework that orchestrates AI agents via OpenClaw, with a Next.js dashboard for human-in-the-loop governance. Agents plan, build, and ship — humans approve, intervene, and steer.

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL and Redis)
- npm

## Quick Start

```bash
# Install dependencies
make setup

# Start PostgreSQL + Redis
make infra-up

# Run database migrations
make db-migrate

# Copy environment config (defaults work for local dev)
cp .env.example .env.local

# Start the dev server
make dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

## Architecture

Belva-GEN has two halves: a **Node.js backend** that orchestrates AI agents, and a **Next.js dashboard** where humans govern the pipeline.

```text
Browser → Next.js Dashboard (React 19, Tailwind v4)
              ↓
         API Routes → Services → Providers
              ↓              ↓           ↓
         PostgreSQL    BullMQ Jobs    MCP Clients
         (Prisma)     (Redis)        (Jira, Slack)
```

**Backend** manages agent lifecycle, pipeline state, job queues, and external integrations. All state is persisted to PostgreSQL via Prisma. Redis handles caching, rate limiting, and BullMQ job storage.

**Dashboard** shows four views: system overview, agent status, pipeline progress, and pending approvals. Server Components fetch data directly from services — no unnecessary API round-trips.

### Key Directories

```text
src/
  app/                  Next.js App Router (dashboard pages + API routes)
  components/           Atomic design library (atoms → molecules → organisms)
  server/
    orchestrator/       OpenClaw engine, state machine
    agents/             Agent registry, runner, message bus
    mcp/                Jira + Slack MCP integrations
    config/             Environment, logging, Redis, request context
    db/                 Prisma client
    queues/             BullMQ typed job queues
    workers/            BullMQ job processors
    lib/                Retry, circuit breaker, rate limiter, webhook auth
  types/                Shared TypeScript types + Zod schemas
prisma/                 Database schema and migrations
e2e/                    Playwright E2E tests
```

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4 |
| Language | TypeScript 5 (strict, zero `any`) |
| Database | PostgreSQL 16, Prisma ORM |
| Cache / Queues | Redis 7, ioredis, BullMQ |
| Logging | Pino (structured JSON) |
| Validation | Zod |
| Testing | Jest, Playwright |
| Orchestration | OpenClaw |
| MCP Integrations | Jira, Slack |

## Development

```bash
make dev             # Start dev server
make quality         # Lint + type-check (run before commits)
make test-all        # Unit + E2E tests
make test-coverage   # Jest with coverage report
make status          # Project health overview
```

See `make help` for the full command menu, or `make <category>-help` for a specific category (dev, test, quality, setup, infra, clean).

## Infrastructure

Local development runs PostgreSQL and Redis via Docker Compose:

```bash
make infra-up        # Start containers
make infra-down      # Stop containers
make db-migrate      # Run Prisma migrations
make db-studio       # Browse database in Prisma Studio
make health          # Check service health endpoint
```

Production uses managed services (e.g., Neon/Supabase for PostgreSQL, Upstash for Redis).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, branch conventions, and commit message format.

## License

Proprietary. All rights reserved.
