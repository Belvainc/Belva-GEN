# Skill: Accessibility Audit

## Purpose

Checklist-driven audit for WCAG 2.1 Level AA compliance on dashboard UI changes. Ensures all frontend code meets the mandatory accessibility requirements defined in `.claude/rules/accessibility.md`.

## Trigger

Triggered as part of the review-synthesis skill when the PR diff includes files matching:
- `src/components/**/*.tsx`
- `src/app/dashboard/**/*.tsx`

May also be run manually on any UI component or page.

## Workflow

### Step 1 — Identify Audit Scope

From the PR diff, extract all `.tsx` files under `src/components/` and `src/app/dashboard/`.

For each file, identify:
- All interactive elements (buttons, links, inputs, selects, custom widgets)
- All dynamic content areas (status displays, live data, notifications)
- All images and media
- All form elements

### Step 2 — Automated Checks

Verify in test output and code review:

| Check | How to Verify | Severity |
|-------|--------------|----------|
| `jest-axe` passes for all organism tests | Test output shows `toHaveNoViolations()` | error |
| No `<div onClick>` or `<span onClick>` without `role` and `tabIndex` | Code search | error |
| All `<img>` / `next/image` have `alt` text | Code search | error |
| All form inputs have associated `<label>` | Code search for `htmlFor` | error |
| Status indicators have text alternatives (not color-only) | Visual inspection of Badge/Status components | error |
| `aria-live="polite"` on dynamic content regions | Code search | warning |
| `aria-busy="true"` on loading containers | Code search in `loading.tsx` files | warning |
| Focus ring visible on interactive elements (`focus-visible:ring-*`) | Code search | warning |
| Skip-to-main-content link in root layout | Check `src/app/dashboard/layout.tsx` | warning |

### Step 3 — Manual Checklist

These items require human verification during the approval gate:

```markdown
### Keyboard Navigation
- [ ] All interactive elements reachable via Tab key
- [ ] Focus order matches visual reading order
- [ ] Enter/Space activates buttons and links
- [ ] Escape closes modals and dropdowns
- [ ] Focus ring is clearly visible on all focusable elements

### Screen Reader
- [ ] Page content makes sense when read linearly (top-to-bottom)
- [ ] Heading hierarchy is correct (h1 > h2 > h3, no skipped levels)
- [ ] Form inputs announce their labels
- [ ] Status changes announced via aria-live regions
- [ ] Error messages are announced when they appear

### Visual
- [ ] All text meets 4.5:1 contrast ratio (use browser dev tools to verify)
- [ ] Large text (18px+) meets 3:1 contrast ratio
- [ ] UI is usable at 320px viewport width
- [ ] Animations respect `prefers-reduced-motion`
- [ ] No content conveyed by color alone

### Interactive Elements
- [ ] Buttons have descriptive text or aria-label
- [ ] Links have descriptive text (not "click here")
- [ ] Icon-only buttons have aria-label
- [ ] Disabled elements have `aria-disabled` or native `disabled`
- [ ] Loading states have `aria-busy="true"` and `role="status"`
```

### Step 4 — Produce Report

```markdown
## Accessibility Audit: [Component/Page Name]

### Automated Results
| Check | Status | Details |
|-------|--------|---------|
| jest-axe | PASS/FAIL | [violation count if any] |
| Semantic HTML | PASS/FAIL | [specific violations] |
| ARIA attributes | PASS/FAIL | [missing attributes] |
| Color independence | PASS/FAIL | [color-only indicators] |
| Form labels | PASS/FAIL | [unlabeled inputs] |

### Manual Checklist Status
[Include the filled checklist from Step 3]

### Findings
| Severity | Issue | Location | Remediation |
|----------|-------|----------|-------------|
| error | Missing alt text | ComponentName.tsx:25 | Add descriptive alt prop |
| warning | No aria-live on status | StatusBadge.tsx:12 | Add aria-live="polite" to parent |

### Verdict
- Automated: PASS/FAIL
- Manual: PENDING REVIEW / PASS / FAIL
- Overall: PASS / FAIL / NEEDS HUMAN REVIEW
```

**Rules:**
- Automated failures (error severity) **block merge**
- Manual checklist items are **flagged for the human reviewer** in the approval gate
- The human reviewer must confirm at least the keyboard navigation and contrast checks

## Integration

- **Review synthesis:** This skill is a sub-step of `.github/skills/review-synthesis/SKILL.md`
- **DoD validation:** Accessibility audit results feed into `.github/skills/dod-validation/SKILL.md` step 2 (security/a11y scan)
- **Human approval:** Manual checklist is included in the approval request on the HITL dashboard

## Agent Responsibilities

- **@next-ux** — Ensures components pass automated checks before submitting for review
- **@ts-testing** — Writes and maintains `jest-axe` assertions in component tests
- **@orchestrator-project** — Includes audit results in DoD gate evaluation
