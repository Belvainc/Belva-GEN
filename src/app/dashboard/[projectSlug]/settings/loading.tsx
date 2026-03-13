import type { ReactNode } from "react";

export default function SettingsLoading(): ReactNode {
  return (
    <main className="container mx-auto max-w-6xl py-8">
      <header className="mb-8">
        <div className="h-8 w-48 animate-pulse rounded bg-surface" />
      </header>

      <div
        className="space-y-6"
        aria-busy="true"
        role="status"
        aria-label="Loading project settings"
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-border bg-surface-elevated p-6"
          >
            <div className="mb-4 h-6 w-40 rounded bg-surface" />
            <div className="space-y-3">
              <div className="h-10 rounded bg-surface" />
              <div className="h-10 rounded bg-surface" />
            </div>
          </div>
        ))}
        <span className="sr-only">Loading project settings</span>
      </div>
    </main>
  );
}
