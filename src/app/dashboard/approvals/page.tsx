import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { prisma } from "@/server/db/client";
import { ApprovalCard } from "@/components/organisms/ApprovalCard";
import type { Approval } from "@prisma/client";

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Pending Approvals | Belva-GEN Dashboard",
  description: "Review and approve implementation plans for tickets",
};

// ─── Approval List (async data fetcher) ───────────────────────────────────────

async function ApprovalList(): Promise<ReactNode> {
  const approvals = await prisma.approval.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Resolve reviewer identity from request headers or fall back to "dashboard-user"
  const headersList = await headers();
  const reviewerIdentity =
    headersList.get("x-user-identity") ?? "dashboard-user";

  if (approvals.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-12 text-center">
        <p className="text-text-muted">No pending approvals</p>
        <p className="mt-2 text-sm text-text-muted">
          Approvals will appear here when plans are ready for review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {approvals.map((approval: Approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          reviewerIdentity={reviewerIdentity}
        />
      ))}
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function ApprovalListSkeleton(): ReactNode {
  return (
    <div className="space-y-6" aria-busy="true" role="status" aria-label="Loading approvals">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-border bg-surface-elevated p-6"
        >
          {/* Header skeleton */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="h-6 w-40 rounded bg-surface" />
              <div className="mt-2 h-5 w-24 rounded-full bg-surface" />
            </div>
            <div className="h-4 w-32 rounded bg-surface" />
          </div>
          {/* Content skeleton */}
          <div className="mb-4 h-32 rounded bg-surface" />
          {/* Buttons skeleton */}
          <div className="flex gap-3">
            <div className="h-10 w-24 rounded bg-surface" />
            <div className="h-10 w-36 rounded bg-surface" />
            <div className="h-10 w-20 rounded bg-surface" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading pending approvals</span>
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function ApprovalsPage(): ReactNode {
  return (
    <main className="container mx-auto max-w-4xl py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">
          Pending Approvals
        </h1>
        <p className="mt-2 text-text-secondary">
          Review implementation plans before agent execution begins.
          All approvals require explicit human decision — no auto-approval.
        </p>
      </header>

      <Suspense fallback={<ApprovalListSkeleton />}>
        <ApprovalList />
      </Suspense>
    </main>
  );
}
