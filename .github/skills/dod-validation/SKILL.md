# Skill: Definition of Done (DoD) Validation

## Purpose

Validates that completed work meets all quality, security, and compliance gates before auto-merge is permitted. This is the final quality checkpoint before code reaches `main`.

## Trigger

Called by @orchestrator-project when a specialized agent reports `TaskCompletion`.

---

## Validation Steps

### Step 1: Test Suite Verification

- All unit tests pass (verified by @ts-testing test report)
- All E2E tests pass for affected user journeys
- Coverage thresholds met per `.claude/rules/testing-budgets.md`:
  - `src/server/**`: ≥80% line coverage
  - `src/app/**`: ≥70% line coverage
  - New code: ≥90% line coverage
- Performance budgets met:
  - Unit suite < 3 seconds
  - E2E suite < 60 seconds
- Zero skipped tests (no `.skip()`, `.only()`, `.todo()`)

### Step 2: Security Scanning

#### Secret Detection
- Scan diff for patterns matching API keys, tokens, passwords, private keys
- Check for hardcoded credentials, connection strings, or secret values
- Verify no `.env` files or credential files are included in the changeset

#### Dangerous Code Patterns
- Flag any new usage of:
  - `eval()` or `Function()` constructor
  - `dangerouslySetInnerHTML` in React components
  - `innerHTML` direct assignment
  - SQL string concatenation (if applicable)
  - `child_process.exec` with unsanitized input
- Each flagged pattern requires written justification or must be removed

#### Dependency Audit
- Run `npm audit` — no new critical or high severity vulnerabilities
- Any new dependencies must be reviewed for:
  - Maintenance status (last publish date, open issues)
  - License compatibility
  - Known vulnerability history

### Step 3: Edge Case Testing

Verify that tests cover the following categories:

| Category | Examples |
|----------|---------|
| Empty input | Empty strings, empty arrays, empty objects |
| Null/undefined | Nullable fields, optional parameters |
| Boundary values | Min/max integers, zero, negative numbers |
| Error handling | Network failures, timeouts, malformed data |
| Concurrent access | Simultaneous state mutations, race conditions |
| Invalid types | Wrong data shapes at system boundaries |

- @ts-testing agent must confirm coverage of these categories in the test report
- Missing categories are flagged as DoD violations

### Step 4: Architecture Compliance

#### Code Ownership Boundaries
- Backend agent (@node-backend) code is within `src/server/`, `src/app/api/`, `src/types/`, `src/lib/`
- Frontend agent (@next-ux) code is within `src/app/dashboard/`, UI components
- Testing agent (@ts-testing) code is within `__tests__/`, `e2e/`, test configs
- Cross-boundary changes require explicit coordination and are flagged for review

#### Type System Integrity
- All new types added to `@/types/` shared type directory
- Zod schemas mirror TypeScript types for any new agent messages
- No `any` types introduced (per `.claude/rules/ts-strict-mode.md`)

#### Structural Integrity
- No circular dependencies introduced (verify with import analysis)
- No unused exports or dead code added
- Module boundaries respected (no reaching into internal module paths)

### Step 5: Documentation

- New API endpoints have JSDoc with `@param` and `@returns`
- Complex business logic has inline explanatory comments
- Public utility functions have JSDoc with usage examples
- If user-facing behavior changed, verify relevant documentation is updated

---

## Output

### ALL PASS
- Emit `DoDPassEvent` with:
  - Validation timestamp
  - Ticket reference
  - Test report summary (pass count, coverage %)
  - Security scan result (clean/flagged items)
- Orchestrator proceeds to squash-merge per `.claude/rules/git-safety.md`

### ANY FAIL
- Emit `DoDFailEvent` with structured failure report:
  ```
  DoD Validation Failed for [BELVA-XXX]

  Failed Steps:
  - Step 1: Test Suite — coverage for src/server/ is 72% (required: 80%)
  - Step 2: Security — found potential API key in src/server/mcp/jira/client.ts:42
  - Step 3: Edge Cases — no tests for concurrent access scenarios

  Remediation:
  - Add unit tests for uncovered functions in orchestrator/engine.ts
  - Move API key to environment variable, use process.env
  - Add concurrent state mutation tests to message-bus.test.ts
  ```
- Merge is blocked
- Assign remediation tasks back to the responsible agent
- Orchestrator tracks remediation cycle and re-triggers DoD on completion
