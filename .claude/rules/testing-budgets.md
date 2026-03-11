---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "e2e/**"
  - "jest.config.*"
  - "playwright.config.*"
---

# Rule: Testing Budgets — Non-Negotiable

## Enforcement Level: MANDATORY — No Exceptions

All code-producing agents must comply with these testing requirements.

---

## 1. Performance Budgets

| Scope | Budget | Action on Violation |
|-------|--------|-------------------|
| Unit test suite (total) | < 3 seconds | Optimize or split tests |
| Individual unit test file | < 500ms | Refactor test or module |
| E2E test suite (total) | < 60 seconds | Parallelize or reduce scope |
| Individual E2E scenario | < 10 seconds | Optimize setup/teardown |

- Performance is measured in CI environment, not local dev
- If a test exceeds its budget, it must be optimized or split — not ignored
- Budget violations block the DoD gate

## 2. Zero Tolerance Policies

### No Skipped Tests
- `.skip()`, `.only()`, `.todo()`, and `xit()` are **forbidden** in committed code
- These may be used during local development but must be removed before commit
- CI must scan for and reject any committed skip markers

### No Empty Test Bodies
- Every `it()` / `test()` block must contain at least one assertion
- Tests without assertions provide false confidence and are not permitted

### No Snapshot-Only Testing
- Jest snapshots are supplementary — they must never be the sole assertion in a test
- Every snapshot test must be accompanied by explicit behavioral assertions
- Snapshot files must be reviewed in PRs, not blindly accepted

## 3. Coverage Requirements

| Scope | Minimum Line Coverage |
|-------|----------------------|
| `src/server/**` | 80% |
| `src/app/**` (excl. generated/layout files) | 70% |
| New code (any location) | 90% |

- Coverage is enforced per-directory, not as a project-wide average
- Coverage decreases on existing code are not permitted without written justification
- The @ts-testing agent generates coverage reports for @orchestrator-project to validate

## 4. Test Organization

### Unit Tests
- Co-located as `*.test.ts` next to source files, OR in `__tests__/` mirroring `src/` structure
- Choose one pattern per directory — do not mix

### E2E Tests
- Located in `e2e/` at project root
- Organized by user journey, not by page/component
- Each test file covers one complete workflow

### Test Fixtures
- Shared fixtures in `__fixtures__/` directories
- Use typed builder pattern for test data factories
- No hardcoded magic values — use named constants or factory defaults

## 5. Test Quality Standards

- Every test must have a descriptive name that reads as a specification
- **WRONG:** `it('works')`
- **RIGHT:** `it('returns 400 when webhook payload is missing ticket reference')`
- Group related tests with `describe()` blocks matching the module under test
- Test both happy path and error cases for every public function
- Edge cases to always cover: empty input, null/undefined, boundary values, concurrent access

## Enforcement

- @ts-testing agent is the primary enforcer of all testing budgets
- CI pipeline must run budget checks and fail the build on any violation
- @orchestrator-project must verify the test report before the DoD gate passes
- Budget violations are treated as blocking — no exceptions, no overrides

## Applicability

- **Code-producing agents:** @node-backend, @next-ux (must write testable code)
- **Test agent:** @ts-testing (must enforce all budgets)
- **Orchestrator:** @orchestrator-project (must validate test reports at DoD gate)
