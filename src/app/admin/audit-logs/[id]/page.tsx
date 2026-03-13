"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Text } from "@/components/atoms/Text";
import { Button } from "@/components/atoms/Button/Button";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  type: string;
}

interface AuditRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  agentId: string | null;
  userId: string | null;
  payload: unknown;
  createdAt: string;
  [key: string]: unknown;
}

interface DetailResponse {
  record: AuditRecord;
  config: {
    columns: ColumnDef[];
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ENTITY_LINK_MAP: Record<string, string> = {
  Agent: "/admin/agents",
  Pipeline: "/admin/pipelines",
  Approval: "/admin/approvals",
  User: "/admin/users",
  Project: "/admin/projects",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AuditLogDetailPage(): ReactNode {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [record, setRecord] = useState<AuditRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const res = await fetch(`/api/admin/audit-logs/${id}`);
        const json = (await res.json()) as { success: boolean; data: DetailResponse };
        if (json.success) {
          setRecord(json.data.record as AuditRecord);
        } else {
          setError("Audit log entry not found");
        }
      } catch {
        setError("Failed to load audit log entry");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (error !== null || record === null) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {error ?? "Audit log entry not found"}
      </div>
    );
  }

  const entityLinkBase = ENTITY_LINK_MAP[record.entityType];

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function renderEntityLink(entityType: string, entityId: string): ReactNode {
    const base = ENTITY_LINK_MAP[entityType];
    if (base !== undefined) {
      return (
        <a
          href={`${base}/${entityId}`}
          className="text-primary underline hover:text-primary/80"
        >
          {entityId}
        </a>
      );
    }
    return <span className="text-foreground">{entityId}</span>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Text variant="h2" as="h2">
          Audit Log Detail
        </Text>
        <Button variant="ghost" onClick={() => router.push("/admin/audit-logs")}>
          Back to Audit Logs
        </Button>
      </div>

      {/* ── Metadata Section ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <Text variant="h4" as="h3" className="mb-4">
          Metadata
        </Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Action</span>
            <div className="text-sm text-foreground">{record.action}</div>
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Entity Type</span>
            <div className="text-sm text-foreground">{record.entityType}</div>
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Entity ID</span>
            <div className="text-sm">{renderEntityLink(record.entityType, record.entityId)}</div>
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Agent ID</span>
            <div className="text-sm">
              {record.agentId !== null ? (
                <a
                  href={`/admin/agents/${record.agentId}`}
                  className="text-primary underline hover:text-primary/80"
                >
                  {record.agentId}
                </a>
              ) : (
                <span className="text-muted-foreground">&mdash;</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">User ID</span>
            <div className="text-sm">
              {record.userId !== null ? (
                <a
                  href={`/admin/users/${record.userId}`}
                  className="text-primary underline hover:text-primary/80"
                >
                  {record.userId}
                </a>
              ) : (
                <span className="text-muted-foreground">&mdash;</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Created</span>
            <div className="text-sm text-foreground">{formatDate(record.createdAt)}</div>
          </div>
        </div>
      </div>

      {/* ── Payload Section ──────────────────────────────────────────────── */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6">
        <Text variant="h4" as="h3" className="mb-4">
          Payload
        </Text>
        {record.payload !== null && record.payload !== undefined ? (
          <pre className="overflow-x-auto rounded bg-surface-secondary p-4 text-sm font-mono">
            {JSON.stringify(record.payload, null, 2)}
          </pre>
        ) : (
          <div className="text-sm text-muted-foreground">No payload data</div>
        )}
      </div>

      {/* ── Entity Quick Link ────────────────────────────────────────────── */}
      {entityLinkBase !== undefined && (
        <div className="mt-6">
          <Button
            variant="secondary"
            onClick={() => router.push(`${entityLinkBase}/${record.entityId}`)}
          >
            View {record.entityType} Record
          </Button>
        </div>
      )}
    </div>
  );
}
