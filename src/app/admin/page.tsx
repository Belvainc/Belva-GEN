import type { ReactNode } from "react";
import Link from "next/link";
import { Text } from "@/components/atoms/Text";
import { StatCard } from "@/components/molecules/StatCard";
import { getModelCounts, getAllModelConfigs } from "@/server/admin/registry";

export default async function AdminDashboardPage(): Promise<ReactNode> {
  const counts = await getModelCounts();
  const configs = getAllModelConfigs();

  return (
    <div>
      <Text variant="h2" as="h2" className="mb-6">
        Admin Dashboard
      </Text>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {configs.map((config) => (
          <Link key={config.slug} href={`/admin/${config.slug}`}>
            <StatCard
              label={config.pluralName}
              value={counts[config.slug] ?? 0}
            />
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
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
        </div>
      </div>
    </div>
  );
}
