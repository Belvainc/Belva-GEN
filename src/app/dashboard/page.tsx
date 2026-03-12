import type { ReactNode } from "react";
import { Suspense } from "react";
import { Text } from "@/components/atoms/Text";
import { StatCard } from "@/components/molecules/StatCard";
import { getServerContext } from "@/server/context";
import { getAllAgentStatuses } from "@/server/services/agent.service";
import { getAllEpics } from "@/server/services/pipeline.service";
import { prisma } from "@/server/db/client";

async function DashboardStats(): Promise<ReactNode> {
  const context = getServerContext();

  // Fetch data in parallel
  const [agentStatuses, epics, pendingApprovals] = await Promise.all([
    getAllAgentStatuses({ registry: context.registry }),
    Promise.resolve(getAllEpics({ engine: context.engine })),
    prisma.approval.count({ where: { status: "PENDING" } }),
  ]);

  const activeAgents = agentStatuses.filter((a) => a.status.status !== "offline").length;
  const busyAgents = agentStatuses.filter((a) => a.status.status === "busy").length;
  const activeEpics = epics.filter(
    (e) => e.state === "in-progress" || e.state === "review"
  ).length;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Active Epics" value={activeEpics} />
      <StatCard label="Pending Approvals" value={pendingApprovals} />
      <StatCard label="Agents Online" value={activeAgents} />
      <StatCard label="Agents Busy" value={busyAgents} />
    </div>
  );
}

function StatsLoading(): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Active Epics" value="" loading />
      <StatCard label="Pending Approvals" value="" loading />
      <StatCard label="Agents Online" value="" loading />
      <StatCard label="Agents Busy" value="" loading />
    </div>
  );
}

export default function DashboardOverviewPage(): ReactNode {
  return (
    <div>
      <Text variant="h2" as="h2" className="mb-6">
        Dashboard Overview
      </Text>
      <Suspense fallback={<StatsLoading />}>
        <DashboardStats />
      </Suspense>
    </div>
  );
}

