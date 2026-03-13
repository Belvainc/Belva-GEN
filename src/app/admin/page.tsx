import type { ReactNode } from "react";
import Link from "next/link";
import { Text } from "@/components/atoms/Text";
import { StatCard } from "@/components/molecules/StatCard";
import { getModelCounts, getAllModelConfigs } from "@/server/admin/registry";
import { prisma } from "@/server/db/client";
import { AdminDashboardLive } from "./AdminDashboardLive";

async function getPendingApprovalCount(): Promise<number> {
  return prisma.approval.count({ where: { status: "PENDING" } });
}

async function getRecentAuditLogs(): Promise<
  Array<{ id: string; action: string; entityType: string; entityId: string; createdAt: Date }>
> {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
  });
}

export default async function AdminDashboardPage(): Promise<ReactNode> {
  const [counts, configs, pendingApprovals, recentLogs] = await Promise.all([
    getModelCounts(),
    getAllModelConfigs(),
    getPendingApprovalCount(),
    getRecentAuditLogs(),
  ]);

  return (
    <div>
      <Text variant="h2" as="h2" className="mb-6">
        Admin Dashboard
      </Text>

      {/* Live health and queue status */}
      <AdminDashboardLive />

      {/* Model stat cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {configs.map((config) => (
          <Link key={config.slug} href={`/admin/${config.slug}`}>
            <StatCard
              label={config.pluralName}
              value={counts[config.slug] ?? 0}
            />
          </Link>
        ))}
      </div>

      {/* Pending approvals highlight */}
      {pendingApprovals > 0 && (
        <Link href="/admin/approvals" className="mb-8 block">
          <div className="rounded-xl border-2 border-status-warning/40 bg-status-warning/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <Text variant="h4" as="p">
                  {pendingApprovals} Pending Approval{pendingApprovals !== 1 ? "s" : ""}
                </Text>
                <Text variant="small" className="text-muted-foreground">
                  Require human review before agents can proceed
                </Text>
              </div>
              <span className="text-sm font-medium text-primary">Review &rarr;</span>
            </div>
          </div>
        </Link>
      )}

      {/* Quick Actions */}
      <div className="mb-8 rounded-xl border border-border bg-surface p-6">
        <Text variant="h4" as="h3" className="mb-4">
          Quick Actions
        </Text>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/users/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create User
          </Link>
          <Link
            href="/admin/projects/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Project
          </Link>
          <Link
            href="/admin/knowledge/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Knowledge Entry
          </Link>
          <Link
            href="/admin/system-health"
            className="rounded-md border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
          >
            System Health
          </Link>
          <Link
            href="/admin/queues"
            className="rounded-md border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
          >
            Queue Monitor
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <Text variant="h4" as="h3" className="mb-4">
          Recent Activity
        </Text>
        {recentLogs.length === 0 ? (
          <Text variant="small" className="text-muted-foreground">
            No activity recorded yet.
          </Text>
        ) : (
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <Link
                key={log.id}
                href={`/admin/audit-logs/${log.id}`}
                className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-surface-secondary"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                  <Text variant="small" className="font-medium">
                    {log.action}
                  </Text>
                  <Text variant="small" className="text-muted-foreground">
                    {log.entityType} {log.entityId}
                  </Text>
                </div>
                <Text variant="small" className="text-muted-foreground">
                  {log.createdAt.toLocaleDateString()}{" "}
                  {log.createdAt.toLocaleTimeString()}
                </Text>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
