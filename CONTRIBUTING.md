# Contributing to Belva-GEN

## Setup

```bash
make setup           # Install deps, verify environment, install Playwright browsers
make infra-up        # Start PostgreSQL + Redis via Docker
make db-migrate      # Create database tables
cp .env.example .env.local
make dev             # Start dev server at localhost:3000
```

## Branch Workflow

All changes go through pull requests — no direct commits to `main`.

1. Create a branch from `main`:

   ```bash
   git checkout -b feature/BELVA-042-agent-dashboard
   ```

2. Branch naming:

   | Type | Pattern | Example |
   | ---- | ------- | ------- |
   | Feature | `feature/BELVA-XXX-short-description` | `feature/BELVA-042-agent-dashboard` |
   | Fix | `fix/BELVA-XXX-short-description` | `fix/BELVA-099-null-state-crash` |
   | Chore | `chore/short-description` | `chore/update-dependencies` |

3. Commit messages follow this format:

   ```text
   type(scope): description [BELVA-XXX]
   ```

   **Types:** `feat`, `fix`, `chore`, `test`, `docs`, `refactor`
   **Scopes:** `orchestrator`, `backend`, `frontend`, `testing`, `governance`

   Examples:

   ```text
   feat(orchestrator): add epic state machine transitions [BELVA-012]
   fix(backend): validate webhook payload before processing [BELVA-045]
   chore(governance): update DoD validation criteria
   ```

4. All merges to `main` use squash-merge. PRs require passing CI and at least one human approval.

## Before You Push

```bash
make quality         # Lint + type-check (must pass)
make test-all        # Unit + E2E tests (must pass)
```

## Code Conventions

**TypeScript** — Strict mode, zero `any` types. Use `unknown` with type guards. Validate all external data with Zod.

**Server code** follows three-layer architecture:

- **API routes** (`src/app/api/`) — Thin handlers: parse, validate, delegate to a service, return response. Max ~20 lines.
- **Services** (`src/server/services/`) — Business logic as pure async functions. One file per domain.
- **Providers** (`src/server/`) — Infrastructure: database, MCP clients, orchestrator engine, agent registry.

**Components** follow atomic design:

- **Atoms** — Single HTML element wrappers (Button, Badge, Input)
- **Molecules** — Small compositions of atoms (StatusBadge, NavItem)
- **Organisms** — Feature-complete sections (AgentStatusTable, ApprovalCard)

**Infrastructure patterns** (see `.claude/rules/infrastructure.md`):

- Use the Prisma singleton from `@/server/db/client` — never instantiate `PrismaClient` directly.
- Use the Redis singleton from `@/server/config/redis` — never create new connections.
- Use `getEnv()` from `@/server/config/env` — never read `process.env` directly.
- Use structured loggers from `@/server/config/logger` — no `console.log`.
- Wrap external calls with `withRetry()` and `CircuitBreaker`.

## Testing

Unit tests live next to the code they test (`*.test.ts`). E2E tests live in `e2e/`.

```bash
make test-unit       # Jest unit tests (budget: <3s)
make test-e2e        # Playwright E2E tests (budget: <60s)
make test-coverage   # Jest with coverage report
make test-budgets    # Verify performance budgets
```

No skipped tests. No `console.log` in test files. All tests must clean up after themselves.

## Git Safety

These commands are **never permitted**:

- `git push --force` / `git push -f`
- `git reset --hard`
- `git clean -f`
- `git checkout .` / `git restore .`
- `git branch -D`

Use `git stash` or backup branches instead. Use `--force-with-lease` only as a coordinated last resort.
