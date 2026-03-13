import type { ReactNode } from "react";
import { Suspense } from "react";
import { prisma } from "@/server/db/client";
import type { KnowledgeEntry } from "@prisma/client";

// ─── Category & Status Config ───────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  PATTERN: { label: "Pattern", className: "bg-blue-100 text-blue-800" },
  GOTCHA: { label: "Gotcha", className: "bg-amber-100 text-amber-800" },
  DECISION: { label: "Decision", className: "bg-purple-100 text-purple-800" },
  OPTIMIZATION: { label: "Optimization", className: "bg-green-100 text-green-800" },
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-gray-100 text-gray-700" },
  VALIDATED: { label: "Validated", className: "bg-blue-100 text-blue-700" },
  PROMOTED: { label: "Promoted", className: "bg-green-100 text-green-700" },
  ARCHIVED: { label: "Archived", className: "bg-gray-100 text-gray-500" },
};

// ─── Data Fetching ──────────────────────────────────────────────────────────

interface KnowledgePageProps {
  params: Promise<{ projectSlug: string }>;
  searchParams: Promise<{
    category?: string;
    status?: string;
  }>;
}

async function getKnowledgeEntries(
  projectSlug: string,
  category?: string,
  status?: string
): Promise<KnowledgeEntry[]> {
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true },
  });

  if (project === null) return [];

  const where: Record<string, unknown> = { projectId: project.id };
  if (category !== undefined && category !== "") where.category = category;
  if (status !== undefined && status !== "") where.status = status;

  return prisma.knowledgeEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

// ─── Components ─────────────────────────────────────────────────────────────

function Badge({ label, className }: { label: string; className: string }): ReactNode {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }): ReactNode {
  const percent = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-status-idle transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-text-muted">{percent}%</span>
    </div>
  );
}

function KnowledgeCard({ entry }: { entry: KnowledgeEntry }): ReactNode {
  const categoryConfig = CATEGORY_STYLES[entry.category] ?? { label: entry.category, className: "bg-gray-100 text-gray-800" };
  const statusConfig = STATUS_STYLES[entry.status] ?? { label: entry.status, className: "bg-gray-100 text-gray-800" };

  return (
    <article className="rounded-lg border border-border bg-surface-elevated p-5 shadow-sm">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary">{entry.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge label={categoryConfig.label} className={categoryConfig.className} />
            <Badge label={statusConfig.label} className={statusConfig.className} />
            {entry.sourceTicketRef !== null && (
              <span className="text-xs font-mono text-text-muted">{entry.sourceTicketRef}</span>
            )}
          </div>
        </div>
        <ConfidenceBar confidence={entry.confidence} />
      </header>

      <p className="mb-3 line-clamp-3 text-sm text-text-secondary">{entry.content}</p>

      <footer className="flex items-center justify-between text-xs text-text-muted">
        <span>Validated: {entry.validatedCount}x</span>
        <time dateTime={entry.createdAt.toISOString()}>
          {entry.createdAt.toLocaleDateString()}
        </time>
      </footer>
    </article>
  );
}

function EmptyState(): ReactNode {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <p className="text-text-secondary">No knowledge entries found.</p>
      <p className="mt-1 text-sm text-text-muted">
        Knowledge is extracted automatically when pipelines complete successfully.
      </p>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

async function KnowledgeList({
  projectSlug,
  category,
  status,
}: {
  projectSlug: string;
  category?: string;
  status?: string;
}): Promise<ReactNode> {
  const entries = await getKnowledgeEntries(projectSlug, category, status);

  if (entries.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
      {entries.map((entry) => (
        <KnowledgeCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

export default async function KnowledgePage({
  params,
  searchParams,
}: KnowledgePageProps): Promise<ReactNode> {
  const { projectSlug } = await params;
  const { category, status } = await searchParams;

  return (
    <main className="container mx-auto max-w-6xl py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Knowledge Base</h1>
        <p className="mt-1 text-text-secondary">
          Patterns, decisions, and learnings extracted from completed pipelines.
        </p>
      </header>

      {/* Filters */}
      <nav className="mb-6 flex flex-wrap gap-4" aria-label="Knowledge filters">
        <div>
          <label htmlFor="category-filter" className="mb-1 block text-xs font-medium text-text-muted">
            Category
          </label>
          <form>
            <select
              id="category-filter"
              name="category"
              defaultValue={category ?? ""}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-primary"
            >
              <option value="">All Categories</option>
              <option value="PATTERN">Pattern</option>
              <option value="GOTCHA">Gotcha</option>
              <option value="DECISION">Decision</option>
              <option value="OPTIMIZATION">Optimization</option>
            </select>
            <select
              id="status-filter"
              name="status"
              defaultValue={status ?? ""}
              className="ml-3 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-primary"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="VALIDATED">Validated</option>
              <option value="PROMOTED">Promoted</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <button
              type="submit"
              className="ml-3 rounded-md bg-text-primary px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-text-primary/90"
            >
              Filter
            </button>
          </form>
        </div>
      </nav>

      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2" aria-busy="true" role="status">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-lg border border-border bg-surface-elevated p-5">
                <div className="mb-3 h-5 w-3/4 rounded bg-surface" />
                <div className="mb-2 flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-surface" />
                  <div className="h-5 w-16 rounded-full bg-surface" />
                </div>
                <div className="mb-3 space-y-2">
                  <div className="h-4 w-full rounded bg-surface" />
                  <div className="h-4 w-2/3 rounded bg-surface" />
                </div>
              </div>
            ))}
            <span className="sr-only">Loading knowledge entries</span>
          </div>
        }
      >
        <KnowledgeList projectSlug={projectSlug} category={category} status={status} />
      </Suspense>
    </main>
  );
}
