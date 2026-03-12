import type { ReactNode } from "react";
import { StatusBadge } from "@/components/molecules/StatusBadge";
import { Avatar } from "@/components/atoms/Avatar";
import { Text } from "@/components/atoms/Text";
import type { AgentWithStatus } from "@/server/services/agent.service";

interface AgentStatusTableProps {
  /** List of agents and their statuses */
  agents: AgentWithStatus[];
}

/**
 * Table displaying agent status information.
 */
export function AgentStatusTable({ agents }: AgentStatusTableProps): ReactNode {
  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-elevated p-8 text-center">
        <Text variant="muted">No agents registered</Text>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th
              scope="col"
              className="px-4 py-3 text-left text-sm font-medium text-text-primary"
            >
              Agent
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-sm font-medium text-text-primary"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-sm font-medium text-text-primary"
            >
              Current Task
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-sm font-medium text-text-primary"
            >
              Last Heartbeat
            </th>
          </tr>
        </thead>
        <tbody>
          {agents.map(({ config, status }) => (
            <tr
              key={config.agentId}
              className="border-b border-border bg-surface-elevated hover:bg-muted/50"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    fallback={config.agentId.slice(0, 2)}
                    size="sm"
                  />
                  <div>
                    <Text variant="body" className="font-medium">
                      {config.name}
                    </Text>
                    <Text variant="muted" className="text-xs">
                      {config.agentId}
                    </Text>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={status.status} />
              </td>
              <td className="px-4 py-3">
                <Text variant="muted">
                  {status.currentTask ?? "—"}
                </Text>
              </td>
              <td className="px-4 py-3">
                <Text variant="small">
                  {formatRelativeTime(status.lastHeartbeat)}
                </Text>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString();
}
