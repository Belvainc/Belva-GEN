import { prisma } from "@/server/db/client";
import { getJiraMCPClient } from "@/server/mcp/jira";
import { getOrchestratorEngine } from "@/server/orchestrator";
import { createChildLogger } from "@/server/config/logger";
import { randomUUID } from "node:crypto";
import type { JiraTicket } from "@/server/mcp/jira/types";

const logger = createChildLogger({ module: "jira-sync" });

// ─── Result Type ─────────────────────────────────────────────────────────────

export interface JiraSyncResult {
  totalFound: number;
  upserted: number;
  newPipelines: number;
  errors: string[];
  syncedAt: string;
}

// ─── Core Sync Function ──────────────────────────────────────────────────────

/**
 * Sync Jira tickets for a specific project.
 * - Upserts all project tickets into the JiraIssue table (lightweight refs).
 * - Registers GEN-labeled tickets as pipelines if not already registered.
 */
export async function syncJiraTickets(
  projectId: string
): Promise<JiraSyncResult> {
  const syncedAt = new Date().toISOString();
  const result: JiraSyncResult = {
    totalFound: 0,
    upserted: 0,
    newPipelines: 0,
    errors: [],
    syncedAt,
  };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      slug: true,
      jiraProjectKey: true,
    },
  });

  if (project === null || project.jiraProjectKey === null) {
    logger.info({ projectId }, "Project not found or has no Jira config, skipping sync");
    return result;
  }

  try {
    await syncProjectTickets(project, result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`${project.slug}: ${message}`);
    logger.error(
      { projectId: project.id, error: message },
      "Failed to sync project"
    );

    await prisma.project.update({
      where: { id: project.id },
      data: { jiraSyncStatus: "error" },
    });
  }

  logger.info(
    {
      projectId,
      totalFound: result.totalFound,
      upserted: result.upserted,
      newPipelines: result.newPipelines,
      errors: result.errors.length,
    },
    "Jira sync completed"
  );

  return result;
}

// ─── Per-Project Sync ────────────────────────────────────────────────────────

interface ProjectRef {
  id: string;
  slug: string;
  jiraProjectKey: string | null;
}

async function syncProjectTickets(
  project: ProjectRef,
  result: JiraSyncResult
): Promise<void> {
  const projectKey = project.jiraProjectKey;
  if (projectKey === null) return;

  logger.info({ projectId: project.id, projectKey }, "Starting Jira sync");

  // Mark as syncing
  await prisma.project.update({
    where: { id: project.id },
    data: { jiraSyncStatus: "syncing" },
  });

  // Fetch all tickets from the Jira project
  const jiraClient = getJiraMCPClient();
  const jql = `project = ${projectKey} ORDER BY updated DESC`;
  const tickets = await jiraClient.searchTickets(jql);

  result.totalFound += tickets.length;

  // Upsert each ticket
  for (const ticket of tickets) {
    try {
      await upsertJiraIssue(project.id, ticket);
      result.upserted++;

      // Register GEN-labeled tickets as pipelines
      if (ticket.labels.includes("GEN")) {
        const registered = await registerGenPipeline(project.id, ticket);
        if (registered) {
          result.newPipelines++;
        }
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`${ticket.key}: ${message}`);
      logger.warn(
        { ticketKey: ticket.key, error: message },
        "Failed to sync ticket"
      );
    }
  }

  // Mark sync as successful
  await prisma.project.update({
    where: { id: project.id },
    data: {
      lastJiraSyncAt: new Date(),
      jiraSyncStatus: "success",
    },
  });

  logger.info(
    { projectId: project.id, ticketCount: tickets.length },
    "Project sync completed"
  );
}

// ─── Upsert Jira Issue ──────────────────────────────────────────────────────

async function upsertJiraIssue(
  projectId: string,
  ticket: JiraTicket
): Promise<void> {
  await prisma.jiraIssue.upsert({
    where: {
      projectId_key: { projectId, key: ticket.key },
    },
    update: {
      summary: ticket.summary,
      issueType: ticket.issueType,
      jiraStatus: ticket.status,
      labels: ticket.labels,
      epicKey: ticket.epicKey,
      jiraUpdatedAt: new Date(ticket.updatedAt),
      lastSyncedAt: new Date(),
    },
    create: {
      jiraId: ticket.id,
      key: ticket.key,
      summary: ticket.summary,
      issueType: ticket.issueType,
      jiraStatus: ticket.status,
      labels: ticket.labels,
      epicKey: ticket.epicKey,
      projectId,
      jiraUpdatedAt: new Date(ticket.updatedAt),
    },
  });
}

// ─── Register GEN Pipeline ──────────────────────────────────────────────────

/**
 * Register a GEN-labeled ticket as a pipeline if not already registered.
 * Returns true if a new pipeline was created.
 */
async function registerGenPipeline(
  projectId: string,
  ticket: JiraTicket
): Promise<boolean> {
  const engine = getOrchestratorEngine();

  // Skip if already registered in the engine
  const existing = engine.getEpic(ticket.key);
  if (existing !== undefined) {
    // Link JiraIssue to existing pipeline if not already linked
    const pipeline = await prisma.pipeline.findUnique({
      where: { epicKey: ticket.key },
      select: { id: true },
    });
    if (pipeline !== null) {
      await prisma.jiraIssue.update({
        where: { projectId_key: { projectId, key: ticket.key } },
        data: { pipelineId: pipeline.id },
      });
    }
    return false;
  }

  // Register new epic
  await engine.registerEpic(ticket.key);

  // Transition to refinement (matches webhook behavior)
  await engine.handleEvent({
    kind: "epic-state-transition",
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef: ticket.key,
    fromState: "funnel",
    toState: "refinement",
    reason: "GEN label detected via Jira sync",
  });

  // Link JiraIssue to the new pipeline
  const pipeline = await prisma.pipeline.findUnique({
    where: { epicKey: ticket.key },
    select: { id: true },
  });
  if (pipeline !== null) {
    await prisma.jiraIssue.update({
      where: { projectId_key: { projectId, key: ticket.key } },
      data: { pipelineId: pipeline.id },
    });

    // Set projectId on the pipeline too
    await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { projectId },
    });
  }

  logger.info(
    { ticketKey: ticket.key, projectId },
    "Registered new GEN pipeline via sync"
  );

  return true;
}
