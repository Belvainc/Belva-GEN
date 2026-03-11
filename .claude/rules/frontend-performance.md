---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
---

# Rule: Frontend Performance — Core Web Vitals & Bundle Budgets

## Enforcement Level: MANDATORY — No Exceptions

All frontend code must meet performance targets. The dashboard is the primary interface for human-in-the-loop governance — it must be fast and responsive.

---

## 1. Core Web Vitals Targets

| Metric | Target | Measured On |
|--------|--------|-------------|
| LCP (Largest Contentful Paint) | < 2.5s | Dashboard overview page |
| INP (Interaction to Next Paint) | < 200ms | Approval action buttons |
| CLS (Cumulative Layout Shift) | < 0.1 | All dashboard pages |

## 2. Bundle Size Budgets

- No single page JS bundle > **100KB gzipped**
- Minimize `"use client"` boundaries — every `"use client"` directive creates a JS bundle boundary
- Mark the client boundary at the organism level, not at atoms/molecules
- Monitor with `next build` output — check the route size column

## 3. Images

- **All images must use `next/image`** — no `<img>` tags
- Always provide `width` and `height` to prevent CLS
- Use `priority` only for the above-fold LCP image (one per page maximum)
- Use `loading="lazy"` (default) for below-the-fold images
- Prefer `webp` or `avif` formats via Next.js automatic optimization

## 4. Fonts

- Use `next/font` exclusively (already configured with Geist + Geist_Mono in `src/app/layout.tsx`)
- **FORBIDDEN:** `@import` or `<link>` for Google Fonts or external font CDNs
- **FORBIDDEN:** `@font-face` declarations in CSS files (use `next/font` instead)

## 5. Code Splitting

| Strategy | When |
|----------|------|
| App Router auto-splitting | Default — each route gets its own bundle |
| `next/dynamic` with `ssr: false` | Browser-only components (charts, maps) |
| React `lazy()` + `<Suspense>` | Heavy client-only components within a page |
| Dynamic `import()` | Large utility libraries used conditionally |

## 6. Streaming & Loading States

- **`loading.tsx`** must exist in every dashboard route directory for instant shell rendering:
  - `src/app/dashboard/loading.tsx`
  - `src/app/dashboard/agents/loading.tsx`
  - `src/app/dashboard/pipeline/loading.tsx`
  - `src/app/dashboard/approvals/loading.tsx`
- **`<Suspense>`** boundaries inside pages when multiple async data fetches exist — each with a meaningful fallback matching the content dimensions (prevents CLS)
- Skeleton components must match the layout of the content they replace

## 7. Anti-Patterns

| Pattern | Status | Alternative |
|---------|--------|-------------|
| `<img>` tags | **FORBIDDEN** | Use `next/image` |
| External font CDN imports | **FORBIDDEN** | Use `next/font` |
| `"use client"` on atoms/molecules | **FORBIDDEN** | Keep client boundary at organism level |
| Missing `width`/`height` on images | **FORBIDDEN** | Always specify to prevent CLS |
| Pages without `loading.tsx` | **FORBIDDEN** | Add skeleton loading state |
| Inline `<script>` tags | **FORBIDDEN** | Use `next/script` with `strategy` |

## Applicability

- **Primary agent:** @next-ux (implements performant components and pages)
- **Supporting agent:** @ts-testing (E2E tests may include Lighthouse CI checks)
- **Reference:** `.claude/rules/component-architecture.md` for client boundary placement
