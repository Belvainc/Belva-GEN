import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getEnv } from "@/server/config/env";
import { TaskGraphSchema, type TaskGraph } from "./task-graph";
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { BDDScenario } from "@/server/services/bdd-verification";
import { withRetry } from "@/server/lib/retry";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "decomposer" });

// ─── Decomposition Input ────────────────────────────────────────────────────

export interface DecompositionInput {
  ticket: JiraTicket;
  scenarios: BDDScenario[];
  projectStructure: string;
}

// ─── Epic Story (from LLM decomposition) ────────────────────────────────────

const EpicTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  taskType: z.enum([
    "backend",
    "frontend",
    "testing",
    "documentation",
    "orchestration",
  ]),
  dependsOn: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  estimatedPoints: z.number().int().min(1).max(8),
});

const EpicStorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string()),
  storyPoints: z.number().int().min(1).max(13),
  tasks: z.array(EpicTaskSchema),
});
export type EpicStory = z.infer<typeof EpicStorySchema>;

const EpicDecompositionResponseSchema = z.object({
  stories: z.array(EpicStorySchema),
  riskAreas: z.array(z.string()),
});

// ─── Feature Decomposition ──────────────────────────────────────────────────

/**
 * Decompose a feature ticket into a TaskGraph using Claude API.
 */
export async function decomposeFeature(
  input: DecompositionInput,
  signal?: AbortSignal
): Promise<TaskGraph> {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY required for feature decomposition"
    );
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const prompt = buildFeatureDecompositionPrompt(input);

  const responseText = await withRetry(
    async () => {
      signal?.throwIfAborted();
      const msg = await client.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      const textBlock = msg.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }
      return textBlock.text;
    },
    { maxAttempts: 3, baseDelayMs: 1000, signal }
  );

  // Extract JSON (may be wrapped in markdown code block)
  const jsonStr = extractJson(responseText);
  const rawGraph: unknown = JSON.parse(jsonStr);

  const graph = TaskGraphSchema.parse({
    ...(rawGraph as Record<string, unknown>),
    ticketRef: input.ticket.key,
  });

  logger.info(
    {
      ticketRef: input.ticket.key,
      taskCount: graph.nodes.length,
      totalPoints: graph.totalEstimatedPoints,
    },
    "Feature decomposed into task graph"
  );

  return graph;
}

// ─── Epic Decomposition ─────────────────────────────────────────────────────

/**
 * Decompose an epic into stories with tasks, returning both
 * the story list and a unified TaskGraph for execution.
 */
export async function decomposeEpic(
  ticket: JiraTicket,
  projectStructure: string,
  signal?: AbortSignal
): Promise<{ stories: EpicStory[]; taskGraph: TaskGraph }> {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY required for epic decomposition");
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const prompt = buildEpicDecompositionPrompt(ticket, projectStructure);

  const responseText = await withRetry(
    async () => {
      signal?.throwIfAborted();
      const msg = await client.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });
      const textBlock = msg.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }
      return textBlock.text;
    },
    { maxAttempts: 3, baseDelayMs: 1000, signal }
  );

  const jsonStr = extractJson(responseText);
  const raw: unknown = JSON.parse(jsonStr);
  const parsed = EpicDecompositionResponseSchema.parse(raw);

  // Build unified task graph from all story tasks
  const allNodes = parsed.stories.flatMap((story) =>
    story.tasks.map((task) => ({
      ...task,
      id: `${story.id}-${task.id}`,
      dependsOn: task.dependsOn.map((dep) =>
        dep.includes("-") ? dep : `${story.id}-${dep}`
      ),
    }))
  );

  const taskGraph = TaskGraphSchema.parse({
    ticketRef: ticket.key,
    nodes: allNodes,
    totalEstimatedPoints: parsed.stories.reduce(
      (sum, s) => sum + s.storyPoints,
      0
    ),
    riskAreas: parsed.riskAreas,
  });

  logger.info(
    {
      ticketRef: ticket.key,
      storyCount: parsed.stories.length,
      taskCount: allNodes.length,
      totalPoints: taskGraph.totalEstimatedPoints,
    },
    "Epic decomposed into stories and task graph"
  );

  return { stories: parsed.stories, taskGraph };
}

// ─── JSON Extraction ────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match?.[1]?.trim() ?? text.trim();
}

// ─── Prompt Builders ────────────────────────────────────────────────────────

function buildFeatureDecompositionPrompt(
  input: DecompositionInput
): string {
  const { ticket, scenarios, projectStructure } = input;
  const parts = [
    "You are decomposing a feature ticket into implementation tasks.",
    "",
    "## Feature",
    `- Key: ${ticket.key}`,
    `- Title: ${ticket.summary}`,
    `- Description: ${ticket.description}`,
    `- Story Points: ${ticket.storyPoints ?? "unknown"}`,
    "",
    "## BDD Scenarios",
  ];

  for (const s of scenarios) {
    parts.push(
      `### ${s.title}`,
      `- Given: ${s.given.join("; ")}`,
      `- When: ${s.when.join("; ")}`,
      `- Then: ${s.then.join("; ")}`,
      ""
    );
  }

  parts.push(
    "## Project Structure",
    projectStructure,
    "",
    "## Available Agents",
    "- node-backend: Node.js, APIs, database, queues, MCP integrations",
    "- next-ux: React, Next.js, Tailwind, dashboard UI",
    "- ts-testing: Jest, Playwright, coverage",
    "",
    "## Instructions",
    "1. Break down this feature into 2-8 discrete implementation tasks",
    "2. Each task should be a single focused PR",
    "3. Identify dependencies between tasks",
    "4. Assign taskType: backend, frontend, testing, or documentation",
    "5. List affected files for each task",
    "6. Estimate points per task (1, 2, 3, 5, or 8)",
    "7. Identify risk areas",
    "",
    "## Output Format",
    "Return ONLY valid JSON:",
    "{",
    '  "nodes": [{ "id": "task-1", "title": "...", "description": "...", "taskType": "backend", "dependsOn": [], "affectedFiles": ["src/..."], "estimatedPoints": 3 }],',
    '  "totalEstimatedPoints": 8,',
    '  "riskAreas": ["..."]',
    "}"
  );

  return parts.join("\n");
}

function buildEpicDecompositionPrompt(
  ticket: JiraTicket,
  projectStructure: string
): string {
  return [
    "You are a product owner decomposing an epic into user stories with implementation tasks.",
    "",
    "## Epic",
    `- Key: ${ticket.key}`,
    `- Title: ${ticket.summary}`,
    `- Description: ${ticket.description}`,
    `- Total Points: ${ticket.storyPoints ?? 40}`,
    "",
    "## Project Structure",
    projectStructure,
    "",
    "## Available Agents",
    "- node-backend: Node.js, APIs, database, queues, MCP integrations",
    "- next-ux: React, Next.js, Tailwind, dashboard UI",
    "- ts-testing: Jest, Playwright, coverage",
    "",
    "## Instructions",
    "1. Decompose into 5-15 user stories",
    "2. Each story gets BDD acceptance criteria",
    "3. Each story is broken into 2-5 implementation tasks",
    "4. Estimate story points (1, 2, 3, 5, 8, or 13 per story)",
    "5. Identify inter-story dependencies",
    "6. Identify risk areas",
    "",
    "## Output Format",
    "Return ONLY valid JSON:",
    "{",
    '  "stories": [{ "id": "story-1", "title": "...", "description": "...", "acceptanceCriteria": ["..."], "storyPoints": 5, "tasks": [{ "id": "task-1", "title": "...", "description": "...", "taskType": "backend", "dependsOn": [], "affectedFiles": ["src/..."], "estimatedPoints": 2 }] }],',
    '  "riskAreas": ["..."]',
    "}",
  ].join("\n");
}
