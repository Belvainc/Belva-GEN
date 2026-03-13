import { prisma } from "@/server/db/client";
import type { ModelConfig, ListParams, ListResult } from "./types";


// ─── Admin Model Registry ──────────────────────────────────────────────────────
// Maps model names to configurations and Prisma delegates.
// Enables generic CRUD operations via /api/admin/[model] routes.

const models: Map<string, ModelConfig> = new Map();

// ─── Model Configurations ──────────────────────────────────────────────────────

const userConfig: ModelConfig = {
  name: "User",
  pluralName: "Users",
  slug: "users",
  defaultSort: { field: "createdAt", direction: "desc" },
  searchableFields: ["email", "name"],
  columns: [
    { key: "id", label: "ID", type: "uuid", inList: true, readOnly: true },
    { key: "email", label: "Email", type: "email", inList: true, sortable: true, searchable: true, inCreate: true, inEdit: true },
    { key: "name", label: "Name", type: "string", inList: true, sortable: true, searchable: true, inCreate: true, inEdit: true },
    { key: "role", label: "Role", type: "enum", enumValues: ["USER", "ADMIN"], inList: true, sortable: true, filterable: true, inCreate: true, inEdit: true },
    { key: "status", label: "Status", type: "enum", enumValues: ["ACTIVE", "DEACTIVATED"], inList: true, sortable: true, filterable: true, inEdit: true },
    { key: "createdAt", label: "Created", type: "datetime", inList: true, sortable: true, readOnly: true },
  ],
};

const projectConfig: ModelConfig = {
  name: "Project",
  pluralName: "Projects",
  slug: "projects",
  defaultSort: { field: "createdAt", direction: "desc" },
  searchableFields: ["name", "slug"],
  columns: [
    { key: "id", label: "ID", type: "uuid", inList: true, readOnly: true },
    { key: "name", label: "Name", type: "string", inList: true, sortable: true, searchable: true, inCreate: true, inEdit: true },
    { key: "slug", label: "Slug", type: "string", inList: true, sortable: true, inCreate: true },
    { key: "description", label: "Description", type: "text", inCreate: true, inEdit: true },
    { key: "jiraProjectKey", label: "Jira Key", type: "string", inList: true, inCreate: true, inEdit: true },
    { key: "githubRepo", label: "GitHub Repo", type: "string", inList: true, inCreate: true, inEdit: true },
    { key: "createdAt", label: "Created", type: "datetime", inList: true, sortable: true, readOnly: true },
  ],
};

const agentConfig: ModelConfig = {
  name: "Agent",
  pluralName: "Agents",
  slug: "agents",
  defaultSort: { field: "createdAt", direction: "desc" },
  searchableFields: ["id", "name"],
  columns: [
    { key: "id", label: "ID", type: "string", inList: true, readOnly: true },
    { key: "name", label: "Name", type: "string", inList: true, sortable: true, searchable: true },
    { key: "role", label: "Role", type: "string", inList: true, sortable: true },
    { key: "status", label: "Status", type: "enum", enumValues: ["IDLE", "BUSY", "ERROR", "OFFLINE"], inList: true, sortable: true, filterable: true },
    { key: "preferredModel", label: "Model", type: "string", inList: true, inEdit: true },
    { key: "isActive", label: "Active", type: "boolean", inList: true, filterable: true, inEdit: true },
    { key: "currentTask", label: "Current Task", type: "string", inList: true },
    { key: "lastHeartbeat", label: "Last Heartbeat", type: "datetime", inList: true, sortable: true, readOnly: true },
  ],
};

const systemConfigConfig: ModelConfig = {
  name: "SystemConfig",
  pluralName: "System Config",
  slug: "system-config",
  defaultSort: { field: "updatedAt", direction: "desc" },
  searchableFields: ["key"],
  columns: [
    { key: "id", label: "ID", type: "uuid", inList: false, readOnly: true },
    { key: "key", label: "Key", type: "string", inList: true, sortable: true, searchable: true, inCreate: true },
    { key: "value", label: "Value", type: "json", inList: true, inCreate: true, inEdit: true },
    { key: "updatedBy", label: "Updated By", type: "string", inList: true },
    { key: "updatedAt", label: "Updated", type: "datetime", inList: true, sortable: true, readOnly: true },
  ],
};

const pipelineConfig: ModelConfig = {
  name: "Pipeline",
  pluralName: "Pipelines",
  slug: "pipelines",
  defaultSort: { field: "createdAt", direction: "desc" },
  searchableFields: ["epicKey"],
  columns: [
    { key: "id", label: "ID", type: "uuid", inList: true, readOnly: true },
    { key: "epicKey", label: "Epic Key", type: "string", inList: true, sortable: true, searchable: true },
    { key: "status", label: "Status", type: "enum", enumValues: ["FUNNEL", "REFINEMENT", "APPROVED", "IN_PROGRESS", "REVIEW", "DONE"], inList: true, sortable: true, filterable: true },
    { key: "revisionCount", label: "Revisions", type: "number", inList: true, sortable: true },
    { key: "createdAt", label: "Created", type: "datetime", inList: true, sortable: true, readOnly: true },
  ],
};

const approvalConfig: ModelConfig = {
  name: "Approval",
  pluralName: "Approvals",
  slug: "approvals",
  defaultSort: { field: "createdAt", direction: "desc" },
  searchableFields: ["requestedBy"],
  columns: [
    { key: "id", label: "ID", type: "uuid", inList: true, readOnly: true },
    { key: "type", label: "Type", type: "enum", enumValues: ["CODE_REVIEW", "DEPLOY", "RISK", "PLAN"], inList: true, sortable: true, filterable: true },
    { key: "status", label: "Status", type: "enum", enumValues: ["PENDING", "APPROVED", "REJECTED", "EXPIRED"], inList: true, sortable: true, filterable: true },
    { key: "requestedBy", label: "Requested By", type: "string", inList: true },
    { key: "riskLevel", label: "Risk", type: "string", inList: true },
    { key: "createdAt", label: "Created", type: "datetime", inList: true, sortable: true, readOnly: true },
  ],
};

const auditLogConfig: ModelConfig = {
  name: "AuditLog",
  pluralName: "Audit Logs",
  slug: "audit-logs",
  defaultSort: { field: "createdAt", direction: "desc" },
  searchableFields: ["action", "entityType", "entityId"],
  columns: [
    { key: "id", label: "ID", type: "uuid", inList: true, readOnly: true },
    { key: "action", label: "Action", type: "string", inList: true, sortable: true, searchable: true },
    { key: "entityType", label: "Entity Type", type: "string", inList: true, sortable: true, filterable: true },
    { key: "entityId", label: "Entity ID", type: "string", inList: true },
    { key: "agentId", label: "Agent", type: "string", inList: true },
    { key: "userId", label: "User", type: "string", inList: true },
    { key: "createdAt", label: "Created", type: "datetime", inList: true, sortable: true, readOnly: true },
  ],
};

// ─── Register all models ───────────────────────────────────────────────────────

models.set("users", userConfig);
models.set("projects", projectConfig);
models.set("agents", agentConfig);
models.set("pipelines", pipelineConfig);
models.set("approvals", approvalConfig);
models.set("audit-logs", auditLogConfig);
models.set("system-config", systemConfigConfig);

// ─── Registry API ──────────────────────────────────────────────────────────────

export function getModelConfig(slug: string): ModelConfig | undefined {
  return models.get(slug);
}

export function getAllModelConfigs(): ModelConfig[] {
  return Array.from(models.values());
}

/**
 * Get the Prisma delegate for a model slug.
 * Returns the delegate and model name for dynamic operations.
 */
function getPrismaDelegate(slug: string): string | null {
  const map: Record<string, string> = {
    users: "User",
    projects: "Project",
    agents: "Agent",
    pipelines: "Pipeline",
    approvals: "Approval",
    "audit-logs": "AuditLog",
    "system-config": "SystemConfig",
  };
  return map[slug] ?? null;
}

/**
 * Generic list operation for any registered model.
 */
export async function listRecords(
  slug: string,
  params: ListParams
): Promise<ListResult<Record<string, unknown>>> {
  const config = getModelConfig(slug);
  const modelName = getPrismaDelegate(slug);
  if (config === undefined || modelName === null) {
    throw new Error(`Unknown model: ${slug}`);
  }

  const sortField = params.sort ?? config.defaultSort.field;
  const sortDir = params.direction ?? config.defaultSort.direction;
  const skip = (params.page - 1) * params.limit;

  // Build search filter
  const where: Record<string, unknown> = {};
  if (params.search !== undefined && params.search.length > 0) {
    where.OR = config.searchableFields.map((field) => ({
      [field]: { contains: params.search, mode: "insensitive" },
    }));
  }

  // Use dynamic Prisma client access
  const delegate = ((prisma as unknown as Record<string, unknown>))[
    modelName.charAt(0).toLowerCase() + modelName.slice(1)
  ] as {
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };

  const [data, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip,
      take: params.limit,
    }),
    delegate.count({ where }),
  ]);

  return {
    data,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}

/**
 * Get a single record by ID.
 */
export async function getRecord(
  slug: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const modelName = getPrismaDelegate(slug);
  if (modelName === null) {
    throw new Error(`Unknown model: ${slug}`);
  }

  const delegate = ((prisma as unknown as Record<string, unknown>))[
    modelName.charAt(0).toLowerCase() + modelName.slice(1)
  ] as {
    findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  };

  return delegate.findUnique({ where: { id } });
}

/**
 * Create a new record.
 */
export async function createRecord(
  slug: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const modelName = getPrismaDelegate(slug);
  if (modelName === null) {
    throw new Error(`Unknown model: ${slug}`);
  }

  const delegate = ((prisma as unknown as Record<string, unknown>))[
    modelName.charAt(0).toLowerCase() + modelName.slice(1)
  ] as {
    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };

  return delegate.create({ data });
}

/**
 * Update a record by ID.
 */
export async function updateRecord(
  slug: string,
  id: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const modelName = getPrismaDelegate(slug);
  if (modelName === null) {
    throw new Error(`Unknown model: ${slug}`);
  }

  const delegate = ((prisma as unknown as Record<string, unknown>))[
    modelName.charAt(0).toLowerCase() + modelName.slice(1)
  ] as {
    update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };

  return delegate.update({ where: { id }, data });
}

/**
 * Delete a record by ID.
 */
export async function deleteRecord(
  slug: string,
  id: string
): Promise<void> {
  const modelName = getPrismaDelegate(slug);
  if (modelName === null) {
    throw new Error(`Unknown model: ${slug}`);
  }

  const delegate = ((prisma as unknown as Record<string, unknown>))[
    modelName.charAt(0).toLowerCase() + modelName.slice(1)
  ] as {
    delete: (args: Record<string, unknown>) => Promise<unknown>;
  };

  await delegate.delete({ where: { id } });
}

/**
 * Get record counts for each model (admin dashboard overview).
 */
export async function getModelCounts(): Promise<Record<string, number>> {
  const [users, projects, agents, pipelines, approvals, auditLogs, systemConfig] =
    await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.agent.count(),
      prisma.pipeline.count(),
      prisma.approval.count(),
      prisma.auditLog.count(),
      prisma.systemConfig.count(),
    ]);

  return { users, projects, agents, pipelines, approvals, "audit-logs": auditLogs, "system-config": systemConfig };
}
