---
paths:
  - "src/app/api/**/*.ts"
  - "src/server/**/*.ts"
---

# Rule: Service Layer Architecture — Three-Layer Separation

## Enforcement Level: MANDATORY — No Exceptions

All server-side code must follow a strict three-layer architecture. Business logic must never live in API route handlers.

---

## 1. The Three Layers

```
API Routes (src/app/api/)         → HTTP contract: parse, validate, delegate, respond
    ↓
Services (src/server/services/)   → Business logic: orchestrate, transform, enforce rules
    ↓
Providers (src/server/)           → Infrastructure: MCP clients, orchestrator engine, agent registry
```

### Layer 1: API Routes

API routes in `src/app/api/` are thin request/response translators. Maximum ~20 lines. They handle:

1. Parse the request (params, body, headers)
2. Validate input with Zod (`safeParse` from `src/lib/validation.ts`)
3. Delegate to a service function
4. Map the service result to `ApiResponse<T>` (from `src/types/api-responses.ts`)
5. Return `NextResponse` with appropriate status code

```typescript
// RIGHT — thin route handler
export async function GET(): Promise<NextResponse> {
  const statuses = await agentService.getAllStatuses();
  return NextResponse.json(successResponse(statuses));
}

// WRONG — business logic in route handler
export async function GET(): Promise<NextResponse> {
  const registry = new AgentRegistry();
  const agents = registry.getAllAgents();
  const statuses = agents.map(a => ({ id: a.id, status: registry.getStatus(a.id) }));
  return NextResponse.json(successResponse(statuses));
}
```

### Layer 2: Services

Services live in `src/server/services/` as pure async functions (not classes). One file per domain:

| File | Domain | Depends On |
|------|--------|------------|
| `agent.service.ts` | Agent status, registry queries | AgentRegistry |
| `approval.service.ts` | Approval listing, approval actions | OrchestratorEngine, SlackMCPClient |
| `pipeline.service.ts` | Epic listing, state queries | OrchestratorEngine |
| `webhook.service.ts` | Webhook event processing | OrchestratorEngine, JiraMCPClient |

Services compose providers and orchestrator calls. They contain all business logic, validation beyond schema, and domain rules.

### Layer 3: Providers (Infrastructure)

The `OrchestratorEngine`, `AgentRegistry`, `MessageBus`, `JiraMCPClient`, and `SlackMCPClient` are infrastructure that services consume. They live in their existing locations under `src/server/`.

## 2. ServerContext Singleton

All providers must be instantiated once and accessed via a `ServerContext` (to be created at `src/server/context.ts`):

```typescript
// src/server/context.ts
export interface ServerContext {
  readonly engine: OrchestratorEngine;
  readonly registry: AgentRegistry;
  readonly messageBus: MessageBus;
  readonly jiraClient: JiraMCPClient;
  readonly slackClient: SlackMCPClient;
}

let _context: ServerContext | undefined;

export function getServerContext(): ServerContext {
  if (!_context) {
    _context = createServerContext();
  }
  return _context;
}
```

Services receive context as needed. API routes call `getServerContext()` and pass to services.

## 3. Anti-Patterns

| Pattern | Status | Alternative |
|---------|--------|-------------|
| Business logic in API route handlers | **FORBIDDEN** | Move to service function |
| Direct MCP client usage from routes | **FORBIDDEN** | Call a service that uses the client |
| `new OrchestratorEngine()` in route handlers | **FORBIDDEN** | Use `getServerContext()` |
| Circular imports between services | **FORBIDDEN** | Extract shared logic to a utility |
| Services importing from `src/app/api/` | **FORBIDDEN** | Services never depend on routes |
| God service (one file with all logic) | **FORBIDDEN** | One service file per domain |

## Applicability

- **Primary agent:** @node-backend (implements services and context)
- **Supporting agent:** @next-ux (Server Components may call services directly for same-process data fetching)
- **Reference:** `src/types/api-responses.ts` for response envelope pattern, `src/lib/validation.ts` for Zod helpers
