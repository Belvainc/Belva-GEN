import type { DecompositionResult } from "@/server/orchestrator/types";
import type { ReviewVerdict } from "@/types/review";
import type { CreateKnowledgeEntryInput } from "./knowledge-store";
import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaskResult {
  taskId: string;
  agentId: string;
  success: boolean;
  retried: boolean;
  changedFiles: string[];
  summary: string;
}

// ─── Pattern Extraction ─────────────────────────────────────────────────────

/**
 * Extract knowledge patterns from a completed pipeline.
 *
 * Analyses task results and review verdict to identify:
 * - Successful architecture decisions (cross-boundary changes)
 * - Common gotchas (tasks that failed then succeeded after retry)
 * - Performance optimizations (tasks under budget)
 * - Key decisions from the decomposition
 */
export function extractPatterns(
  ticketRef: string,
  taskResults: TaskResult[],
  decomposition: DecompositionResult,
  reviewVerdict?: ReviewVerdict
): CreateKnowledgeEntryInput[] {
  const entries: CreateKnowledgeEntryInput[] = [];

  logger.info(`Extracting patterns from ${ticketRef}`, {
    taskCount: taskResults.length,
    hasReviewVerdict: reviewVerdict !== undefined,
  });

  // Extract retry gotchas
  const retriedTasks = taskResults.filter((t) => t.retried && t.success);
  for (const task of retriedTasks) {
    entries.push({
      category: "GOTCHA",
      title: `Retry required: ${task.taskId}`,
      content: `Task ${task.taskId} (agent: ${task.agentId}) required retry before succeeding. Files: ${task.changedFiles.join(", ")}. Summary: ${task.summary}`,
      sourceTicketRef: ticketRef,
      confidence: 0.4,
    });
  }

  // Extract cross-boundary decisions
  const crossBoundaryFiles = detectCrossBoundaryChanges(taskResults);
  if (crossBoundaryFiles.length > 0) {
    entries.push({
      category: "DECISION",
      title: `Cross-boundary changes in ${ticketRef}`,
      content: `This ticket required changes spanning multiple domains: ${crossBoundaryFiles.join(", ")}. Total tasks: ${taskResults.length}, estimated points: ${decomposition.totalEstimatedPoints}.`,
      sourceTicketRef: ticketRef,
      confidence: 0.6,
    });
  }

  // Extract patterns from review findings
  if (reviewVerdict !== undefined && reviewVerdict.findings.length > 0) {
    const errorFindings = reviewVerdict.findings.filter(
      (f) => f.severity === "error" && !f.falsePositive
    );
    if (errorFindings.length > 0) {
      entries.push({
        category: "GOTCHA",
        title: `Review findings in ${ticketRef}`,
        content: `Review found ${errorFindings.length} error(s): ${errorFindings.map((f) => `${f.rule} in ${f.file}: ${f.description}`).join("; ")}`,
        sourceTicketRef: ticketRef,
        confidence: 0.7,
      });
    }
  }

  // Extract successful optimization patterns
  const allSuccessful = taskResults.every((t) => t.success);
  if (allSuccessful && taskResults.length >= 3) {
    entries.push({
      category: "PATTERN",
      title: `Successful decomposition: ${ticketRef}`,
      content: `All ${taskResults.length} tasks completed successfully. Decomposition into ${decomposition.graph.nodes.length} nodes with ${decomposition.totalEstimatedPoints} points worked well. Risk areas: ${decomposition.riskAreas.join(", ") || "none"}.`,
      sourceTicketRef: ticketRef,
      confidence: 0.5,
    });
  }

  logger.info(`Extracted ${entries.length} patterns from ${ticketRef}`);
  return entries;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DOMAIN_PREFIXES = [
  "src/server/",
  "src/components/",
  "src/app/",
  "prisma/",
  "__tests__/",
  "e2e/",
];

/**
 * Detect files that span multiple domain boundaries.
 */
function detectCrossBoundaryChanges(taskResults: TaskResult[]): string[] {
  const allFiles = taskResults.flatMap((t) => t.changedFiles);
  const domains = new Set<string>();

  for (const file of allFiles) {
    for (const prefix of DOMAIN_PREFIXES) {
      if (file.startsWith(prefix)) {
        domains.add(prefix);
        break;
      }
    }
  }

  // Cross-boundary if changes span 3+ domains
  if (domains.size >= 3) {
    return [...domains];
  }
  return [];
}
