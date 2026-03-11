Run tests for the Belva-GEN project.

Usage: /test [unit|e2e|coverage|all]

Options:
- `unit` — Run Jest unit tests only (src/)
- `e2e` — Run Playwright E2E tests
- `coverage` — Run Jest with coverage report
- `all` — Run all tests (default)

Commands:
- `npm run test:unit` for unit tests (<3s budget)
- `npm run test:e2e` for E2E tests (<60s budget)
- `npm run test:coverage` for coverage report

Performance budgets (enforced by `.claude/rules/testing-budgets.md`):
- Unit suite: <3 seconds total
- E2E suite: <60 seconds total
- Zero skipped tests allowed

Run the appropriate command based on the argument. If no argument, run `npm run test`.
