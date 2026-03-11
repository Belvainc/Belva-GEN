---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Rule: TypeScript Strict Mode — Non-Negotiable

## Enforcement Level: MANDATORY — No Exceptions

All agents must comply with these rules for every TypeScript file in the project.

---

## 1. Zero `any` Types

The `any` type is absolutely forbidden in all source files.

- Use `unknown` when the type is genuinely not known, then narrow with type guards
- **WRONG:** `function parse(data: any): any`
- **RIGHT:** `function parse(data: unknown): ParseResult`
- ESLint rule `@typescript-eslint/no-explicit-any` must be set to `error`

## 2. Strict Compiler Options

The `tsconfig.json` must maintain these flags at all times:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true
}
```

- `strict: true` covers: strictNullChecks, strictFunctionTypes, strictBindCallApply, strictPropertyInitialization, noImplicitAny, noImplicitThis, alwaysStrict
- These flags must never be disabled, overridden, or weakened in any tsconfig extends

## 3. Schema Validation for All Agent Communication

Every message passed between agents MUST be validated at runtime using Zod.

- The Zod schema must mirror the TypeScript type in `@/types/agent-protocol.ts`
- **WRONG:** `const msg = JSON.parse(raw) as AgentMessage`
- **RIGHT:** `const msg = AgentMessageSchema.parse(JSON.parse(raw))`
- All external API responses must be validated before use
- All webhook payloads must be validated before processing

## 4. Function Signatures

- All exported functions must have explicit return types
- All function parameters must be explicitly typed
- No implicit `any` from untyped third-party libraries — create `.d.ts` declaration files
- Async functions must return `Promise<ExplicitType>`, never `Promise<any>`

## 5. Discriminated Unions Over Enums

- Prefer discriminated unions with a `kind` field over TypeScript enums
- All `switch` statements on discriminated unions must be exhaustive
- Use a `never` type check in the default case to catch unhandled variants:

```typescript
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}
```

## 6. No Type Assertions Without Validation

- `as` casts are forbidden on external data (API responses, user input, parsed JSON)
- `as const` and `as` narrowing after Zod validation are permitted
- Non-null assertions (`!`) are discouraged — prefer explicit null checks

## Applicability

- **All agents:** @orchestrator-project, @node-backend, @next-ux, @ts-testing
- **All source files:** `src/**/*.ts`, `src/**/*.tsx`
- **Test files included:** test code must also be strictly typed
