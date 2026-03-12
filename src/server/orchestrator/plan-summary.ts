import crypto from "node:crypto";
import type { AgentId } from "@/types/agent-protocol";
import type { DecompositionResult, TaskGraph, TaskNode } from "./types";

// ─── Plan Summary Types ───────────────────────────────────────────────────────

export interface AgentAssignment {
  agentId: AgentId;
  taskCount: number;
  points: number;
}

export interface PlanSummary {
  ticketRef: string;
  title: string;
  summary: string;           // Human-readable description
  taskCount: number;
  estimatedPoints: number;
  affectedFiles: string[];
  riskAreas: string[];
  riskLevel: "low" | "medium" | "high";
  dependencyGraph: string;   // Mermaid diagram representation
  planHash: string;          // SHA-256 for audit integrity
  agentAssignments: AgentAssignment[];
}

// ─── Risk Level Calculation ───────────────────────────────────────────────────

/**
 * Calculate risk level based on decomposition metrics.
 * High: >3 risk areas OR >13 points
 * Medium: >1 risk areas OR >5 points
 * Low: otherwise
 */
export function calculateRiskLevel(
  decomposition: DecompositionResult
): "low" | "medium" | "high" {
  const { riskAreas, totalEstimatedPoints } = decomposition;

  if (riskAreas.length > 3 || totalEstimatedPoints > 13) {
    return "high";
  }
  if (riskAreas.length > 1 || totalEstimatedPoints > 5) {
    return "medium";
  }
  return "low";
}

// ─── Dependency Graph Rendering ───────────────────────────────────────────────

/**
 * Render task graph as Mermaid flowchart syntax.
 * Creates a top-down dependency diagram.
 */
export function renderDependencyGraph(graph: TaskGraph): string {
  const lines = ["graph TD"];

  for (const node of graph.nodes) {
    // Escape quotes and truncate long titles
    const safeTitle = escapeTitle(node.title);
    lines.push(`  ${node.taskId}["${safeTitle}"]`);

    // Add dependency edges
    for (const depId of node.dependsOn) {
      lines.push(`  ${depId} --> ${node.taskId}`);
    }
  }

  return lines.join("\n");
}

/**
 * Escape and truncate title for Mermaid diagram.
 */
function escapeTitle(title: string): string {
  return title
    .replace(/"/g, "'")
    .replace(/\n/g, " ")
    .slice(0, 40)
    + (title.length > 40 ? "..." : "");
}

// ─── Agent Assignment Calculation ─────────────────────────────────────────────

/**
 * Calculate agent assignments from task graph.
 * Groups tasks by agent and sums points.
 */
export function calculateAgentAssignments(
  graph: TaskGraph,
  resolveAgent: (taskType: TaskNode["taskType"]) => AgentId
): AgentAssignment[] {
  const assignmentMap = new Map<AgentId, { taskCount: number; points: number }>();

  for (const node of graph.nodes) {
    const agentId = resolveAgent(node.taskType);
    const current = assignmentMap.get(agentId) ?? { taskCount: 0, points: 0 };
    assignmentMap.set(agentId, {
      taskCount: current.taskCount + 1,
      points: current.points + node.estimatedPoints,
    });
  }

  return Array.from(assignmentMap.entries()).map(([agentId, data]) => ({
    agentId,
    taskCount: data.taskCount,
    points: data.points,
  }));
}

// ─── Summary Text Generation ──────────────────────────────────────────────────

/**
 * Build human-readable summary text from decomposition.
 */
function buildSummaryText(
  ticketRef: string,
  title: string,
  decomposition: DecompositionResult,
  agentAssignments: AgentAssignment[]
): string {
  const { graph, totalEstimatedPoints, riskAreas, affectedFiles } = decomposition;

  const lines: string[] = [
    `# Implementation Plan: ${ticketRef}`,
    "",
    `**${title}**`,
    "",
    "## Overview",
    `- **Tasks:** ${graph.nodes.length}`,
    `- **Estimated Points:** ${totalEstimatedPoints}`,
    `- **Files Affected:** ${affectedFiles.length}`,
    "",
    "## Agent Assignments",
    ...agentAssignments.map(
      (a) => `- **${a.agentId}:** ${a.taskCount} task(s), ${a.points} points`
    ),
    "",
    "## Tasks",
    ...graph.nodes.map(
      (node) =>
        `- [${node.taskId}] ${node.title} (${node.estimatedPoints}pt, ${node.taskType})`
    ),
  ];

  if (riskAreas.length > 0) {
    lines.push("", "## Risk Areas", ...riskAreas.map((r) => `- ${r}`));
  }

  if (affectedFiles.length > 0) {
    lines.push(
      "",
      "## Affected Files",
      ...affectedFiles.slice(0, 20).map((f) => `- ${f}`),
      ...(affectedFiles.length > 20 ? [`... and ${affectedFiles.length - 20} more`] : [])
    );
  }

  return lines.join("\n");
}

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * Generate a complete plan summary from decomposition result.
 * Creates human-readable summary, dependency graph, and integrity hash.
 */
export function generatePlanSummary(
  ticketRef: string,
  title: string,
  decomposition: DecompositionResult,
  resolveAgent: (taskType: TaskNode["taskType"]) => AgentId
): PlanSummary {
  const { graph, totalEstimatedPoints, riskAreas, affectedFiles } = decomposition;

  const riskLevel = calculateRiskLevel(decomposition);
  const dependencyGraph = renderDependencyGraph(graph);
  const agentAssignments = calculateAgentAssignments(graph, resolveAgent);

  const summary = buildSummaryText(ticketRef, title, decomposition, agentAssignments);

  // Generate SHA-256 hash of summary for audit integrity
  const planHash = crypto.createHash("sha256").update(summary).digest("hex");

  return {
    ticketRef,
    title,
    summary,
    taskCount: graph.nodes.length,
    estimatedPoints: totalEstimatedPoints,
    affectedFiles,
    riskAreas,
    riskLevel,
    dependencyGraph,
    planHash,
    agentAssignments,
  };
}
