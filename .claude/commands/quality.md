Run code quality checks for the Belva-GEN project.

Usage: /quality

Run `npm run quality` which executes:
1. ESLint — code style and best practices
2. TypeScript type-check (`tsc --noEmit`) — strict type safety

Both must pass with zero errors before committing.

Rules enforced:
- `.claude/rules/ts-strict-mode.md` — zero `any` types, explicit return types
- No unused variables or imports
