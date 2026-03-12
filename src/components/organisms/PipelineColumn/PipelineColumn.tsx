import type { ReactNode } from "react";
import { Badge } from "@/components/atoms/Badge";
import { Text } from "@/components/atoms/Text";
import type { EpicSummary } from "@/server/services/pipeline.service";
import { cn } from "@/lib/utils";

interface PipelineColumnProps {
  /** Stage name */
  stage: string;
  /** Epics in this stage */
  epics: EpicSummary[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Kanban column for a pipeline stage.
 */
export function PipelineColumn({
  stage,
  epics,
  className,
}: PipelineColumnProps): ReactNode {
  return (
    <section
      className={cn(
        "flex min-w-[280px] flex-col rounded-lg border border-border bg-surface p-4",
        className
      )}
      aria-labelledby={`stage-${stage}`}
    >
      <header className="mb-4 flex items-center justify-between">
        <Text variant="h4" as="h3" id={`stage-${stage}`}>
          {formatStageName(stage)}
        </Text>
        <Badge>{epics.length}</Badge>
      </header>

      <ul className="flex-1 space-y-3" role="list">
        {epics.map((epic) => (
          <li key={epic.ticketRef}>
            <EpicCard epic={epic} />
          </li>
        ))}
        {epics.length === 0 && (
          <li className="py-8 text-center">
            <Text variant="muted">No epics</Text>
          </li>
        )}
      </ul>
    </section>
  );
}

function EpicCard({ epic }: { epic: EpicSummary }): ReactNode {
  const progressPercent =
    epic.progress.totalTasks > 0
      ? Math.round(
          (epic.progress.completedTasks / epic.progress.totalTasks) * 100
        )
      : 0;

  return (
    <article className="rounded-md border border-border bg-surface-elevated p-3">
      <Text variant="body" className="mb-1 font-medium">
        {epic.ticketRef}
      </Text>
      <div className="mb-2 flex items-center justify-between text-xs">
        <Text variant="muted" as="span">
          {epic.progress.completedTasks}/{epic.progress.totalTasks} tasks
        </Text>
        {epic.progress.activeTasks > 0 && (
          <Badge variant="warning">{epic.progress.activeTasks} active</Badge>
        )}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progressPercent}% complete`}
      >
        <div
          className="h-full bg-status-success transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </article>
  );
}

function formatStageName(stage: string): string {
  return stage
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
