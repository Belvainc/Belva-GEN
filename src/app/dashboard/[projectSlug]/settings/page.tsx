import type { ReactNode } from "react";
import { Suspense } from "react";
import { Text } from "@/components/atoms/Text";
import { prisma } from "@/server/db/client";
import { notFound } from "next/navigation";

// ─── Data Fetching ──────────────────────────────────────────────────────────

async function getProjectSettings(slug: string) {
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      credentials: {
        select: { key: true, updatedAt: true },
      },
    },
  });

  if (project === null) return null;

  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    repoPath: project.repoPath,
    githubRepo: project.githubRepo,
    jiraProjectKey: project.jiraProjectKey,
    metadata: project.metadata as Record<string, unknown> | null,
    credentials: project.credentials.map((c) => ({
      key: c.key,
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}

// ─── Settings Section Component ─────────────────────────────────────────────

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="rounded-lg border border-border bg-surface-elevated p-6">
      <Text variant="h4" as="h3" className="mb-4">
        {title}
      </Text>
      {children}
    </section>
  );
}

function SettingsField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}): ReactNode {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <Text variant="small" className="text-muted-foreground">
        {label}
      </Text>
      <Text variant="small" className="font-mono">
        {value ?? <span className="text-muted-foreground">Not configured</span>}
      </Text>
    </div>
  );
}

// ─── Settings Content ───────────────────────────────────────────────────────

async function SettingsContent({
  projectSlug,
}: {
  projectSlug: string;
}): Promise<ReactNode> {
  const project = await getProjectSettings(projectSlug);
  if (project === null) notFound();

  const modelOverride = (project.metadata as Record<string, unknown> | null)?.modelOverride as
    | string
    | undefined;
  const slackChannel = (project.metadata as Record<string, unknown> | null)?.slackChannel as
    | string
    | undefined;

  return (
    <div className="space-y-6">
      {/* Repository Configuration */}
      <SettingsSection title="Repository">
        <SettingsField label="Repo Path" value={project.repoPath} />
        <SettingsField label="GitHub Repo" value={project.githubRepo} />
        <SettingsField label="Jira Project Key" value={project.jiraProjectKey} />
      </SettingsSection>

      {/* Model Configuration */}
      <SettingsSection title="Model Configuration">
        <SettingsField label="Model Override" value={modelOverride} />
        <Text variant="small" className="mt-2 text-muted-foreground">
          Per-project model override. Leave empty to use agent defaults.
        </Text>
      </SettingsSection>

      {/* MCP Credentials */}
      <SettingsSection title="MCP Credentials">
        {project.credentials.length === 0 ? (
          <Text variant="small" className="text-muted-foreground">
            No credentials configured. Add credentials via the API.
          </Text>
        ) : (
          project.credentials.map((cred) => (
            <SettingsField
              key={cred.key}
              label={cred.key}
              value={`Configured (updated ${new Date(cred.updatedAt).toLocaleDateString()})`}
            />
          ))
        )}
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection title="Notifications">
        <SettingsField label="Slack Channel" value={slackChannel} />
      </SettingsSection>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function SettingsSkeleton(): ReactNode {
  return (
    <div className="space-y-6" aria-busy="true" role="status">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-border bg-surface-elevated p-6"
        >
          <div className="mb-4 h-6 w-40 rounded bg-surface" />
          <div className="space-y-3">
            <div className="h-10 rounded bg-surface" />
            <div className="h-10 rounded bg-surface" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading project settings</span>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}): Promise<ReactNode> {
  const { projectSlug } = await params;

  return (
    <div>
      <Text variant="h2" as="h2" className="mb-6">
        Project Settings
      </Text>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent projectSlug={projectSlug} />
      </Suspense>
    </div>
  );
}
