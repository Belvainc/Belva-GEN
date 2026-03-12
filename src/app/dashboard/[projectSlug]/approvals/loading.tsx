import type { ReactNode } from "react";

export default function ApprovalsLoading(): ReactNode {
  return (
    <main className="container mx-auto max-w-4xl py-8">
      <header className="mb-8">
        <div className="h-8 w-48 animate-pulse rounded bg-surface" />
        <div className="mt-2 h-5 w-96 animate-pulse rounded bg-surface" />
      </header>

      <div className="space-y-6" aria-busy="true" role="status" aria-label="Loading approvals">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-border bg-surface-elevated p-6"
          >
            {/* Header skeleton */}
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="h-6 w-40 rounded bg-surface" />
                <div className="mt-2 h-5 w-24 rounded-full bg-surface" />
              </div>
              <div className="h-4 w-32 rounded bg-surface" />
            </div>
            {/* Content skeleton */}
            <div className="mb-4 h-32 rounded bg-surface" />
            {/* Buttons skeleton */}
            <div className="flex gap-3">
              <div className="h-10 w-24 rounded bg-surface" />
              <div className="h-10 w-36 rounded bg-surface" />
              <div className="h-10 w-20 rounded bg-surface" />
            </div>
          </div>
        ))}
        <span className="sr-only">Loading pending approvals</span>
      </div>
    </main>
  );
}
