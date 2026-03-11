import type { ReactNode } from "react";

const PIPELINE_STAGES = [
  "Funnel",
  "Refinement",
  "Approved",
  "In Progress",
  "Review",
  "Done",
] as const;

export default function PipelinePage(): ReactNode {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Task Pipeline
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => (
          <div
            key={stage}
            className="min-w-[220px] flex-shrink-0 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {stage}
            </h3>
            <div className="space-y-2">
              {/* Epic cards will be populated from API data */}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                No items
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
