import { z } from "zod";
import type { JiraTicket } from "@/server/mcp/jira/types";
import {
  TaskGraphSchema,
  DecompositionResultSchema,
  TaskNodeSchema,
  type DecompositionResult,
  type TaskGraph,
} from "./types";
import { getLLMClient } from "@/server/llm";
import { createChildLogger } from "@/server/config/logger";
import { ValidationError } from "@/lib/errors";

const logger = createChildLogger({ module: "decompose" });

// ─── LLM Response Schema ──────────────────────────────────────────────────────

const LLMDecompositionResponseSchema = z.object({
  tasks: z.array(
    z.object({
      taskId: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      taskType: z.enum(["backend", "frontend", "testing", "documentation", "orchestration"]),
      estimatedPoints: z.number().int().min(1).max(13),
      dependsOn: z.array(z.string()),
    })
  ),
  riskAreas: z.array(z.string()),
  affectedFiles: z.array(z.string()),
});

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert software architect specializing in task decomposition for autonomous development agents.

Your role is to analyze Jira tickets and break them down into discrete, implementable sub-tasks that can be executed by specialized agents:
- **backend**: Node.js/TypeScript backend tasks (APIs, database, services, infrastructure)
- **frontend**: React/Next.js frontend tasks (components, pages, styling)
- **testing**: Jest/Playwright test tasks (unit tests, integration tests, E2E tests)
- **documentation**: Documentation tasks (READMEs, comments, API docs)
- **orchestration**: Meta-tasks that coordinate other work

Guidelines:
1. Each task must be small enough to complete in one focused session (1-3 story points ideal)
2. Tasks should be independent where possible, with explicit dependencies only when required
3. Testing tasks should depend on the implementation tasks they test
4. Estimate using Fibonacci-like points: 1, 2, 3, 5, 8, 13 (max)
5. Identify risk areas that need human attention or review
6. List all files expected to be modified

Output format: Valid JSON matching the schema provided.`;

// ─── User Prompt Template ─────────────────────────────────────────────────────

function buildUserPrompt(ticket: JiraTicket): string {
  return `Decompose this Jira ticket into implementable sub-tasks:

## Ticket: ${ticket.key}

**Summary:** ${ticket.summary}

**Description:**
${ticket.description || "No description provided."}

**Acceptance Criteria:**
${ticket.acceptanceCriteria || "No acceptance criteria provided."}

**Labels:** ${ticket.labels.join(", ") || "None"}
**Story Points:** ${ticket.storyPoints ?? "Not estimated"}

---

Provide your response as a JSON object with:
- \`tasks\`: Array of task objects with taskId, title, description, taskType, estimatedPoints, dependsOn
- \`riskAreas\`: Array of strings describing potential risks
- \`affectedFiles\`: Array of file paths expected to be modified

Use short, descriptive taskIds like "api-routes", "db-schema", "unit-tests", etc.
Ensure taskIds in dependsOn arrays match actual taskIds.`;
}

// ─── Main Decomposition Function ──────────────────────────────────────────────

/**
 * Decompose a Jira ticket into a task graph using LLM.
 * Returns a validated DecompositionResult with typed tasks.
 *
 * @param ticket - The Jira ticket to decompose
 * @param signal - Optional AbortSignal for cancellation
 * @returns DecompositionResult with task graph, risk areas, and affected files
 * @throws ValidationError if LLM response is invalid
 */
export async function decomposeTicket(
  ticket: JiraTicket,
  signal?: AbortSignal
): Promise<DecompositionResult> {
  logger.info({ ticketKey: ticket.key }, "Starting ticket decomposition");

  const llm = getLLMClient();
  const userPrompt = buildUserPrompt(ticket);

  // Request structured output from LLM
  const response = await llm.completeStructured({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    schema: LLMDecompositionResponseSchema,
    signal,
  });

  // Validate task dependencies (all dependsOn IDs must exist)
  const taskIds = new Set(response.tasks.map((t) => t.taskId));
  for (const task of response.tasks) {
    for (const depId of task.dependsOn) {
      if (!taskIds.has(depId)) {
        throw new ValidationError(
          `Task "${task.taskId}" depends on non-existent task "${depId}"`,
          { task, availableIds: Array.from(taskIds) }
        );
      }
    }
  }

  // Check for circular dependencies
  const hasCycle = detectCycle(response.tasks);
  if (hasCycle) {
    throw new ValidationError("Task graph contains circular dependencies", {
      tasks: response.tasks.map((t) => ({ id: t.taskId, deps: t.dependsOn })),
    });
  }

  // Build task graph
  const graph: TaskGraph = {
    ticketRef: ticket.key,
    nodes: response.tasks.map((t) => TaskNodeSchema.parse(t)),
  };

  // Validate the complete graph
  TaskGraphSchema.parse(graph);

  // Calculate total points
  const totalEstimatedPoints = graph.nodes.reduce(
    (sum, node) => sum + node.estimatedPoints,
    0
  );

  const result: DecompositionResult = {
    graph,
    totalEstimatedPoints,
    riskAreas: response.riskAreas,
    affectedFiles: response.affectedFiles,
  };

  // Final validation
  DecompositionResultSchema.parse(result);

  logger.info(
    {
      ticketKey: ticket.key,
      taskCount: graph.nodes.length,
      totalPoints: totalEstimatedPoints,
      riskCount: result.riskAreas.length,
    },
    "Ticket decomposition complete"
  );

  return result;
}

// ─── Cycle Detection ──────────────────────────────────────────────────────────

interface TaskForCycleCheck {
  taskId: string;
  dependsOn: string[];
}

/**
 * Detect cycles in task dependency graph using DFS.
 */
function detectCycle(tasks: TaskForCycleCheck[]): boolean {
  const taskMap = new Map<string, TaskForCycleCheck>();
  for (const task of tasks) {
    taskMap.set(task.taskId, task);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(taskId: string): boolean {
    visited.add(taskId);
    recursionStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task !== undefined) {
      for (const depId of task.dependsOn) {
        if (!visited.has(depId)) {
          if (dfs(depId)) {
            return true;
          }
        } else if (recursionStack.has(depId)) {
          return true; // Back edge found — cycle detected
        }
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.taskId)) {
      if (dfs(task.taskId)) {
        return true;
      }
    }
  }

  return false;
}

// ─── Topological Sort ─────────────────────────────────────────────────────────

/**
 * Get tasks in topological order (dependencies first).
 * Useful for determining execution order.
 */
export function getTopologicalOrder(graph: TaskGraph): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Initialize
  for (const node of graph.nodes) {
    inDegree.set(node.taskId, node.dependsOn.length);
    adjList.set(node.taskId, []);
  }

  // Build adjacency list (reverse edges for topological sort)
  for (const node of graph.nodes) {
    for (const depId of node.dependsOn) {
      const dependents = adjList.get(depId);
      if (dependents !== undefined) {
        dependents.push(node.taskId);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const result: string[] = [];

  // Start with nodes that have no dependencies
  for (const [taskId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(taskId);
    }
  }

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    result.push(taskId);

    const dependents = adjList.get(taskId) ?? [];
    for (const depId of dependents) {
      const newDegree = (inDegree.get(depId) ?? 0) - 1;
      inDegree.set(depId, newDegree);
      if (newDegree === 0) {
        queue.push(depId);
      }
    }
  }

  return result;
}
