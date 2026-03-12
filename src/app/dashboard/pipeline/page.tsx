import type { ReactNode } from "react";
import { Suspense } from "react";
import { Text } from "@/components/atoms/Text";
import { PipelineColumn } from "@/components/organisms/PipelineColumn";
import { getServerContext } from "@/server/context";
import { getEpicsByState } from "@/server/services/pipeline.service";
import type { EpicState } from "@/types/events";
import type { EpicSummary } from "@/server/services/pipeline.service";

const PIPELINE_STAGES: EpicState[] = [
  "funnel",
  "refinement",
  "approved",
  "in-progress",
  "review",
  "done",
];

async function PipelineBoard(): Promise<ReactNode> {
  const context = getServerContext();

  // Fetch epics for all stages in parallel
  const epicsByStage = await Promise.all(
    PIPELINE_STAGES.map(async (stage) => ({
      stage,
      epics: getEpicsByState({ engine: context.engine }, stage) as EpicSummary[],
    }))
  );

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {epicsByStage.map(({ stage, epics }) => (
        <PipelineColumn key={stage} stage={stage} epics={epics} />
      ))}
    </div>
  );
}

function PipelineSkeleton(): ReactNode {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((stage) => (
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
  );
}

export default function PipelinePage(): ReactNode {
  return (
    <div>
      <Text variant="h2" as="h2" className="mb-6">
        Epic Pipeline
      </Text>
      <Suspense fallback={<PipelineSkeleton />}>
        <PipelineBoard />
      </Suspense>
    </div>
  );
}

