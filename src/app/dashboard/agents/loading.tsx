import type { ReactNode } from "react";

export default function AgentsLoading(): ReactNode {
  return (
    <div>
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="animate-pulse rounded-lg border border-border">
        <div className="h-12 bg-muted" />
        <div className="space-y-3 p-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
