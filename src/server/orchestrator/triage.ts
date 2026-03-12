import { z } from "zod";
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { AgentId, TaskType } from "@/types/agent-protocol";

// ─── Triage Result ──────────────────────────────────────────────────────────

export const TriageResultSchema = z.object({
  pipelineType: z.enum(["bug", "feature", "epic"]),
  complexity: z.enum(["low", "medium", "high"]),
  recommendedAgent: z.string(),
  recommendedTaskType: z.enum([
    "backend",
    "frontend",
    "testing",
    "documentation",
    "orchestration",
  ]),
  bypassPlanningGate: z.boolean(),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

// ─── Triage Logic ───────────────────────────────────────────────────────────

/**
 * Classify a Jira ticket into a pipeline type and recommend an agent.
 * Uses issueType, storyPoints, and labels to determine routing.
 */
export function triageTicket(ticket: JiraTicket): TriageResult {
  const isBug = ticket.issueType.toLowerCase() === "bug";
  const points = ticket.storyPoints ?? 0;
  const hasGEN = ticket.labels.includes("GEN");

  // Low-complexity bugs: auto-fix pipeline, bypass planning gate
  if (isBug && points <= 2 && hasGEN) {
    const { agentId, taskType } = resolveAgentForBug(ticket);
    return {
      pipelineType: "bug",
      complexity: "low",
      recommendedAgent: agentId,
      recommendedTaskType: taskType,
      bypassPlanningGate: true,
    };
  }

  // Medium-complexity bugs: still bug pipeline but needs human review
  if (isBug && points <= 5) {
    const { agentId, taskType } = resolveAgentForBug(ticket);
    return {
      pipelineType: "bug",
      complexity: "medium",
      recommendedAgent: agentId,
      recommendedTaskType: taskType,
      bypassPlanningGate: false,
    };
  }

  // Epics: 40+ points
  if (points >= 40) {
    return {
      pipelineType: "epic",
      complexity: "high",
      recommendedAgent: "orchestrator-project",
      recommendedTaskType: "orchestration",
      bypassPlanningGate: false,
    };
  }

  // Features: everything else
  return {
    pipelineType: "feature",
    complexity: points <= 5 ? "medium" : "high",
    recommendedAgent: "orchestrator-project",
    recommendedTaskType: "orchestration",
    bypassPlanningGate: false,
  };
}

// ─── Agent Resolution ───────────────────────────────────────────────────────

function resolveAgentForBug(
  ticket: JiraTicket
): { agentId: AgentId; taskType: TaskType } {
  const text = `${ticket.summary} ${ticket.description}`.toLowerCase();

  if (
    text.includes("src/server/") ||
    text.includes("api") ||
    text.includes("database") ||
    text.includes("queue") ||
    text.includes("redis")
  ) {
    return { agentId: "node-backend", taskType: "backend" };
  }

  if (
    text.includes("src/components/") ||
    text.includes("dashboard") ||
    text.includes("ui") ||
    text.includes("tailwind") ||
    text.includes("react")
  ) {
    return { agentId: "next-ux", taskType: "frontend" };
  }

  if (
    text.includes("test") ||
    text.includes("coverage") ||
    text.includes("e2e") ||
    text.includes("playwright") ||
    text.includes("jest")
  ) {
    return { agentId: "ts-testing", taskType: "testing" };
  }

  // Default to backend for most bugs
  return { agentId: "node-backend", taskType: "backend" };
}
