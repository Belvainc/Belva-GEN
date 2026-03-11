---
paths:
  - "src/server/**/*.ts"
  - "src/app/api/**/*.ts"
---

# Rule: Async & Concurrency Patterns

## Enforcement Level: MANDATORY — No Exceptions

All server-side code must follow async-first patterns with proper error propagation and cancellation support.

---

## 1. Async-First

All I/O operations must use native `async/await`:

- **RIGHT:** `const ticket = await jiraClient.getTicket(key);`
- **WRONG:** `jiraClient.getTicket(key).then(ticket => { ... })`
- **WRONG:** `new Promise((resolve) => someCallback(resolve))`

Use `util.promisify` or native async alternatives for any remaining callback-based APIs.

## 2. Error Propagation

Async functions in API routes must catch errors and return typed responses:

```typescript
export async function GET(): Promise<NextResponse> {
  try {
    const data = await someService.getData();
    return NextResponse.json(successResponse(data));
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(errorResponse(error.code, error.message), { status: 400 });
    }
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "Internal server error"), { status: 500 });
  }
}
```

Use the custom error classes from `src/lib/errors.ts`:
- `ValidationError` — invalid input, schema failures
- `GateFailedError` — DoR/DoD gate violations
- `TimeoutError` — operation exceeded time limit
- `AgentCommunicationError` — inter-agent message failures

Never let unhandled promise rejections escape route handlers.

## 3. Concurrent Operations

| Pattern | When to Use |
|---------|-------------|
| `Promise.allSettled()` | Fan-out where individual failures should not block others. **Required for MCP calls.** |
| `Promise.all()` | All operations must succeed for the result to be valid |
| Sequential `await` | Operations depend on each other's results |

The message bus already uses `Promise.allSettled()` correctly in `src/server/agents/message-bus.ts` — follow this pattern for all fan-out operations.

**FORBIDDEN:** `Promise.all()` with MCP client calls — external services fail independently.

## 4. AbortController and Timeouts

Long-running operations must accept an `AbortSignal`:

```typescript
async function executeTask(task: TaskAssignment, signal?: AbortSignal): Promise<TaskCompletion> {
  signal?.throwIfAborted();
  // ... work ...
}
```

The `OrchestratorConfig.approvalTimeoutMs` (defined in `src/server/orchestrator/types.ts`) must be enforced via `AbortController.timeout()` or equivalent.

## 5. React Concurrent Features

| Context | Pattern |
|---------|---------|
| Server Components | Use `async` function directly — `export default async function Page()` |
| Client Components | Use React 19 `use()` hook to resolve promises passed as props |
| Suspense | Wrap async data sections in `<Suspense fallback={<Skeleton />}>` |
| Loading states | Use `loading.tsx` convention in every dashboard route directory |

**FORBIDDEN:** `useEffect` + `useState` + `fetch()` pattern in Client Components. Use `use()` or a data-fetching library instead.

## 6. Anti-Patterns

| Pattern | Status | Alternative |
|---------|--------|-------------|
| `setTimeout`/`setInterval` for async delays | **FORBIDDEN** | `AbortController.timeout()` |
| Fire-and-forget promises (no `await`, no `.catch()`) | **FORBIDDEN** | Always `await` or handle errors |
| Sync wrappers around async operations | **FORBIDDEN** | Keep the entire chain async |
| CPU-intensive work in API route handlers | **FORBIDDEN** | Offload to worker or background task |
| `.then()` chains | **FORBIDDEN** | Use `await` |
| `new Promise()` wrapping callback APIs | **FORBIDDEN** | Use `util.promisify` or native async |

## Applicability

- **Primary agent:** @node-backend (server-side async patterns)
- **Supporting agent:** @next-ux (React concurrent features, Suspense, `use()`)
- **All agents:** Must follow async-first when writing any server-side code
