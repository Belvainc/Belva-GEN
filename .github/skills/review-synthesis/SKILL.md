# Skill: Review Synthesis

## Purpose

Generate structured PR review verdicts by analyzing diffs against project rules, producing actionable findings with clear remediation instructions.

## Trigger

Called by @orchestrator-project during the DoD gate for every pull request, or manually when a comprehensive code review is needed.

## Workflow

### Step 1 — Partition the Diff

Group changed files by agent domain ownership:

| File Pattern | Owner Agent | Applicable Rules |
|-------------|-------------|-----------------|
| `src/app/dashboard/**` | @next-ux | component-architecture, accessibility, frontend-performance, data-fetching, ts-strict-mode |
| `src/components/**` | @next-ux | component-architecture, accessibility, frontend-performance, ts-strict-mode |
| `src/server/**` | @node-backend | service-layer, async-concurrency, ts-strict-mode |
| `src/app/api/**` | @node-backend | service-layer, async-concurrency, ts-strict-mode |
| `src/types/**`, `src/lib/**` | @node-backend | ts-strict-mode |
| `**/*.test.ts`, `**/*.spec.ts`, `e2e/**` | @ts-testing | testing-budgets, ts-strict-mode |
| `.claude/**`, `.github/**` | @orchestrator-project | git-safety, mcp-safety |

### Step 2 — Rule Compliance Check

For each changed file:

1. Identify which rules apply based on the file's path (match against `paths:` frontmatter in each rule)
2. Read the file content
3. Check compliance against every applicable rule section
4. Record findings with severity, rule reference, file path, and line range

**Severity Levels:**

| Severity | Definition | Impact |
|----------|------------|--------|
| **error** | Violates a FORBIDDEN pattern or mandatory requirement | Blocks merge |
| **warning** | Deviation from recommended pattern but not forbidden | Flagged for author |
| **info** | Improvement suggestion, not a violation | Advisory only |

### Step 3 — Validate Findings

For each finding:

1. Read at least 10 lines of surrounding context to confirm the violation is genuine
2. Check if there's an existing exemption (documented `// eslint-disable` with justification, or legacy code acknowledged in the rule)
3. Discard false positives
4. Annotate remaining findings with specific remediation instructions (not just "fix this" — explain how)

### Step 4 — Synthesize Verdict

Produce a structured review:

```markdown
## PR Review: [PR title]

### Verdict: APPROVE | REQUEST_CHANGES | BLOCK

### Summary
[1-3 sentences describing the overall quality and nature of changes]

### Findings

| Severity | Rule | File | Line | Description | Remediation |
|----------|------|------|------|-------------|-------------|
| error | component-architecture | src/app/dashboard/page.tsx | 15-30 | Inline Tailwind in page file | Extract to `StatCard` organism in `src/components/organisms/` |
| warning | accessibility | src/components/atoms/Button.tsx | 22 | Missing `aria-label` on icon-only variant | Add `aria-label` prop or require `children` text |

### Gate Status

- [ ] ts-strict-mode: PASS/FAIL
- [ ] component-architecture: PASS/FAIL (if frontend files changed)
- [ ] accessibility: PASS/FAIL (if component/dashboard files changed)
- [ ] service-layer: PASS/FAIL (if API/server files changed)
- [ ] async-concurrency: PASS/FAIL (if server files changed)
- [ ] frontend-performance: PASS/FAIL (if frontend files changed)
- [ ] data-fetching: PASS/FAIL (if dashboard files changed)
- [ ] testing-budgets: PASS/FAIL (if test files changed)
- [ ] git-safety: PASS/FAIL
- [ ] mcp-safety: PASS/FAIL (if MCP-related files changed)

### Test Coverage Delta
[Coverage change summary if tests are included]
```

**Verdict Decision:**

| Condition | Verdict |
|-----------|---------|
| Zero error findings | **APPROVE** |
| Error findings exist but all have clear fixes | **REQUEST_CHANGES** |
| Architectural violations or security issues | **BLOCK** |

## Integration

- **DoD gate:** The orchestrator runs this skill before marking a PR as ready for human approval
- **Accessibility audit:** When frontend files are in the diff, also run `.github/skills/accessibility-audit/SKILL.md`
- **Human approval:** The review synthesis output is included in the approval request sent to the HITL dashboard

## Agent Responsibilities

- **@orchestrator-project** — Triggers review synthesis at DoD gate
- **@ts-testing** — Provides test coverage data for the review
- **All agents** — Must address error-severity findings before re-requesting review
