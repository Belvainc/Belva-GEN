# Plan 07: Dashboard UI & Component Library

## Overview

Build the complete dashboard UI with an atomic design component library. This includes all reusable components (atoms, molecules, organisms) and four dashboard pages: Overview (metrics), Agents (status table), Approvals (queue), and Pipeline (epic lifecycle). All components must be accessible (WCAG 2.1 AA) and performant (Core Web Vitals targets).

## Prerequisites

- Plan 05 complete: API endpoints returning real data
- Plan 06 complete: Approval flow UI (ApprovalCard organism)
- Tailwind CSS v4 configured with semantic tokens
- React 19 + Next.js 16 App Router

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Dashboard overview | `src/app/dashboard/page.tsx` | Skeleton — 4 placeholder cards |
| Dashboard layout | `src/app/dashboard/layout.tsx` | Basic layout shell |
| Agents page | `src/app/dashboard/agents/page.tsx` | Empty |
| Approvals page | `src/app/dashboard/approvals/page.tsx` | Plan 06 builds this |
| Pipeline page | `src/app/dashboard/pipeline/page.tsx` | Empty |
| Atoms directory | `src/components/atoms/` | Empty |
| Molecules directory | `src/components/molecules/` | Empty |
| Organisms directory | `src/components/organisms/` | ApprovalCard from Plan 06 |
| Global styles | `src/app/globals.css` | Tailwind + semantic tokens |
| Component rule | `.claude/rules/component-architecture.md` | Complete |
| Accessibility rule | `.claude/rules/accessibility.md` | Complete |
| Performance rule | `.claude/rules/frontend-performance.md` | Complete |
| Data fetching rule | `.claude/rules/data-fetching.md` | Complete |

## Scope

### In Scope

- Atomic component library: 6 atoms, 4 molecules, 4 organisms
- Dashboard pages: Overview, Agents, Approvals (enhance from Plan 06), Pipeline
- Loading states (`loading.tsx`) and error states (`error.tsx`) for each route
- Server Components for data fetching, Client Components only for interactivity
- WCAG 2.1 AA accessibility compliance
- Core Web Vitals performance targets
- jest-axe accessibility tests for all components

### Out of Scope

- Real-time WebSocket updates (future enhancement)
- Dark mode toggle (use system preference only)
- Mobile-responsive layouts (desktop-first for VPN-protected internal tool)
- Complex data visualizations (charts, graphs — future enhancement)

## Research Questions

1. **Semantic tokens** — What tokens are already defined in `globals.css`? Need to verify: `bg-surface`, `text-primary`, `border-border`, `text-status-*`.
2. **Design system** — Is there an existing design system or Figma file to reference? If not, use sensible defaults.
3. **Icon library** — What icon library should we use? Lucide? Heroicons? Or inline SVG?
4. **Table component** — Use native HTML table with semantic markup, or a headless UI library like @tanstack/table?

## Architecture Decisions

### AD-01: Server Components by default

All components are Server Components unless they require interactivity. Client Component boundaries are placed at the organism level. Rationale: Minimize JS bundle, maximize server-side rendering.

### AD-02: Streaming with Suspense

Use React Suspense with streaming for data-fetching boundaries. Each page wraps data fetches in Suspense with skeleton fallbacks. Rationale: Fast initial paint, progressive data loading.

### AD-03: Semantic Tailwind tokens only

All styling uses semantic tokens (`bg-surface`, `text-primary`). No raw color classes (`bg-gray-50`). Rationale: Consistent theming, accessible color contrast guaranteed at token level.

### AD-04: Co-located tests

Each component has a `.test.tsx` file in the same directory. All tests include jest-axe accessibility assertions. Rationale: Easy to maintain, ensures accessibility is tested.

## Component Inventory

### Atoms (6 components)

| Component | Props | Notes |
|-----------|-------|-------|
| `Button` | `variant`, `size`, `loading`, `disabled` | Primary, secondary, danger variants |
| `Badge` | `variant`, `children` | Success, warning, error, info variants |
| `Input` | HTML input props + `error` | Text input with error state |
| `Text` | `as`, `variant`, `children` | Typography component (h1-h6, p, span) |
| `Spinner` | `size` | Loading indicator |
| `Avatar` | `src`, `alt`, `fallback`, `size` | User avatar with fallback initials |

### Molecules (4 components)

| Component | Composed Of | Notes |
|-----------|-------------|-------|
| `StatusBadge` | Badge | Maps status enum to badge variant + label |
| `NavItem` | Text, optional Badge | Dashboard navigation item with active state |
| `FormField` | Input, Text | Label + input + error message |
| `StatCard` | Text, Spinner | Metric card with label, value, optional loading |

### Organisms (4 components)

| Component | Composed Of | Notes |
|-----------|-------------|-------|
| `DashboardSidebar` | NavItem | Vertical navigation for dashboard |
| `AgentStatusTable` | Badge, StatusBadge | Table of agents with status, task, heartbeat |
| `ApprovalCard` | Badge, Button, Text | Plan 06 builds this; enhance here |
| `PipelineColumn` | Badge, Text | Kanban column for epic lifecycle stage |

## Implementation Steps

### Step 1: Set up component file structure

**Files:** Create directory structure

```
src/components/
  atoms/
    Button/
      index.ts
      Button.tsx
      Button.test.tsx
    Badge/
    Input/
    Text/
    Spinner/
    Avatar/
  molecules/
    StatusBadge/
    NavItem/
    FormField/
    StatCard/
  organisms/
    DashboardSidebar/
    AgentStatusTable/
    ApprovalCard/       # Already exists from Plan 06
    PipelineColumn/
  index.ts              # Barrel export
```

### Step 2: Implement Button atom

**Files:** `src/components/atoms/Button/Button.tsx`

```typescript
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { Spinner } from '../Spinner';
import { cn } from '@/lib/utils';

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** Visual variant */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show loading spinner and disable */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'md', loading, disabled, className, children, ...props },
    ref
  ) {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none';
    
    const variants = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      danger: 'bg-status-error text-white hover:bg-status-error/90',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
    };
    
    const sizes = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4',
      lg: 'h-12 px-6 text-lg',
    };
    
    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner size="sm" className="mr-2" />}
        {children}
      </button>
    );
  }
);
```

### Step 3: Implement Badge atom

**Files:** `src/components/atoms/Badge/Badge.tsx`

```typescript
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  const variants = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-status-success/10 text-status-success',
    warning: 'bg-status-warning/10 text-status-warning',
    error: 'bg-status-error/10 text-status-error',
    info: 'bg-status-info/10 text-status-info',
  };
  
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
```

### Step 4: Implement remaining atoms

**Files:** `src/components/atoms/Input/`, `Text/`, `Spinner/`, `Avatar/`

Follow the same pattern:
- Explicit props interface
- Semantic Tailwind classes only
- Forward ref where appropriate
- ARIA attributes for accessibility

### Step 5: Implement StatusBadge molecule

**Files:** `src/components/molecules/StatusBadge/StatusBadge.tsx`

```typescript
import { Badge } from '@/components/atoms/Badge';

type Status = 'idle' | 'busy' | 'offline' | 'error';

interface StatusBadgeProps {
  status: Status;
}

const statusConfig: Record<Status, { variant: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
  idle: { variant: 'success', label: 'Idle' },
  busy: { variant: 'warning', label: 'Busy' },
  offline: { variant: 'default', label: 'Offline' },
  error: { variant: 'error', label: 'Error' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

### Step 6: Implement DashboardSidebar organism

**Files:** `src/components/organisms/DashboardSidebar/DashboardSidebar.tsx`

```typescript
import Link from 'next/link';
import { NavItem } from '@/components/molecules/NavItem';

interface DashboardSidebarProps {
  currentPath: string;
}

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: 'home' },
  { href: '/dashboard/agents', label: 'Agents', icon: 'bot' },
  { href: '/dashboard/approvals', label: 'Approvals', icon: 'check-circle' },
  { href: '/dashboard/pipeline', label: 'Pipeline', icon: 'git-branch' },
];

export function DashboardSidebar({ currentPath }: DashboardSidebarProps) {
  return (
    <nav aria-label="Dashboard navigation" className="w-64 bg-surface border-r border-border p-4">
      <ul className="space-y-1" role="list">
        {navItems.map(item => (
          <li key={item.href}>
            <Link href={item.href}>
              <NavItem
                label={item.label}
                icon={item.icon}
                isActive={currentPath === item.href}
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

### Step 7: Implement AgentStatusTable organism

**Files:** `src/components/organisms/AgentStatusTable/AgentStatusTable.tsx`

```typescript
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { Avatar } from '@/components/atoms/Avatar';
import type { AgentStatus } from '@/server/agents/types';

interface AgentStatusTableProps {
  agents: AgentStatus[];
}

export function AgentStatusTable({ agents }: AgentStatusTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="text-left p-3 font-medium">Agent</th>
            <th scope="col" className="text-left p-3 font-medium">Status</th>
            <th scope="col" className="text-left p-3 font-medium">Current Task</th>
            <th scope="col" className="text-left p-3 font-medium">Last Heartbeat</th>
          </tr>
        </thead>
        <tbody>
          {agents.map(agent => (
            <tr key={agent.agentId} className="border-b border-border hover:bg-muted/50">
              <td className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar fallback={agent.agentId.slice(0, 2).toUpperCase()} size="sm" />
                  <span className="font-medium">{agent.agentId}</span>
                </div>
              </td>
              <td className="p-3">
                <StatusBadge status={agent.status} />
              </td>
              <td className="p-3 text-muted-foreground">
                {agent.currentTask ?? '—'}
              </td>
              <td className="p-3 text-sm text-muted-foreground">
                {new Date(agent.lastHeartbeat).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Step 8: Implement PipelineColumn organism

**Files:** `src/components/organisms/PipelineColumn/PipelineColumn.tsx`

```typescript
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import type { EpicSummary } from '@/server/services/pipeline.service';

interface PipelineColumnProps {
  stage: string;
  epics: EpicSummary[];
}

export function PipelineColumn({ stage, epics }: PipelineColumnProps) {
  return (
    <section className="flex-1 min-w-[280px] bg-surface border border-border rounded-lg p-4">
      <header className="flex justify-between items-center mb-4">
        <Text as="h3" variant="h4">{stage}</Text>
        <Badge>{epics.length}</Badge>
      </header>
      
      <ul className="space-y-3" role="list">
        {epics.map(epic => (
          <li key={epic.ticketRef}>
            <article className="bg-background border border-border rounded-md p-3">
              <Text as="h4" variant="body" className="font-medium mb-1">
                {epic.ticketRef}
              </Text>
              <Text variant="small" className="text-muted-foreground mb-2">
                {epic.title}
              </Text>
              <div className="flex justify-between text-xs">
                <span>{epic.progress.completedTasks}/{epic.progress.totalTasks} tasks</span>
                <span className="text-muted-foreground">
                  {epic.progress.activeTasks} active
                </span>
              </div>
            </article>
          </li>
        ))}
        {epics.length === 0 && (
          <li className="text-center text-muted-foreground py-4">
            No epics in this stage
          </li>
        )}
      </ul>
    </section>
  );
}
```

### Step 9: Update dashboard layout

**Files:** `src/app/dashboard/layout.tsx`

```typescript
import { DashboardSidebar } from '@/components/organisms/DashboardSidebar';
import { headers } from 'next/headers';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/dashboard';
  
  return (
    <div className="flex min-h-screen">
      <DashboardSidebar currentPath={pathname} />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

### Step 10: Build dashboard pages

**Files:** Update all dashboard pages

**Overview page** (`src/app/dashboard/page.tsx`):
- 4 StatCard components: Active Epics, Pending Approvals, Agents Online, Tasks Today
- Fetch data from API endpoints

**Agents page** (`src/app/dashboard/agents/page.tsx`):
- AgentStatusTable with data from `/api/agents`
- Loading state with skeleton table

**Pipeline page** (`src/app/dashboard/pipeline/page.tsx`):
- 6 PipelineColumn components (one per lifecycle stage)
- Horizontal scroll for Kanban layout
- Fetch epics grouped by state

### Step 11: Add loading and error states

**Files:** Create `loading.tsx` and `error.tsx` for each dashboard route

```typescript
// src/app/dashboard/agents/loading.tsx
export default function AgentsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-muted rounded w-48" />
      <div className="h-64 bg-muted rounded" />
    </div>
  );
}

// src/app/dashboard/agents/error.tsx
'use client';

export default function AgentsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="text-center py-8">
      <p className="text-status-error mb-4">Failed to load agents: {error.message}</p>
      <button onClick={reset} className="text-primary underline">
        Try again
      </button>
    </div>
  );
}
```

### Step 12: Create barrel exports

**Files:** `src/components/index.ts`, `src/components/atoms/index.ts`, etc.

```typescript
// src/components/atoms/index.ts
export { Button } from './Button';
export { Badge } from './Badge';
export { Input } from './Input';
export { Text } from './Text';
export { Spinner } from './Spinner';
export { Avatar } from './Avatar';

// src/components/index.ts
export * from './atoms';
export * from './molecules';
export * from './organisms';
```

## Testing Requirements

### Unit Tests (per component)

Each component must have a test file that:
1. Renders without crashing
2. Renders all variants correctly
3. Passes jest-axe accessibility check
4. Handles edge cases (empty data, loading states)

Example test:

```typescript
// src/components/atoms/Button/Button.test.tsx
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Button } from './Button';

expect.extend(toHaveNoViolations);

describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });
  
  it('shows spinner when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
  
  it('has no accessibility violations', async () => {
    const { container } = render(<Button>Accessible</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

### E2E Tests

- `e2e/dashboard-overview.spec.ts` — View metrics, navigate between pages
- `e2e/dashboard-agents.spec.ts` — View agent table, verify data loads
- `e2e/dashboard-pipeline.spec.ts` — View Kanban, verify epics display

### Budget Constraints

- Unit tests <3 seconds total
- E2E tests <60 seconds total
- Individual E2E scenario <10 seconds
- Lighthouse Performance score >90

## Acceptance Criteria

- [ ] All 6 atoms implemented with props interface and tests
- [ ] All 4 molecules implemented and tested
- [ ] All 4 organisms implemented and tested
- [ ] Dashboard Overview shows live metrics from API
- [ ] Dashboard Agents shows agent status table
- [ ] Dashboard Approvals shows pending approvals (from Plan 06)
- [ ] Dashboard Pipeline shows Kanban with 6 columns
- [ ] All routes have loading.tsx skeleton states
- [ ] All routes have error.tsx error boundaries
- [ ] All components pass jest-axe accessibility tests
- [ ] Server Components used by default; Client Components only for interactivity
- [ ] No raw Tailwind color classes (only semantic tokens)
- [ ] Keyboard navigation works on all interactive elements
- [ ] Focus management is correct (visible focus ring)
- [ ] E2E tests pass within 60-second budget
- [ ] Lighthouse Performance >90

## Dependencies

- **Depends on:** Plan 05 (API endpoints), Plan 06 (ApprovalCard organism)
- **Blocks:** Plan 10 (Feature/Epic pipelines use pipeline view for monitoring)

## Estimated Conversations

3-4 conversations: one for atoms, one for molecules + organisms, one for dashboard pages, one for testing + accessibility polish.
