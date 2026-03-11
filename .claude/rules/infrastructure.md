---
paths:
  - "src/server/**/*.ts"
  - "src/app/api/**/*.ts"
  - "prisma/**"
  - "docker-compose.yml"
---

# Rule: Infrastructure Patterns

## Enforcement Level: MANDATORY — No Exceptions

All server-side code must follow these infrastructure patterns for database access, caching, queuing, resilience, and observability.

---

## Database (Prisma + PostgreSQL)

- Use the singleton `prisma` from `@/server/db/client` — never instantiate `PrismaClient` directly
- Always wrap database queries in try/catch — translate Prisma errors to domain errors
- Use `prisma.$transaction()` for multi-table mutations that must be atomic
- Prefer `findUnique` over `findFirst` when querying by primary key
- Add `@@index` for columns used in WHERE/ORDER BY (check Prisma schema first)
- Never use raw SQL unless Prisma Client API is insufficient — and document why

## Cache (Redis via ioredis)

- Use the singleton `redis` from `@/server/config/redis` — never create new connections
- Always set TTL on cache keys — no indefinite caching
- Key naming: `{domain}:{entity}:{id}` (e.g., `agent:status:node-backend`)
- Use pipelines for multi-key operations
- Never store sensitive data (tokens, secrets) in Redis without encryption

## Job Queues (BullMQ)

- All job data must be validated with Zod schemas before enqueuing
- Define jobs in `@/server/queues/index.ts`, processors in `@/server/workers/index.ts`
- Set `attempts` and `backoff` on every queue — no infinite retries
- Use `removeOnComplete` and `removeOnFail` to prevent unbounded memory growth
- Workers must handle `SIGTERM` gracefully — finish current job, then exit

## Resilience

- All external calls (MCP, webhooks) must use `withRetry()` from `@/server/lib/retry.ts`
- MCP clients must wrap calls with `CircuitBreaker` from `@/server/lib/circuit-breaker.ts`
- All long-running operations must accept `AbortSignal`
- Never catch and silently swallow errors — log + re-throw or return typed error

## Environment Configuration

- Use `getEnv()` from `@/server/config/env.ts` — never read `process.env` directly
- All env vars must be declared in the Zod schema in `env.ts`
- Required secrets must not have defaults (except in development)
- Document all env vars in `.env.example`

## Logging

- Use structured loggers from `@/server/config/logger.ts` — no `console.log`
- Always include context: `logger.info({ agentId, ticketRef }, "message")`
- Use child loggers for scoped modules: `createChildLogger({ module: "worker" })`
- Error logs must include the error object: `logger.error({ error: err.message }, "msg")`

## Webhooks

- All inbound webhooks must verify HMAC-SHA256 signature before processing
- Use `verifyWebhookSignature()` from `@/server/lib/webhook-auth.ts`
- Enqueue webhook payloads for async processing — don't block the HTTP response
- Return 200 to the webhook sender immediately, process asynchronously via BullMQ

## Shutdown

- Call `registerShutdownHandlers()` at server startup
- Shutdown order: workers → queues → redis → prisma
- Never call `process.exit()` without draining connections first
