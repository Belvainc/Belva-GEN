---
paths:
  - "src/components/**/*.tsx"
  - "src/app/dashboard/**/*.tsx"
---

# Rule: Accessibility — WCAG 2.1 AA Compliance

## Enforcement Level: MANDATORY — No Exceptions

All dashboard UI must meet WCAG 2.1 Level AA. This is a gate criterion, not aspirational.

---

## 1. Semantic HTML

Use the correct HTML elements — not `<div>` with click handlers:

| Need | Correct Element | Wrong |
|------|----------------|-------|
| Clickable action | `<button>` | `<div onClick>`, `<span onClick>` |
| Navigation link | `<a href>` or Next.js `<Link>` | `<div onClick={() => router.push()}>` |
| Tabular data | `<table>` with `<thead>`, `<tbody>`, `<th>` | Nested `<div>` grids |
| Navigation block | `<nav>` | `<div className="nav">` |
| Primary content | `<main>` | `<div className="content">` |
| Sidebar | `<aside>` | `<div className="sidebar">` |
| Form input | `<input>` with `<label htmlFor>` | `<input>` without label association |

## 2. ARIA Requirements

- All interactive elements must have accessible names (visible text, `aria-label`, or `aria-labelledby`)
- Use `aria-live="polite"` for dynamic content updates (agent status changes, approval count changes, pipeline state transitions)
- Use `role="status"` for loading indicators and spinners
- Use `aria-busy="true"` on containers while data loads
- Use `aria-expanded` on collapsible sections and dropdowns
- Use `aria-current="page"` on the active navigation item

## 3. Keyboard Navigation

- All interactive elements must be reachable via Tab key
- Focus order must match visual reading order (left-to-right, top-to-bottom)
- Custom interactive components must support Enter and Space activation
- Focus must be visible: use `focus-visible:ring-2 focus-visible:ring-offset-2` pattern
- **Skip link:** Add a "Skip to main content" link as the first focusable element in the root dashboard layout
- Escape key must close modals and dropdowns
- Arrow keys must navigate within composite widgets (tabs, menus)

## 4. Color and Contrast

- All text must have minimum **4.5:1** contrast ratio against its background
- Large text (18px+ or 14px+ bold) requires **3:1** minimum
- Status indicators must **never rely on color alone** — always include a text label or icon
  - **RIGHT:** Green badge with text "Idle" + check icon
  - **WRONG:** Green dot with no text
- Interactive elements must have visible focus and hover states that are not color-only

## 5. Images and Media

- All `<img>` / `next/image` must have `alt` text (descriptive for informational, `alt=""` for decorative)
- Icons used as sole content of a button must have `aria-label` on the button
- No auto-playing media
- Respect `prefers-reduced-motion` for animations: use Tailwind's `motion-reduce:` modifier

## 6. Testing Requirements

- **jest-axe:** All organism-level component tests must include:
  ```typescript
  const { container } = render(<Component />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
  ```
- **Testing Library queries:** Use `getByRole` first, then `getByLabelText`, then `getByText` — never `getByTestId` unless no semantic alternative exists
- **E2E tests:** Validate keyboard Tab order on the approvals page (critical interactive flow)

## Applicability

- **Primary agent:** @next-ux (implements accessible components)
- **Supporting agent:** @ts-testing (validates accessibility in tests)
- **Skill reference:** `.github/skills/accessibility-audit/SKILL.md` for compliance checklist
