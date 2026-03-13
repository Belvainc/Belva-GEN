# Belva-GEN — Project Constraints

These constraints apply to ALL agents working on this project.

## Inviolable Rules

1. **Zero `any` types** — use `unknown` + type guards. Validate external data with Zod.
2. **Squash-merge only** — no force push, no `reset --hard`, no `checkout .`
3. **Human approval required** — no auto-merge, no timeout-to-approve
4. **MCP safety** — never re-submit full content for metadata-only operations
5. **Structured logging** — Pino with request context, no `console.log`
6. **Zod at boundaries** — all API inputs, webhook payloads, queue jobs, and agent messages validated

## Code Patterns

- Three-layer architecture: route handler → service → repository
- ServerContext singleton for infrastructure access
- `getEnv()` for environment config (never `process.env` directly)
- `CircuitBreaker` + `withRetry` for external calls
- `AbortSignal` for all async operations
- `Promise.allSettled` for fan-out MCP calls

## Testing

- Unit suite < 3 seconds, E2E suite < 60 seconds
- Zero skipped tests
- Every service function needs happy-path + error-path tests

## Git

- Branch naming: `feature/BELVA-XXX-description` or `fix/BELVA-XXX-description`
- Commit format: `type(scope): description [BELVA-XXX]`
- Types: feat, fix, chore, test, docs, refactor
- Scopes: orchestrator, backend, frontend, testing, governance
