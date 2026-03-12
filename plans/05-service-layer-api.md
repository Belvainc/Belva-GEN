# Plan 05: Service Layer & API Foundation

## Overview

Create the service layer that connects API routes to the orchestrator, agents, and MCP clients. This plan implements the three-layer architecture mandated by `.claude/rules/service-layer.md`: thin API routes delegate to services, which compose providers. Also creates the `ServerContext` singleton for dependency injection.

## Prerequisites

- Infrastructure running (PostgreSQL + Redis)
- Orchestrator engine implemented (Plan 04) with event handlers and persistence
- Agent registry exists (`src/server/agents/registry.ts`)
- MCP clients exist (Jira stub, Slack real+stub)

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Agent API route | `src/app/api/agents/route.ts` | Stub — returns empty array |
| Approvals API route | `src/app/api/approvals/route.ts` | Stub — returns empty array |
| Approval action route | `src/app/api/approvals/[id]/route.ts` | Stub — TODO forward to orchestrator |
| Pipeline API route | `src/app/api/pipeline/route.ts` | Stub — returns empty array |
| Jira webhook route | `src/app/api/webhooks/jira/route.ts` | Partial — validates, queues to BullMQ |
| Health route | `src/app/api/health/route.ts` | Complete — DB + Redis checks |
| Service layer dir | `src/server/services/` | Partial — only `gates/` subdirectory exists |
| ServerContext | `src/server/context.ts` | Does NOT exist |
| API response types | `src/types/api-responses.ts` | Complete — `ApiResponse<T>` envelope |
| Request context | `src/server/config/request-context.ts` | Complete — AsyncLocalStorage ready |
| Error types | `src/lib/errors.ts` | Partial — missing `NotFoundError` |
| Orchestrator engine | `src/server/orchestrator/engine.ts` | Complete — has `getEpic()`, `getAllEpics()` |
| Service layer rule | `.claude/rules/service-layer.md` | Complete — three-layer mandate |
| Async rule | `.claude/rules/async-concurrency.md` | Complete — AbortController patterns |

## Scope

### In Scope

- Create `ServerContext` singleton for dependency injection
- Add `NotFoundError` to error types
- Implement `AgentService` — agent status listing, heartbeat updates
- Implement `ApprovalService` — approval listing, approval actions
- Implement `PipelineService` — epic listing, state queries
- Implement `WebhookService` — event forwarding to orchestrator
- Wire all API routes to use services with request context
- Add `getEpicsByState()` method to OrchestratorEngine

### Out of Scope

- Dashboard data aggregation (Plan 07 — UI-specific queries)
- Real-time updates / WebSocket (future enhancement)
- Rate limiting at API layer (use existing middleware)

## Research Questions

1. **Request context propagation** — How do we pass `requestId` from middleware to services? AsyncLocalStorage? Explicit parameter? Check existing `src/server/config/request-context.ts`.
2. **Service function vs class** — The rule says "pure async functions (not classes)". Confirm this pattern and how to inject dependencies.
3. **Error mapping** — How do we map domain errors (GateFailedError, etc.) to HTTP status codes? Central error handler in route or service?
4. **Pagination** — Standard pagination parameters? Cursor-based or offset-based? Need consistent pattern across all list endpoints.

---

## Research Findings

### RQ-1: Request context propagation

**Answer:** Use AsyncLocalStorage via existing `src/server/config/request-context.ts`.

The infrastructure already exists:
- `RequestContext` interface with `requestId` and `startTime`
- `requestContext = new AsyncLocalStorage<RequestContext>()`
- `getRequestId()` helper returns `"no-request"` outside request scope
- `runWithRequestContext(ctx, fn)` runs code within a request scope

**Gap:** The middleware (`src/middleware.ts`) sets `x-request-id` header but does NOT initialize the AsyncLocalStorage. Next.js Edge middleware runs separately from Node.js API routes.

**Solution:** Each API route must:
1. Read `x-request-id` from request headers (set by middleware)
2. Call `runWithRequestContext()` wrapping the service call
3. Services can then use `getRequestId()` transparently

```typescript
// Pattern for API routes
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);
  
  return runWithRequestContext(ctx, async () => {
    const result = await someService.doWork();
    return NextResponse.json(successResponse(result));
  });
}
```

### RQ-2: Service function vs class

**Answer:** Pure async functions confirmed by `.claude/rules/service-layer.md`.

Pattern validated:
```typescript
export interface AgentServiceDeps {
  registry: AgentRegistry;
}

export async function getAllAgentStatuses(
  deps: AgentServiceDeps
): Promise<AgentStatus[]> { ... }
```

`ServerContext` provides all dependencies. Routes call `getServerContext()` and pass subset to services.

### RQ-3: Error mapping

**Answer:** Error mapping should happen in API route try/catch blocks, not services.

Existing error classes in `src/lib/errors.ts`:
- `ValidationError` (code: `VALIDATION_ERROR`) → 400
- `GateFailedError` (code: `GATE_FAILED`) → 422
- `TimeoutError` (code: `TIMEOUT`) → 504
- `AgentCommunicationError` (code: `AGENT_COMMUNICATION_ERROR`) → 502

**Gap:** Missing `NotFoundError` class — need to add.

**Pattern:** Per async-concurrency rule, catch in routes:
```typescript
try {
  const data = await service.getData(deps);
  return NextResponse.json(successResponse(data));
} catch (error) {
  if (error instanceof ValidationError) {
    return NextResponse.json(errorResponse(error.code, error.message), { status: 400 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json(errorResponse(error.code, error.message), { status: 404 });
  }
  if (error instanceof GateFailedError) {
    return NextResponse.json(errorResponse(error.code, error.message, { violations: error.violations }), { status: 422 });
  }
  return NextResponse.json(errorResponse("INTERNAL_ERROR", "Internal server error"), { status: 500 });
}
```

### RQ-4: Pagination

**Answer:** Cursor-based pagination using Prisma's native cursor support.

Prisma schema already has indexes on `createdAt` for AuditLog. Use `id` as cursor (UUID primary keys).

**Pattern:**
```typescript
export interface PaginationParams {
  cursor?: string;  // Last item ID from previous page
  limit: number;    // Max 100
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;  // null means no more pages
}

// Prisma query pattern
const items = await prisma.approval.findMany({
  where: { status: "PENDING" },
  orderBy: { createdAt: "desc" },
  take: params.limit + 1,  // Fetch one extra to detect more pages
  cursor: params.cursor ? { id: params.cursor } : undefined,
  skip: params.cursor ? 1 : 0,  // Skip cursor item itself
});

const hasMore = items.length > params.limit;
const data = hasMore ? items.slice(0, -1) : items;
const nextCursor = hasMore ? data[data.length - 1].id : null;
```

---

## Architecture Decisions

### AD-01: Services as pure functions with explicit dependencies

Services are async functions that receive dependencies explicitly. No classes, no `this`. Rationale: Easier to test, clearer contracts, follows the rule.

```typescript
// Pattern: service function with explicit deps
export async function getAgentStatuses(
  deps: { registry: AgentRegistry },
  signal?: AbortSignal
): Promise<AgentStatus[]>
```

### AD-02: ServerContext as lazy singleton

`ServerContext` initializes providers lazily on first access. One instance per process. Rationale: Avoids circular dependencies, enables testing with mock context.

### AD-03: Thin routes with try/catch error mapping

API routes catch service errors and map them to appropriate HTTP responses:
- `GateFailedError` → 422 Unprocessable Entity
- `ValidationError` → 400 Bad Request
- `NotFoundError` → 404 Not Found
- Unknown errors → 500 Internal Server Error

### AD-04: Cursor-based pagination for lists

Use cursor-based pagination with `cursor` and `limit` query params. Rationale: Stable pagination for real-time data, better performance for large datasets.

## Implementation Steps

### Step 0: Add NotFoundError to error types

**Files:** `src/lib/errors.ts` (modify)

Add `NotFoundError` class for 404 responses:

```typescript
export class NotFoundError extends Error {
  public readonly code = "NOT_FOUND" as const;

  constructor(
    message: string,
    public readonly entityType?: string,
    public readonly entityId?: string
  ) {
    super(message);
    this.name = "NotFoundError";
  }
}
```

### Step 0.5: Add getEpicsByState to OrchestratorEngine

**Files:** `src/server/orchestrator/engine.ts` (modify)

Add filtering method alongside existing `getAllEpics()`:

```typescript
getEpicsByState(state: EpicState): ReadonlyArray<EpicContext> {
  return Array.from(this.epics.values()).filter(
    (epic) => epic.currentState === state
  );
}
```

### Step 1: Create ServerContext singleton

**Files:** `src/server/context.ts` (create)

Note: OrchestratorEngine uses a two-phase initialization pattern: constructor takes config, `initialize()` takes deps.

```typescript
import { OrchestratorEngine } from './orchestrator/engine';
import { AgentRegistry } from './agents/registry';
import { MessageBus } from './agents/message-bus';
import { getJiraMCPClient } from './mcp/jira';
import { getSlackNotificationClient } from './mcp/slack';
import { getEnv } from './config/env';

export interface ServerContext {
  readonly engine: OrchestratorEngine;
  readonly registry: AgentRegistry;
  readonly messageBus: MessageBus;
}

let _context: ServerContext | undefined;
let _initialized = false;

function createServerContext(): ServerContext {
  const env = getEnv();
  const messageBus = new MessageBus();
  const registry = new AgentRegistry();
  
  const engine = new OrchestratorEngine({
    approvalTimeoutMs: env.APPROVAL_TIMEOUT_MS ?? 24 * 60 * 60 * 1000,
    maxRevisionCycles: env.MAX_REVISION_CYCLES ?? 3,
    maxConcurrentTasksPerEpic: env.MAX_CONCURRENT_TASKS ?? 3,
  });
  
  return { engine, registry, messageBus };
}

export function getServerContext(): ServerContext {
  if (_context === undefined) {
    _context = createServerContext();
  }
  return _context;
}

/**
 * Initialize engine dependencies. Call once during server startup.
 * MCP clients may use stubs in dev mode.
 */
export async function initializeServerContext(): Promise<void> {
  if (_initialized) return;
  
  const ctx = getServerContext();
  const jiraClient = getJiraMCPClient();
  const slackClient = getSlackNotificationClient();
  
  await ctx.engine.initialize({
    jiraClient,
    slackClient,
    messageBus: ctx.messageBus,
    agentRegistry: ctx.registry,
  });
  
  _initialized = true;
}

// For testing: inject mock context
export function setServerContext(context: ServerContext): void {
  _context = context;
  _initialized = true;
}

// For testing: reset context
export function resetServerContext(): void {
  _context = undefined;
  _initialized = false;
}
```

### Step 2: Create AgentService

**Files:** `src/server/services/agent.service.ts` (create)

```typescript
import type { AgentRegistry } from '../agents/registry';
import type { AgentStatus, AgentConfig } from '../agents/types';
import type { AgentId } from '@/types/agent-protocol';
import { NotFoundError } from '@/lib/errors';

export interface AgentServiceDeps {
  registry: AgentRegistry;
}

export interface AgentWithStatus {
  config: AgentConfig;
  status: AgentStatus;
}

export async function getAllAgentStatuses(
  deps: AgentServiceDeps
): Promise<AgentWithStatus[]> {
  const agents = deps.registry.getAllAgents();
  return agents.map((config) => {
    const status = deps.registry.getStatus(config.agentId);
    return {
      config,
      status: status ?? {
        agentId: config.agentId,
        status: 'offline' as const,
        currentTask: null,
        lastHeartbeat: new Date().toISOString(),
      },
    };
  });
}

export async function getAgentStatus(
  deps: AgentServiceDeps,
  agentId: AgentId
): Promise<AgentWithStatus> {
  const config = deps.registry.getAgent(agentId);
  if (config === undefined) {
    throw new NotFoundError(`Agent ${agentId} not found`, 'agent', agentId);
  }
  const status = deps.registry.getStatus(agentId);
  return {
    config,
    status: status ?? {
      agentId,
      status: 'offline' as const,
      currentTask: null,
      lastHeartbeat: new Date().toISOString(),
    },
  };
}

export async function updateAgentHeartbeat(
  deps: AgentServiceDeps,
  agentId: AgentId
): Promise<void> {
  const config = deps.registry.getAgent(agentId);
  if (config === undefined) {
    throw new NotFoundError(`Agent ${agentId} not found`, 'agent', agentId);
  }
  deps.registry.updateStatus(agentId, {
    lastHeartbeat: new Date().toISOString(),
  });
}
```

### Step 3: Create ApprovalService

**Files:** `src/server/services/approval.service.ts` (create)

Note: Events must match schemas in `src/types/events.ts`.

```typescript
import type { OrchestratorEngine } from '../orchestrator/engine';
import { prisma } from '../db/client';
import type { Approval } from '@prisma/client';
import { NotFoundError } from '@/lib/errors';
import { randomUUID } from 'crypto';

export interface ApprovalServiceDeps {
  engine: OrchestratorEngine;
}

export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
}

export async function getPendingApprovals(
  _deps: ApprovalServiceDeps,
  params: PaginationParams
): Promise<PaginatedResult<Approval>> {
  const items = await prisma.approval.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: params.limit + 1,
    cursor: params.cursor !== undefined ? { id: params.cursor } : undefined,
    skip: params.cursor !== undefined ? 1 : 0,
  });
  
  const hasMore = items.length > params.limit;
  const data = hasMore ? items.slice(0, -1) : items;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;
  
  return { data, nextCursor };
}

export async function approveRequest(
  deps: ApprovalServiceDeps,
  approvalId: string,
  userId: string,
  planHash: string,
  comment?: string
): Promise<Approval> {
  const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
  if (approval === null) {
    throw new NotFoundError('Approval not found', 'approval', approvalId);
  }

  const updated = await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: 'APPROVED',
      decidedBy: userId,
      decidedAt: new Date(),
      reason: comment,
    },
  });
  
  // Emit event to orchestrator (matches PlanApprovedEventSchema)
  await deps.engine.handleEvent({
    kind: 'plan-approved',
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef: approval.pipelineId,
    approverIdentity: userId,
    planHash,
  });
  
  return updated;
}

export async function rejectRequest(
  deps: ApprovalServiceDeps,
  approvalId: string,
  userId: string,
  reason: string
): Promise<Approval> {
  const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
  if (approval === null) {
    throw new NotFoundError('Approval not found', 'approval', approvalId);
  }
  
  const updated = await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: 'REJECTED',
      decidedBy: userId,
      decidedAt: new Date(),
      reason,
    },
  });
  
  // Emit event to orchestrator (matches PlanRejectedEventSchema)
  await deps.engine.handleEvent({
    kind: 'plan-rejected',
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef: approval.pipelineId,
    reviewerIdentity: userId,
    reason,
  });
  
  return updated;
}

export async function requestRevision(
  deps: ApprovalServiceDeps,
  approvalId: string,
  userId: string,
  feedback: string
): Promise<Approval> {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { pipeline: true },
  });
  if (approval === null) {
    throw new NotFoundError('Approval not found', 'approval', approvalId);
  }
  
  const revisionCount = (approval.pipeline?.revisionCount ?? 0) + 1;
  
  // Emit event to orchestrator (matches PlanRevisionRequestedEventSchema)
  await deps.engine.handleEvent({
    kind: 'plan-revision-requested',
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef: approval.pipelineId,
    reviewerIdentity: userId,
    feedback,
    revisionCount,
  });
  
  return approval;
}
```

### Step 4: Create PipelineService

**Files:** `src/server/services/pipeline.service.ts` (create)

Note: Uses engine methods `getAllEpics()`, `getEpicsByState()`, `getEpic()`.

```typescript
import type { OrchestratorEngine } from '../orchestrator/engine';
import type { EpicContext, EpicState } from '../orchestrator/types';
import { NotFoundError } from '@/lib/errors';

export interface PipelineServiceDeps {
  engine: OrchestratorEngine;
}

export interface EpicSummary {
  ticketRef: string;
  state: EpicState;
  progress: {
    totalTasks: number;
    completedTasks: number;
    activeTasks: number;
  };
  createdAt: string;
  updatedAt: string;
}

export async function getAllEpics(
  deps: PipelineServiceDeps
): Promise<EpicSummary[]> {
  const contexts = deps.engine.getAllEpics();
  return contexts.map(contextToSummary);
}

export async function getEpicsByState(
  deps: PipelineServiceDeps,
  state: EpicState
): Promise<EpicSummary[]> {
  const contexts = deps.engine.getEpicsByState(state);
  return contexts.map(contextToSummary);
}

export async function getEpicDetails(
  deps: PipelineServiceDeps,
  ticketRef: string
): Promise<EpicContext> {
  const context = deps.engine.getEpic(ticketRef);
  if (context === undefined) {
    throw new NotFoundError(`Epic ${ticketRef} not found`, 'epic', ticketRef);
  }
  return context;
}

function contextToSummary(context: EpicContext): EpicSummary {
  const totalTasks = context.taskGraph?.nodes.length ?? 0;
  const completedTasks = context.completedTaskIds.length;
  const activeTasks = context.activeTasks.length;
  
  return {
    ticketRef: context.ticketRef,
    state: context.currentState,
    progress: { totalTasks, completedTasks, activeTasks },
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
  };
}
```

### Step 5: Create WebhookService

**Files:** `src/server/services/webhook.service.ts` (create)

Note: Uses engine's `getEpic()` and `registerEpic()` methods.

```typescript
import type { OrchestratorEngine } from '../orchestrator/engine';
import type { JiraWebhookPayload } from '../mcp/jira/types';
import { createChildLogger } from '@/server/config/logger';

const logger = createChildLogger({ module: 'webhook-service' });

export interface WebhookServiceDeps {
  engine: OrchestratorEngine;
}

export async function handleJiraWebhook(
  deps: WebhookServiceDeps,
  payload: JiraWebhookPayload
): Promise<void> {
  const { issue, webhookEvent } = payload;
  
  // Check for GEN label
  const hasGenLabel = issue.fields?.labels?.includes('GEN') ?? false;
  
  if (!hasGenLabel) {
    logger.debug({ issueKey: issue.key }, 'Ignoring non-GEN ticket');
    return;
  }
  
  if (webhookEvent === 'jira:issue_created' || webhookEvent === 'jira:issue_updated') {
    // Check if epic already exists
    const existingContext = deps.engine.getEpic(issue.key);
    
    if (existingContext === undefined) {
      // New GEN ticket - register in orchestrator
      await deps.engine.registerEpic(issue.key);
      logger.info({ issueKey: issue.key }, 'Registered new GEN epic');
    }
  }
  
  // Handle status transitions from changelog
  if (webhookEvent === 'jira:issue_updated' && payload.changelog !== undefined) {
    const statusChange = payload.changelog.items?.find(
      (item) => item.field === 'status'
    );
    
    if (statusChange !== undefined) {
      logger.info({
        issueKey: issue.key,
        from: statusChange.fromString,
        to: statusChange.toString,
      }, 'Jira status changed');
      // Note: Status changes are handled by the orchestrator's event handlers
      // via the DoR/DoD gate evaluation flow, not directly here
    }
  }
}
```

### Step 6: Create service index files

**Files:** `src/server/services/index.ts` (modify — add exports alongside existing gates/)

```typescript
// Re-export all services
export * from './agent.service';
export * from './approval.service';
export * from './pipeline.service';
export * from './webhook.service';

// Gates are exported from their own submodule
export * from './gates';
```

### Step 7: Wire API routes to services

**Files:** `src/app/api/agents/route.ts`

Note: Include error handling and request context per research findings.

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { getServerContext } from '@/server/context';
import { getAllAgentStatuses } from '@/server/services/agent.service';
import { successResponse, errorResponse } from '@/types/api-responses';
import { 
  createRequestContext, 
  runWithRequestContext 
} from '@/server/config/request-context';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);
  
  return runWithRequestContext(ctx, async () => {
    try {
      const context = getServerContext();
      const statuses = await getAllAgentStatuses({ registry: context.registry });
      return NextResponse.json(successResponse(statuses));
    } catch (error) {
      return NextResponse.json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch agent statuses'),
        { status: 500 }
      );
    }
  });
}
```

### Step 8: Wire approvals API routes

**Files:** `src/app/api/approvals/route.ts`, `src/app/api/approvals/[id]/route.ts`

```typescript
// route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getServerContext } from '@/server/context';
import { getPendingApprovals } from '@/server/services/approval.service';
import { successResponse, errorResponse } from '@/types/api-responses';
import { 
  createRequestContext, 
  runWithRequestContext 
} from '@/server/config/request-context';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);
  
  return runWithRequestContext(ctx, async () => {
    try {
      const context = getServerContext();
      const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined;
      const limit = Math.min(
        parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10),
        100
      );
      
      const result = await getPendingApprovals(
        { engine: context.engine },
        { cursor, limit }
      );
      return NextResponse.json(successResponse(result));
    } catch (error) {
      return NextResponse.json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch approvals'),
        { status: 500 }
      );
    }
  });
}
```

### Step 9: Wire pipeline API route

**Files:** `src/app/api/pipeline/route.ts`

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { getServerContext } from '@/server/context';
import { getAllEpics, getEpicsByState } from '@/server/services/pipeline.service';
import { successResponse, errorResponse } from '@/types/api-responses';
import { EpicStateSchema } from '@/types/events';
import { 
  createRequestContext, 
  runWithRequestContext 
} from '@/server/config/request-context';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);
  
  return runWithRequestContext(ctx, async () => {
    try {
      const context = getServerContext();
      const stateParam = request.nextUrl.searchParams.get('state');
      
      if (stateParam !== null) {
        const parsed = EpicStateSchema.safeParse(stateParam);
        if (!parsed.success) {
          return NextResponse.json(
            errorResponse('VALIDATION_ERROR', `Invalid state: ${stateParam}`),
            { status: 400 }
          );
        }
        const epics = await getEpicsByState({ engine: context.engine }, parsed.data);
        return NextResponse.json(successResponse(epics));
      }
      
      const epics = await getAllEpics({ engine: context.engine });
      return NextResponse.json(successResponse(epics));
    } catch (error) {
      return NextResponse.json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch pipeline'),
        { status: 500 }
      );
    }
  });
}
```

### Step 10: Wire webhook route to service

**Files:** `src/app/api/webhooks/jira/route.ts`

Note: Webhook route is already mostly complete — just add worker integration.

The existing route already validates, queues to BullMQ. Add a worker that calls `handleJiraWebhook`:

**Files:** `src/server/workers/webhook.worker.ts` (create)

```typescript
import { Worker, type Job } from 'bullmq';
import { getRedisConnection } from '@/server/config/redis';
import { getServerContext, initializeServerContext } from '@/server/context';
import { handleJiraWebhook } from '@/server/services/webhook.service';
import { createChildLogger } from '@/server/config/logger';
import type { JiraWebhookPayload } from '@/server/mcp/jira/types';

const logger = createChildLogger({ module: 'webhook-worker' });

interface WebhookJob {
  source: 'jira';
  payload: JiraWebhookPayload;
  receivedAt: string;
}

export function createWebhookWorker(): Worker<WebhookJob> {
  return new Worker<WebhookJob>(
    'webhooks',
    async (job: Job<WebhookJob>) => {
      await initializeServerContext();
      const context = getServerContext();
      
      logger.info({ source: job.data.source, jobId: job.id }, 'Processing webhook');
      
      if (job.data.source === 'jira') {
        await handleJiraWebhook(
          { engine: context.engine },
          job.data.payload
        );
      }
    },
    { connection: getRedisConnection() }
  );
}
```

## Testing Requirements

### Unit Tests

- `__tests__/server/services/agent.service.test.ts`
  - Test `getAllAgentStatuses()` returns registry data
  - Test `updateAgentHeartbeat()` updates timestamp
- `__tests__/server/services/approval.service.test.ts`
  - Test `getPendingApprovals()` pagination
  - Test `approveRequest()` emits correct event
  - Test `rejectRequest()` emits correct event
  - Test `requestRevision()` emits correct event
- `__tests__/server/services/pipeline.service.test.ts`
  - Test `getAllEpics()` returns summaries
  - Test `getEpicsByState()` filters correctly
- `__tests__/server/services/webhook.service.test.ts`
  - Test GEN label detection
  - Test status change handling
- `__tests__/server/context.test.ts`
  - Test singleton behavior
  - Test context injection for tests

### Integration Tests

- API route → service → provider flow with mocked providers
- Request context propagation

### Budget Constraints

- Unit test suite must complete in <3 seconds
- Zero skipped tests
- 80%+ coverage on `src/server/services/`

## Acceptance Criteria

- [ ] `NotFoundError` added to `src/lib/errors.ts`
- [ ] `getEpicsByState()` method added to OrchestratorEngine
- [ ] `ServerContext` singleton provides access to engine, registry, messageBus
- [ ] `initializeServerContext()` initializes engine dependencies
- [ ] `AgentService` retrieves agent statuses from registry
- [ ] `ApprovalService` lists pending approvals with cursor pagination
- [ ] `ApprovalService` approval actions emit orchestrator events (matching event schemas)
- [ ] `PipelineService` returns epic summaries with progress
- [ ] `WebhookService` detects GEN label and registers epics
- [ ] All API routes are thin (<20 lines) and delegate to services
- [ ] No business logic in API route handlers
- [ ] All services accept explicit dependencies (no global access)
- [ ] Error mapping: domain errors → HTTP status codes (400, 404, 422, 500)
- [ ] Request context propagation via AsyncLocalStorage
- [ ] Webhook worker processes queued Jira events
- [ ] Unit tests pass within 3-second budget
- [ ] 80%+ coverage on services

## Dependencies

- **Depends on:** Plans 01, 03, 04 provide the providers that services compose
- **Blocks:** Plan 06 (Approval UI calls approval API), Plan 07 (Dashboard calls all APIs)

## Estimated Conversations

1-2 conversations: one for services + context, one for API route wiring + tests.
