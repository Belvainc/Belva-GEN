import type { ReactNode } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { Text } from "@/components/atoms/Text";
import { prisma } from "@/server/db/client";

/**
 * Dashboard root — project selector.
 * Shows the user's assigned projects. Admins see all projects.
 */
export default async function ProjectSelectorPage(): Promise<ReactNode> {
  const headersList = await headers();
  const userId = headersList.get("x-user-id") ?? "";
  const userRole = headersList.get("x-user-role") ?? "USER";

  // Admins see all projects, users see only assigned ones
  const projects =
    userRole === "ADMIN"
      ? await prisma.project.findMany({
          orderBy: { name: "asc" },
          include: { _count: { select: { users: true, pipelines: true } } },
        })
      : await prisma.project.findMany({
          where: { users: { some: { userId } } },
          orderBy: { name: "asc" },
          include: { _count: { select: { users: true, pipelines: true } } },
        });

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Text variant="h2" as="h2" className="mb-2">
          No Projects
        </Text>
        <Text variant="muted">
          {userRole === "ADMIN"
            ? "Create a project in the admin panel to get started."
            : "You haven't been assigned to any projects yet. Contact an admin."}
        </Text>
        {userRole === "ADMIN" && (
          <Link
            href="/admin/projects/new"
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Project
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      <Text variant="h2" as="h2" className="mb-6">
        Your Projects
      </Text>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/dashboard/${project.slug}`}
            className="group rounded-xl border border-border bg-surface p-6 transition-colors hover:border-primary/50 hover:bg-surface-secondary"
          >
            <Text variant="h4" as="h3" className="mb-1">
              {project.name}
            </Text>
            {project.description !== null && (
              <Text variant="muted" className="mb-4 line-clamp-2">
                {project.description}
              </Text>
            )}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{project._count.users} members</span>
              <span>{project._count.pipelines} pipelines</span>
              {project.jiraProjectKey !== null && (
                <span>Jira: {project.jiraProjectKey}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
