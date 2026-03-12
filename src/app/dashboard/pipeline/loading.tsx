import type { ReactNode } from "react";

const STAGES = ["funnel", "refinement", "approved", "in-progress", "review", "done"];

export default function PipelineLoading(): ReactNode {
  return (
    <div>
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <div
            key={stage}
            className="min-w-[280px] animate-pulse rounded-lg border border-border bg-surface p-4"
          >
            <div className="mb-4 h-6 w-24 rounded bg-muted" />
            <div className="space-y-3">
              <div className="h-20 rounded bg-muted" />
              <div className="h-20 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
