# Skill: Component Scaffolding

## Purpose

Step-by-step workflow for creating new UI components following the atomic design pattern defined in `.claude/rules/component-architecture.md`.

## Trigger

When any agent needs to create a new reusable UI component.

## Workflow

### Step 1 — Classify the Atomic Level

Determine where the component belongs:

| Level | Criteria | Example |
|-------|----------|---------|
| **Atom** | Wraps a single HTML element. Zero dependencies on other custom components. | Button, Badge, Input, Text, Spinner |
| **Molecule** | Composes 2-4 atoms into a single conceptual unit. No data fetching. | StatusBadge (Badge + Text), FormField (Label + Input + ErrorText) |
| **Organism** | Feature-complete section. May compose many molecules/atoms. May fetch data or manage complex state. | AgentStatusTable, ApprovalCard, PipelineColumn |

**Decision questions:**
1. Does it compose other custom components? → If no, it's an **Atom**
2. Does it fetch data or manage complex interactive state? → If no, it's a **Molecule**
3. Otherwise → **Organism**

### Step 2 — Create Directory Structure

```bash
src/components/{level}/{ComponentName}/
  index.ts            # Re-export
  {ComponentName}.tsx  # Implementation
  {ComponentName}.test.tsx  # Co-located test
  {ComponentName}.types.ts  # Props interface (optional, for complex props)
```

### Step 3 — Define Props Interface

```typescript
import { type ComponentPropsWithoutRef } from "react";

// For HTML element wrappers (atoms)
export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}

// For composition components (molecules/organisms)
export interface StatusBadgeProps {
  status: "idle" | "busy" | "error" | "offline";
  label: string;
}
```

Requirements:
- Explicit interface named `{ComponentName}Props`
- All props explicitly typed — no `any`, no implicit types
- Use `ComponentPropsWithoutRef<"element">` for HTML pass-through on atoms
- Add JSDoc on non-obvious props

### Step 4 — Implement the Component

```typescript
import { type ButtonProps } from "./Button.types";

export function Button({ variant = "primary", loading, children, ...props }: ButtonProps): JSX.Element {
  return (
    <button
      className={`rounded-md px-4 py-2 font-medium ${variantClasses[variant]}`}
      disabled={loading || props.disabled}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}
```

Requirements:
- **Server Component by default** — no `"use client"` unless the component uses useState, event handlers, or browser APIs
- **Semantic HTML** — use the correct element, not `<div>` for everything
- **Tailwind semantic tokens** — use `bg-surface`, `text-primary`, not `bg-gray-50`, `text-gray-900`
- **Accessibility** — `aria-label` on icon-only buttons, `aria-busy` on loading states, proper roles
- **Explicit return type** — `JSX.Element` or `Promise<JSX.Element>` for async Server Components

### Step 5 — Write Tests

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("passes accessibility audit", async () => {
    const { container } = render(<Button>Click me</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows loading state", () => {
    render(<Button loading>Click me</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
});
```

Requirements:
- Query by role first (`getByRole`), then label, then text — never by test ID
- **Organism tests must include `jest-axe` assertion** — atoms/molecules recommended
- Use `userEvent` for interactions, not `fireEvent`
- Test edge cases: empty data, null props where applicable, disabled state

### Step 6 — Update Barrel Exports

```typescript
// src/components/atoms/index.ts
export { Button } from "./Button";

// src/components/index.ts
export * from "./atoms";
export * from "./molecules";
export * from "./organisms";
```

### Validation

- [ ] `make quality` passes (lint + type-check)
- [ ] `make test-unit` passes with new component tests
- [ ] Component is in the correct atomic level directory
- [ ] Props interface is explicit and documented
- [ ] Accessibility attributes present
- [ ] Tailwind uses semantic tokens only
- [ ] Barrel exports updated at level and top-level

## Agent Responsibilities

- **@next-ux** — Creates and implements components
- **@ts-testing** — Validates tests meet coverage ≥ 90% for new components
- **@orchestrator-project** — References this skill in DoD validation for frontend tasks
