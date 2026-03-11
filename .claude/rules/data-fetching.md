---
paths:
  - "src/app/dashboard/**/*.tsx"
  - "src/components/organisms/**/*.tsx"
---

# Rule: Data Fetching — Server-First with Proper Caching

## Enforcement Level: MANDATORY — No Exceptions

All data fetching must follow Server Components-first patterns with explicit caching and proper loading/error states.

---

## 1. Server Components First

All dashboard pages are Server Components by default. Data fetching happens at the page level:

```typescript
// RIGHT — Server Component with direct service call
export default async function AgentsPage(): Promise<JSX.Element> {
  const statuses = await agentService.getAllStatuses();
  return <AgentStatusTable agents={statuses} />;
}

// WRONG — Client Component with useEffect fetch
"use client";
export default function AgentsPage(): JSX.Element {
  const [agents, setAgents] = useState([]);
  useEffect(() => { fetch('/api/agents').then(...) }, []);
  return <AgentStatusTable agents={agents} />;
}
```

Server Components call service functions directly via `ServerContext` (from `src/server/context.ts`) — no HTTP round-trip needed for same-process data.

## 2. Client Component Data Patterns

When a Client Component needs data (e.g., the approvals page polling for updates):

**Option A — Promise prop from Server Component parent (preferred):**
```typescript
// Server Component parent
export default async function ApprovalsPage(): Promise<JSX.Element> {
  const approvalsPromise = approvalService.getPending();
  return <ApprovalsClient initialData={approvalsPromise} />;
}

// Client Component child
"use client";
import { use } from "react";
function ApprovalsClient({ initialData }: { initialData: Promise<Approval[]> }): JSX.Element {
  const approvals = use(initialData);
  // ... interactive UI
}
```

**Option B — Custom `useFetch` hook for polling/refresh:**
```typescript
const { data, error, isLoading, refetch } = useFetch<Approval[]>('/api/approvals');
```

**FORBIDDEN:** Bare `fetch` inside `useEffect` without error handling, loading state, or cleanup.

## 3. Caching Strategy

| Data Type | Cache Setting | Rationale |
|-----------|---------------|-----------|
| Agent statuses | `revalidate: 30` | Changes every ~30 seconds |
| Pipeline state | `revalidate: 30` | Epic transitions are infrequent |
| Approval data | `cache: 'no-store'` | Security-sensitive, must be real-time |
| Static config | `force-cache` (default) | Rarely changes |

Use `revalidatePath()` or `revalidateTag()` in API route mutation handlers to invalidate stale cache after state changes.

## 4. Loading States

**Every page directory must include `loading.tsx`:**

```typescript
// src/app/dashboard/agents/loading.tsx
export default function AgentsLoading(): JSX.Element {
  return (
    <section aria-busy="true" role="status" aria-label="Loading agents">
      {/* Skeleton matching AgentStatusTable dimensions */}
    </section>
  );
}
```

Requirements:
- Skeleton must match the layout and dimensions of the content it replaces (prevents CLS)
- Use `aria-busy="true"` and `role="status"` for accessibility
- Every `<Suspense>` boundary inside pages must have a dimensional fallback

## 5. Error States

**Every page directory must include `error.tsx`:**

```typescript
// src/app/dashboard/agents/error.tsx
"use client";

export default function AgentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <section role="alert">
      <h2>Failed to load agents</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
```

The root dashboard layout (`src/app/dashboard/layout.tsx`) must include a top-level error boundary for unhandled errors.

## 6. Anti-Patterns

| Pattern | Status | Alternative |
|---------|--------|-------------|
| `useEffect` + `useState` + `fetch()` | **FORBIDDEN** | Use Server Component, `use()` hook, or data-fetching library |
| Bare `fetch` without error handling | **FORBIDDEN** | Always handle loading/error/empty states |
| Missing `loading.tsx` in page directory | **FORBIDDEN** | Add skeleton loading component |
| Missing `error.tsx` in page directory | **FORBIDDEN** | Add error boundary component |
| Fetching in atoms or molecules | **FORBIDDEN** | Data fetching at page or organism level only |
| Hardcoded placeholder data in pages | **FORBIDDEN** | Fetch from service or show empty state |

## Applicability

- **Primary agent:** @next-ux (implements data fetching in pages and organisms)
- **Supporting agent:** @node-backend (builds services and API routes that pages consume)
- **Reference:** `.claude/rules/service-layer.md` for service function patterns, `.claude/rules/async-concurrency.md` for async patterns
