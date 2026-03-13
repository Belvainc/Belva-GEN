import type { ReactNode } from "react";

export default function KnowledgeLoading(): ReactNode {
  return (
    <main className="container mx-auto max-w-6xl py-8">
      <header className="mb-8">
        <div className="h-8 w-48 animate-pulse rounded bg-surface" />
        <div className="mt-2 h-5 w-96 animate-pulse rounded bg-surface" />
      </header>

      <div
        className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2"
        aria-busy="true"
        role="status"
        aria-label="Loading knowledge entries"
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-border bg-surface-elevated p-5"
          >
            <div className="mb-3 h-5 w-3/4 rounded bg-surface" />
            <div className="mb-2 flex gap-2">
              <div className="h-5 w-16 rounded-full bg-surface" />
              <div className="h-5 w-16 rounded-full bg-surface" />
            </div>
            <div className="mb-3 space-y-2">
              <div className="h-4 w-full rounded bg-surface" />
              <div className="h-4 w-2/3 rounded bg-surface" />
            </div>
            <div className="flex justify-between">
              <div className="h-3 w-20 rounded bg-surface" />
              <div className="h-3 w-24 rounded bg-surface" />
            </div>
          </div>
        ))}
        <span className="sr-only">Loading knowledge entries</span>
      </div>
    </main>
  );
}
