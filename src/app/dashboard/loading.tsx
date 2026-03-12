import type { ReactNode } from "react";
import { StatCard } from "@/components/molecules/StatCard";

export default function DashboardLoading(): ReactNode {
  return (
    <div>
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Epics" value="" loading />
        <StatCard label="Pending Approvals" value="" loading />
        <StatCard label="Agents Online" value="" loading />
        <StatCard label="Agents Busy" value="" loading />
      </div>
    </div>
  );
}
