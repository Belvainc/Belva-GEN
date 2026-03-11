---
paths:
  - "src/components/**"
  - "src/app/dashboard/**/*.tsx"
---

# Rule: Component Architecture — Atomic Design with Tailwind v4

## Enforcement Level: MANDATORY — No Exceptions

All UI code must follow atomic design principles with semantic Tailwind design tokens.

---

## 1. Atomic Design Hierarchy

All reusable UI components live under `src/components/` organized by atomic level:

| Level | Directory | Definition | Examples |
|-------|-----------|------------|----------|
| **Atoms** | `src/components/atoms/` | Single-purpose, zero-dependency UI primitives. One HTML element wrapper. | Button, Badge, Input, Text, Spinner, Avatar, Icon |
| **Molecules** | `src/components/molecules/` | Compositions of 2-4 atoms forming a single conceptual unit. No data fetching — props only. | StatusBadge, NavItem, FormField, StatCard |
| **Organisms** | `src/components/organisms/` | Feature-complete sections composed of molecules and atoms. May fetch data. May be Client Components. | AgentStatusTable, ApprovalCard, PipelineColumn, DashboardSidebar |
| **Templates** | N/A | Not a separate directory — Next.js `layout.tsx` files serve this role. | `src/app/dashboard/layout.tsx` |

## 2. File Structure Convention

Each component gets its own directory:

```
src/components/atoms/Button/
  index.ts          # re-export: export { Button } from './Button'
  Button.tsx        # component implementation
  Button.test.tsx   # co-located test
  Button.types.ts   # props interface (if complex, otherwise inline)
```

Barrel exports at each level:
- `src/components/atoms/index.ts`
- `src/components/molecules/index.ts`
- `src/components/organisms/index.ts`
- `src/components/index.ts` (top-level, re-exports all levels)

## 3. Server vs Client Components

**Default: Server Component.** Do NOT add `"use client"` unless the component:

1. Uses `useState`, `useReducer`, `useEffect`, or `useRef` with DOM access
2. Uses browser-only APIs (`window`, `document`, `IntersectionObserver`)
3. Attaches event handlers (`onClick`, `onChange`, `onSubmit`)

**Boundary placement:** Mark the `"use client"` boundary at the organism level when possible. Keep atoms and molecules as Server Components. This minimizes the JS bundle shipped to the browser.

## 4. Tailwind Design Tokens

**All styling must use semantic token classes — never raw color values.**

- **RIGHT:** `bg-surface`, `text-primary`, `border-border`, `text-status-error`
- **WRONG:** `bg-gray-50`, `text-gray-900`, `border-gray-200`, `text-red-500`

Semantic tokens are defined in `src/app/globals.css` via `@theme inline` and CSS custom properties. When a new semantic concept is needed, add the token to `globals.css` first — do not use raw colors as a shortcut.

## 5. Props and Typing

- All component props must have an explicit interface: `{ComponentName}Props`
- Use `ComponentPropsWithoutRef<"element">` for HTML element pass-through
- All props explicitly typed per `ts-strict-mode.md` — no `any`, no implicit types
- Use JSDoc on props that aren't self-evident

```typescript
import { type ComponentPropsWithoutRef } from "react";

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** Visual variant */
  variant?: "primary" | "secondary" | "danger";
  /** Render a loading spinner and disable interaction */
  loading?: boolean;
}
```

## 6. Anti-Patterns

| Pattern | Status | Alternative |
|---------|--------|-------------|
| Inline Tailwind class strings in page files | **FORBIDDEN** | Extract to component atoms/molecules |
| Prop drilling beyond 2 levels | **FORBIDDEN** | Use composition pattern or React context |
| `<div>` soup without semantic HTML | **FORBIDDEN** | Use `<section>`, `<article>`, `<nav>`, `<header>`, `<main>`, `<aside>` |
| Duplicating card/badge/button markup | **FORBIDDEN** | Extract to atom, import everywhere |
| Raw color classes (`bg-gray-50`) | **FORBIDDEN** | Use semantic tokens (`bg-surface`) |
| `<img>` tags | **FORBIDDEN** | Use `next/image` |

## Applicability

- **Primary agent:** @next-ux (owns `src/components/` and `src/app/dashboard/`)
- **Supporting agent:** @ts-testing (validates component tests include accessibility assertions)
- **Skill reference:** `.github/skills/component-scaffolding/SKILL.md` for step-by-step creation workflow
