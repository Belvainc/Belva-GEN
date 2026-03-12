import type { ReactNode } from "react";
import { Suspense } from "react";
import { Text } from "@/components/atoms/Text";
import { AgentStatusTable } from "@/components/organisms/AgentStatusTable";
import { getServerContext } from "@/server/context";
import { getAllAgentStatuses } from "@/server/services/agent.service";

async function AgentList(): Promise<ReactNode> {
  const context = getServerContext();
  const agents = await getAllAgentStatuses({ registry: context.registry });

  return <AgentStatusTable agents={agents} />;
}

function AgentTableSkeleton(): ReactNode {
  return (
    <div className="animate-pulse rounded-lg border border-border">
      <div className="h-12 bg-muted" />
      <div className="space-y-3 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

export default function AgentsPage(): ReactNode {
  return (
    <div>
      <Text variant="h2" as="h2" className="mb-6">
        Agent Health Monitor
      </Text>
      <Suspense fallback={<AgentTableSkeleton />}>
        <AgentList />
      </Suspense>
    </div>
  );
}

