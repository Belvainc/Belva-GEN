# Plan 10: Stages 2 & 3 — Feature & Epic Pipelines

## Overview

Implement the full-scale pipelines for features (3-13 points) and epics (40+ points). Features require BDD verification, LLM-powered task decomposition, human approval, and multi-agent parallel execution. Epics apply full lifecycle governance with decomposition into sub-tickets, parallel coordination, and merge sequencing. This is the capstone plan that delivers the complete autonomous development vision.

## Prerequisites

- All previous plans (01-09) complete
- Bug pipeline validated and working (proves end-to-end flow)
- Agent execution working (`AgentExecutor` interface from Plan 08)
- Dashboard showing pipeline progress (Plans 03/07)
- `@anthropic-ai/sdk` installed (Plan 08)
- `@octokit/rest` installed (Plan 08)
- `TaskDecomposition` Prisma model available (added by user)

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Jira ticket type | `src/server/mcp/jira/types.ts` | `JiraTicket` flat type — `summary`, `storyPoints`, `labels`, `description`, `acceptanceCriteria`, `issueType` (Plan 09 adds this) |
| Agent protocol | `src/types/agent-protocol.ts` | `TaskAssignment` (sourceAgent, targetAgent, taskType, constraints, acceptanceCriteria), `TaskCompletion` |
| Gate types | `src/types/gates.ts` | `GateResult`, `GateViolation`, `Changeset`, `TestResults`, `LintResults`, `SecurityScanResult` |
| Triage | `src/server/orchestrator/triage.ts` | `triageTicket()` classifies bug/feature/epic (Plan 09) |
| Bug pipeline | `src/server/orchestrator/bug-pipeline.ts` | `runBugFixLoop()` — validated pattern (Plan 09) |
| PR service | `src/server/services/pr.service.ts` | `createPullRequest()` via Octokit (Plan 09) |
| Execution types | `src/server/agents/execution/types.ts` | `ExecutionRequest`, `ExecutionResult`, `AgentExecutor` (Plan 08) |
| Prompt composer | `src/server/agents/execution/prompt-composer.ts` | `composeSystemPrompt()` (Plan 08) |
| Orchestrator engine | `src/server/orchestrator/engine.ts` | Handles domain events, routes to bug pipeline (Plan 09) |
| State machine | `src/server/orchestrator/state-machine.ts` | 6-stage lifecycle: funnel → refinement → approved → in-progress → review → done |
| Prisma schema | `prisma/schema.prisma` | `TaskDecomposition` model: `taskGraph` JSON, `totalPoints`, `riskAreas`, `affectedFiles` |
| Approval model | `prisma/schema.prisma` | `Approval` with `planSummary`, `planHash`, `affectedFiles`, `estimatedPoints`, `riskLevel` |
| Epic lifecycle skill | `.github/skills/epic-lifecycle/SKILL.md` | Complete governance rules |
| Story writing skill | `.github/skills/story-writing/SKILL.md` | BDD format definition |
| Human approval flow | Plan 06 | `HumanApprovalRequest`/`HumanApprovalResponse` messages |

## Scope

### In Scope

**Stage 2 — Features (3-13 points):**
- BDD requirement verification (Given/When/Then from `acceptanceCriteria`)
- LLM-powered task decomposition via `@anthropic-ai/sdk`
- Persist decomposition to `TaskDecomposition` Prisma model
- Human approval gate (mandatory — uses `HumanApprovalRequest`)
- Multi-agent parallel execution respecting dependency graph
- One PR per task in the dependency graph
- Merge sequencing via topological sort

**Stage 3 — Epics (40+ points):**
- Full 6-stage lifecycle: funnel → refinement → approved → in-progress → review → done
- LLM-powered epic decomposition into stories + tasks
- Persist decomposition and create Jira sub-tickets
- Parallel agent coordination across sub-tickets
- Dependency-aware scheduling with conflict detection
- Progress tracking persisted to database
- Graceful degradation: pause dependent tasks on failure

### Out of Scope

- Automatic epic creation (epics created by humans in Jira)
- Inter-epic dependencies (one epic at a time per repository)
- Agent performance optimization / cost tracking
- Real-time streaming of agent output to dashboard

## Research Questions — Resolved

### Q1: Epic decomposition LLM prompt context
**Answer:** The LLM needs: (1) Epic description from `JiraTicket.description`, (2) acceptance criteria from `JiraTicket.acceptanceCriteria`, (3) story points from `JiraTicket.storyPoints`, (4) project structure listing from the filesystem, (5) existing agent definitions from `.claude/agents/*.md` to understand agent capabilities. The prompt is built by the decomposition service, not hardcoded.

### Q2: Parallel execution limits
**Answer:** Controlled by two factors: (a) `AgentConfig.capabilities.maxConcurrentTasks` (default 1 per agent, from `src/server/agents/types.ts`), and (b) BullMQ `agent-tasks` queue concurrency (currently 3, from `src/server/queues/index.ts`). The parallel executor must check both before dispatching. Practical limit: 3-4 concurrent tasks across all agents.

### Q3: File conflict detection
**Answer:** Each task in the decomposition graph includes `affectedFiles` (predicted by LLM). Before parallel dispatch, the scheduler checks for overlapping files between tasks at the same dependency level. Overlapping tasks are serialized (run sequentially). This is a static prediction — actual conflicts are caught by git merge at PR time.

### Q4: Rollback mechanism
**Answer:** No automatic rollback of merged PRs. Strategy: (1) Pause dependent tasks when a task fails, (2) Keep independent tasks running, (3) Notify human with failure context via `HumanApprovalRequest`, (4) Allow manual retry or cancellation. Successfully merged PRs stay merged — reverting is a manual human decision per Critical Rule #5.

### Q5: How does decomposition result persist?
**Answer:** The `TaskDecomposition` Prisma model stores `taskGraph` as JSON (serialized `TaskGraph` with nodes and dependencies), `totalPoints`, `riskAreas`, and `affectedFiles`. This is linked to a `Pipeline` via `pipelineId`. The human approval screen reads this to display the plan.

### Q6: How does feature pipeline differ from epic?
**Answer:** Feature (3-13 pts): single `JiraTicket` → decompose into tasks → human approval → parallel execute → merge sequence. Epic (40+ pts): `JiraTicket` epic → decompose into stories → create Jira sub-tickets → each sub-ticket enters its own pipeline (bug or feature) → coordinate across all sub-pipelines → track aggregate progress.

### Q7: What happens during the "Refinement" stage for epics?
**Answer:** Per the state machine, refinement requires a DoR gate. For epics, this means: the epic description is complete, stories have been decomposed, each story has BDD acceptance criteria, and the total estimate is within team capacity. The LLM generates the decomposition, then the orchestrator validates it before requesting human approval for the plan.

## Gaps Identified During Research

| Gap | Resolution |
|-----|------------|
| No `TaskGraph` TypeScript type | Create `src/server/orchestrator/task-graph.ts` with Zod schemas matching `TaskDecomposition.taskGraph` JSON shape |
| No LLM decomposition service | Create `src/server/orchestrator/decomposer.ts` using `@anthropic-ai/sdk` |
| No parallel execution coordinator | Create `src/server/orchestrator/parallel-executor.ts` |
| No merge sequencing utility | Create `src/server/orchestrator/merge-sequencer.ts` with topological sort |
| No progress tracking beyond in-memory | Use `Pipeline` + `PipelineStage` + `TaskDecomposition` Prisma models |
| Orchestrator engine needs feature/epic handlers | Extend `onDoRPass()` and `onPlanApproved()` event handlers |
| `JiraTicket` needs `issueType` field | Resolved in Plan 09 Step 1 |
| Jira MCP client needs `createTicket()` for sub-tickets | Add method to Jira client (or defer to Plan 01 extension) |

## Architecture Decisions

### AD-01: Feature vs Epic thresholds

| Points | Pipeline | Planning Gate | Approval |
|--------|----------|---------------|----------|
| 1-2 (Bug + GEN) | Bug auto-fix (Plan 09) | Bypassed | PR review only |
| 3-13 | Feature | LLM decomposition | Human approval required |
| 14-39 | Feature (extra scrutiny) | LLM decomposition + risk flag | Human approval required |
| 40+ | Epic | Full decomposition into stories | Human approval required |

### AD-02: TaskGraph schema

```typescript
export const TaskNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  taskType: TaskTypeSchema,
  dependsOn: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  estimatedPoints: z.number().int().min(1).max(13),
  agentId: AgentIdSchema.optional(), // Resolved at execution time if not specified
});

export const TaskGraphSchema = z.object({
  ticketRef: z.string().min(1),
  nodes: z.array(TaskNodeSchema),
  totalEstimatedPoints: z.number().int().min(0),
  riskAreas: z.array(z.string()),
});
```

Serialized to `TaskDecomposition.taskGraph` as JSON. Retrieved and parsed with Zod before execution.

### AD-03: PR-per-task strategy

Each task in the dependency graph produces one PR:
- Branch name: `feature/BELVA-XXX-task-N-description` per `git-safety.md`
- Smaller, reviewable changes
- Easier to rollback individual changes
- Merge order determined by topological sort of dependency graph

Exception: Tasks with overlapping `affectedFiles` are grouped into a single PR to prevent conflicts.

### AD-04: Epic sub-ticket creation

When an epic is decomposed, each story becomes a Jira ticket linked to the epic. Stories then enter the feature pipeline independently. The orchestrator tracks aggregate progress across all sub-pipelines via the `Pipeline` + `PipelineStage` Prisma models.

### AD-05: Human approval stores plan for audit

When the decomposition is complete, the plan is stored in the `Approval` model:
- `planSummary`: Human-readable description of the decomposition
- `planHash`: SHA-256 of the serialized `TaskGraph` for integrity
- `affectedFiles`: Union of all `TaskNode.affectedFiles`
- `estimatedPoints`: `TaskGraph.totalEstimatedPoints`
- `riskLevel`: Derived from `TaskGraph.riskAreas`

This ensures the human approves exactly the plan that will execute. Any change requires re-approval.

## Implementation Steps

### Step 1: Define TaskGraph types

**Files:** `src/server/orchestrator/task-graph.ts` (create)

```typescript
import { z } from "zod";
import { AgentIdSchema, TaskTypeSchema } from "@/types/agent-protocol";

export const TaskNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  taskType: TaskTypeSchema,
  dependsOn: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  estimatedPoints: z.number().int().min(1).max(13),
  agentId: AgentIdSchema.optional(),
  status: z.enum(["pending", "active", "completed", "failed", "blocked"]).default("pending"),
});
export type TaskNode = z.infer<typeof TaskNodeSchema>;

export const TaskGraphSchema = z.object({
  ticketRef: z.string().min(1),
  nodes: z.array(TaskNodeSchema),
  totalEstimatedPoints: z.number().int().min(0),
  riskAreas: z.array(z.string()),
});
export type TaskGraph = z.infer<typeof TaskGraphSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function resolveAgentForTask(node: TaskNode): z.infer<typeof AgentIdSchema> {
  if (node.agentId) return node.agentId;
  switch (node.taskType) {
    case "backend": return "node-backend";
    case "frontend": return "next-ux";
    case "testing": return "ts-testing";
    case "orchestration": return "orchestrator-project";
    case "documentation": return "orchestrator-project";
  }
}

export function findReadyNodes(graph: TaskGraph, completed: Set<string>, failed: Set<string>): TaskNode[] {
  return graph.nodes.filter((node) => {
    if (node.status !== "pending") return false;
    if (completed.has(node.id) || failed.has(node.id)) return false;
    const hasFailedDep = node.dependsOn.some((dep) => failed.has(dep));
    if (hasFailedDep) return false;
    return node.dependsOn.every((dep) => completed.has(dep));
  });
}

export function findDependentNodes(nodeId: string, graph: TaskGraph): string[] {
  const dependents: string[] = [];
  for (const node of graph.nodes) {
    if (node.dependsOn.includes(nodeId)) {
      dependents.push(node.id);
      dependents.push(...findDependentNodes(node.id, graph));
    }
  }
  return [...new Set(dependents)];
}

export function topologicalSort(graph: TaskGraph): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (node) {
      for (const depId of node.dependsOn) {
        visit(depId);
      }
    }
    result.push(nodeId);
  }

  for (const node of graph.nodes) {
    visit(node.id);
  }
  return result;
}
```

### Step 2: Create BDD verification service

**Files:** `src/server/services/bdd-verification.ts` (create)

```typescript
import { z } from "zod";
import type { GateViolation } from "@/types/gates";

export const BDDScenarioSchema = z.object({
  title: z.string().min(1),
  given: z.array(z.string()),
  when: z.array(z.string()),
  then: z.array(z.string()),
  isComplete: z.boolean(),
});
export type BDDScenario = z.infer<typeof BDDScenarioSchema>;

export interface BDDVerificationResult {
  passed: boolean;
  scenarios: BDDScenario[];
  violations: GateViolation[];
}

export function verifyBDDRequirements(acceptanceCriteria: string): BDDVerificationResult {
  const scenarios = parseBDDScenarios(acceptanceCriteria);
  const violations: GateViolation[] = [];

  if (scenarios.length === 0) {
    violations.push({
      rule: "bdd-no-scenarios",
      description: "No BDD scenarios found in acceptance criteria",
      severity: "error",
    });
  }

  for (const scenario of scenarios) {
    if (!scenario.isComplete) {
      violations.push({
        rule: "bdd-incomplete-scenario",
        description: `Scenario "${scenario.title}" is missing Given/When/Then`,
        severity: "error",
      });
    }
  }

  return {
    passed: violations.filter((v) => v.severity === "error").length === 0,
    scenarios,
    violations,
  };
}

function parseBDDScenarios(text: string): BDDScenario[] {
  const scenarios: BDDScenario[] = [];
  const scenarioBlocks = text.split(/(?=Scenario:)/i).filter((s) => s.trim());

  for (const block of scenarioBlocks) {
    const titleMatch = block.match(/Scenario:\s*(.+)/i);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const given = extractSteps(block, "Given");
    const when = extractSteps(block, "When");
    const then = extractSteps(block, "Then");

    scenarios.push({
      title,
      given,
      when,
      then,
      isComplete: given.length > 0 && when.length > 0 && then.length > 0,
    });
  }

  return scenarios;
}

function extractSteps(block: string, keyword: string): string[] {
  const steps: string[] = [];
  const regex = new RegExp(`(?:${keyword}|And)\\s+(.+)`, "gi");

  // Only match "And" steps that follow the keyword
  let inSection = false;
  for (const line of block.split("\n")) {
    const keywordMatch = line.match(new RegExp(`^\\s*${keyword}\\s+(.+)`, "i"));
    if (keywordMatch) {
      inSection = true;
      steps.push(keywordMatch[1].trim());
      continue;
    }
    if (inSection) {
      const andMatch = line.match(/^\s*And\s+(.+)/i);
      if (andMatch) {
        steps.push(andMatch[1].trim());
      } else if (line.match(/^\s*(Given|When|Then)\s+/i)) {
        inSection = false;
      }
    }
  }

  return steps;
}
```

### Step 3: Create LLM decomposition service

**Files:** `src/server/orchestrator/decomposer.ts` (create)

Uses `@anthropic-ai/sdk` to decompose features/epics into `TaskGraph`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getEnv } from "@/server/config/env";
import { TaskGraphSchema, type TaskGraph } from "./task-graph";
import type { JiraTicket } from "@/server/mcp/jira/types";
import type { BDDScenario } from "@/server/services/bdd-verification";
import { withRetry } from "@/server/lib/retry";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "decomposer" });

export interface DecompositionInput {
  ticket: JiraTicket;
  scenarios: BDDScenario[];
  projectStructure: string; // Tree listing of relevant directories
}

export async function decomposeFeature(
  input: DecompositionInput,
  signal?: AbortSignal,
): Promise<TaskGraph> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const prompt = buildFeatureDecompositionPrompt(input);

  const response = await withRetry(
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
    { maxAttempts: 3, baseDelayMs: 1000, signal },
  );

  // Extract JSON from response (may be wrapped in markdown code block)
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, response];
  const rawGraph: unknown = JSON.parse(jsonMatch[1] ?? response);

  // Validate with Zod
  const graph = TaskGraphSchema.parse({
    ...rawGraph,
    ticketRef: input.ticket.key,
  });

  logger.info(
    { ticketRef: input.ticket.key, taskCount: graph.nodes.length, totalPoints: graph.totalEstimatedPoints },
    "Feature decomposed into task graph",
  );

  return graph;
}

export async function decomposeEpic(
  ticket: JiraTicket,
  projectStructure: string,
  signal?: AbortSignal,
): Promise<{ stories: EpicStory[]; taskGraph: TaskGraph }> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const prompt = buildEpicDecompositionPrompt(ticket, projectStructure);

  const response = await withRetry(
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
    { maxAttempts: 3, baseDelayMs: 1000, signal },
  );

  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, response];
  const raw: unknown = JSON.parse(jsonMatch[1] ?? response);

  const parsed = EpicDecompositionResponseSchema.parse(raw);

  // Build task graph from all story tasks
  const allNodes = parsed.stories.flatMap((story) =>
    story.tasks.map((task) => ({
      ...task,
      id: `${story.id}-${task.id}`,
      dependsOn: task.dependsOn.map((dep: string) =>
        dep.includes("-") ? dep : `${story.id}-${dep}`
      ),
    })),
  );

  const taskGraph: TaskGraph = TaskGraphSchema.parse({
    ticketRef: ticket.key,
    nodes: allNodes,
    totalEstimatedPoints: parsed.stories.reduce((sum, s) => sum + s.storyPoints, 0),
    riskAreas: parsed.riskAreas,
  });

  return { stories: parsed.stories, taskGraph };
}

// ─── Prompt Builders ─────────────────────────────────────────────────────────

function buildFeatureDecompositionPrompt(input: DecompositionInput): string {
  const { ticket, scenarios, projectStructure } = input;
  return `You are decomposing a feature ticket into implementation tasks.

## Feature
- Key: ${ticket.key}
- Title: ${ticket.summary}
- Description: ${ticket.description}
- Story Points: ${ticket.storyPoints ?? "unknown"}

## BDD Scenarios
${scenarios.map((s) => `### ${s.title}
- Given: ${s.given.join("; ")}
- When: ${s.when.join("; ")}
- Then: ${s.then.join("; ")}
`).join("\n")}

## Project Structure
${projectStructure}

## Available Agents
- node-backend: Node.js, APIs, database, queues, MCP integrations
- next-ux: React, Next.js, Tailwind, dashboard UI
- ts-testing: Jest, Playwright, coverage

## Instructions
1. Break down this feature into 2-8 discrete implementation tasks
2. Each task should be a single focused PR (small, reviewable)
3. Identify dependencies between tasks (which must complete before others)
4. Assign taskType: backend, frontend, testing, or documentation
5. List affected files for each task
6. Estimate points per task (1, 2, 3, 5, or 8)
7. Identify risk areas

## Output Format
Return ONLY valid JSON (no markdown wrapping):
{
  "nodes": [
    {
      "id": "task-1",
      "title": "Short task title",
      "description": "Detailed description of what to implement",
      "taskType": "backend",
      "dependsOn": [],
      "affectedFiles": ["src/server/..."],
      "estimatedPoints": 3
    }
  ],
  "totalEstimatedPoints": 8,
  "riskAreas": ["area of concern"]
}`;
}

function buildEpicDecompositionPrompt(ticket: JiraTicket, projectStructure: string): string {
  return `You are a product owner decomposing an epic into user stories with implementation tasks.

## Epic
- Key: ${ticket.key}
- Title: ${ticket.summary}
- Description: ${ticket.description}
- Total Points: ${ticket.storyPoints ?? 40}

## Project Structure
${projectStructure}

## Available Agents
- node-backend: Node.js, APIs, database, queues, MCP integrations
- next-ux: React, Next.js, Tailwind, dashboard UI
- ts-testing: Jest, Playwright, coverage

## Instructions
1. Decompose into 5-15 user stories
2. Each story gets BDD acceptance criteria (Given/When/Then)
3. Each story is broken into 2-5 implementation tasks
4. Estimate story points (1, 2, 3, 5, 8, or 13 per story)
5. Identify inter-story dependencies
6. Identify risk areas

## Output Format
Return ONLY valid JSON:
{
  "stories": [
    {
      "id": "story-1",
      "title": "As a [user], I want [feature] so that [benefit]",
      "description": "...",
      "acceptanceCriteria": ["Scenario: ...\\nGiven ...\\nWhen ...\\nThen ..."],
      "storyPoints": 5,
      "tasks": [
        {
          "id": "task-1",
          "title": "...",
          "description": "...",
          "taskType": "backend",
          "dependsOn": [],
          "affectedFiles": ["src/..."],
          "estimatedPoints": 2
        }
      ]
    }
  ],
  "riskAreas": ["..."]
}`;
}

// ─── Response Schemas ────────────────────────────────────────────────────────

const EpicStorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string()),
  storyPoints: z.number().int().min(1).max(13),
  tasks: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    taskType: z.enum(["backend", "frontend", "testing", "documentation", "orchestration"]),
    dependsOn: z.array(z.string()),
    affectedFiles: z.array(z.string()),
    estimatedPoints: z.number().int().min(1).max(8),
  })),
});
export type EpicStory = z.infer<typeof EpicStorySchema>;

const EpicDecompositionResponseSchema = z.object({
  stories: z.array(EpicStorySchema),
  riskAreas: z.array(z.string()),
});
```

### Step 4: Create parallel execution coordinator

**Files:** `src/server/orchestrator/parallel-executor.ts` (create)

```typescript
import { z } from "zod";
import type { TaskGraph, TaskNode } from "./task-graph";
import { findReadyNodes, resolveAgentForTask, findDependentNodes } from "./task-graph";
import type { AgentExecutor, ExecutionRequest, ExecutionResult } from "@/server/agents/execution/types";
import { composeSystemPrompt } from "@/server/agents/execution/prompt-composer";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "parallel-executor" });

export const ParallelExecutionConfigSchema = z.object({
  maxConcurrentTasks: z.number().int().positive().default(3),
  taskTimeoutMs: z.number().int().positive().default(600_000),
});
export type ParallelExecutionConfig = z.infer<typeof ParallelExecutionConfigSchema>;

export interface TaskExecutionResult {
  nodeId: string;
  result: ExecutionResult;
}

export interface ParallelExecutionResult {
  completed: Map<string, ExecutionResult>;
  failed: Map<string, string>;
  blocked: Set<string>;
  allSuccessful: boolean;
}

export async function executeTaskGraph(
  graph: TaskGraph,
  executor: AgentExecutor,
  config: ParallelExecutionConfig = ParallelExecutionConfigSchema.parse({}),
  onProgress?: (completed: number, total: number, failed: number) => void,
  signal?: AbortSignal,
): Promise<ParallelExecutionResult> {
  const completed = new Map<string, ExecutionResult>();
  const failed = new Map<string, string>();
  const blocked = new Set<string>();
  const active = new Map<string, Promise<TaskExecutionResult>>();
  const completedIds = new Set<string>();
  const failedIds = new Set<string>();
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  while (completedIds.size + failedIds.size + blocked.size < graph.nodes.length) {
    signal?.throwIfAborted();

    // Find tasks ready to execute
    const ready = findReadyNodes(graph, completedIds, failedIds);
    const slotsAvailable = config.maxConcurrentTasks - active.size;
    const toStart = ready
      .filter((n) => !active.has(n.id))
      .slice(0, slotsAvailable);

    // Start new tasks
    for (const node of toStart) {
      const promise = executeNode(node, graph, executor, config.taskTimeoutMs, signal);
      active.set(node.id, promise);
    }

    // If nothing active and nothing to start, mark remaining as blocked
    if (active.size === 0 && toStart.length === 0) {
      for (const node of graph.nodes) {
        if (!completedIds.has(node.id) && !failedIds.has(node.id) && !blocked.has(node.id)) {
          blocked.add(node.id);
        }
      }
      break;
    }

    // Wait for any task to complete
    if (active.size > 0) {
      const settled = await Promise.race(
        [...active.entries()].map(async ([id, p]) => {
          try {
            const result = await p;
            return { id, result, error: null };
          } catch (error) {
            return { id, result: null, error: error instanceof Error ? error.message : "Unknown error" };
          }
        }),
      );

      active.delete(settled.id);

      if (settled.result && settled.result.result.status === "completed") {
        completedIds.add(settled.id);
        completed.set(settled.id, settled.result.result);
      } else {
        failedIds.add(settled.id);
        failed.set(settled.id, settled.error ?? settled.result?.result.error ?? "Task failed");
        // Mark transitive dependents as blocked
        const dependents = findDependentNodes(settled.id, graph);
        for (const dep of dependents) {
          blocked.add(dep);
        }
      }

      onProgress?.(completedIds.size, graph.nodes.length, failedIds.size);
    }
  }

  return {
    completed,
    failed,
    blocked,
    allSuccessful: failedIds.size === 0 && blocked.size === 0,
  };
}

async function executeNode(
  node: TaskNode,
  graph: TaskGraph,
  executor: AgentExecutor,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<TaskExecutionResult> {
  const agentId = resolveAgentForTask(node);
  const systemPrompt = await composeSystemPrompt(agentId, node.affectedFiles);

  const request: ExecutionRequest = {
    taskId: crypto.randomUUID(),
    agentId,
    taskType: node.taskType,
    ticketRef: graph.ticketRef,
    description: `${node.title}\n\n${node.description}`,
    constraints: [
      `Only modify files within: ${node.affectedFiles.join(", ")}`,
      `This task is part of a larger feature: ${graph.ticketRef}`,
    ],
    acceptanceCriteria: [`Task "${node.title}" is fully implemented`],
    domainPaths: node.affectedFiles,
    systemPrompt,
    timeoutMs,
  };

  const result = await executor.execute(request, signal);
  return { nodeId: node.id, result };
}
```

### Step 5: Create merge sequencing utility

**Files:** `src/server/orchestrator/merge-sequencer.ts` (create)

```typescript
import { z } from "zod";
import type { TaskGraph } from "./task-graph";
import { topologicalSort } from "./task-graph";
import type { ExecutionResult } from "@/server/agents/execution/types";
import { createPullRequest, buildPRBody } from "@/server/services/pr.service";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "merge-sequencer" });

export const ConflictWarningSchema = z.object({
  taskIds: z.tuple([z.string(), z.string()]),
  overlappingFiles: z.array(z.string()),
  recommendation: z.enum(["sequential", "group"]),
});
export type ConflictWarning = z.infer<typeof ConflictWarningSchema>;

export interface MergeSequence {
  order: string[];
  conflicts: ConflictWarning[];
}

export function calculateMergeSequence(
  graph: TaskGraph,
  results: Map<string, ExecutionResult>,
): MergeSequence {
  const sorted = topologicalSort(graph);
  const completedSorted = sorted.filter((id) => results.has(id));

  // Detect file conflicts between tasks at same dependency level
  const conflicts: ConflictWarning[] = [];
  for (let i = 0; i < completedSorted.length; i++) {
    for (let j = i + 1; j < completedSorted.length; j++) {
      const filesA = results.get(completedSorted[i])?.changedFiles ?? [];
      const filesB = results.get(completedSorted[j])?.changedFiles ?? [];
      const overlap = filesA.filter((f) => filesB.includes(f));

      if (overlap.length > 0) {
        conflicts.push({
          taskIds: [completedSorted[i], completedSorted[j]],
          overlappingFiles: overlap,
          recommendation: overlap.length > 3 ? "group" : "sequential",
        });
      }
    }
  }

  return { order: completedSorted, conflicts };
}

export async function createMergePRs(
  graph: TaskGraph,
  sequence: MergeSequence,
  results: Map<string, ExecutionResult>,
  signal?: AbortSignal,
): Promise<Map<string, { prNumber: number; prUrl: string }>> {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const prs = new Map<string, { prNumber: number; prUrl: string }>();

  for (const taskId of sequence.order) {
    signal?.throwIfAborted();

    const node = nodeMap.get(taskId);
    const result = results.get(taskId);
    if (!node || !result) continue;

    const branch = `feature/${graph.ticketRef.toLowerCase()}-${taskId}`;

    const pr = await createPullRequest({
      ticketRef: graph.ticketRef,
      branch,
      title: node.title,
      body: buildPRBody(graph.ticketRef, result.summary, result.changedFiles, 1),
      labels: ["GEN", `task:${node.taskType}`],
    }, signal);

    prs.set(taskId, { prNumber: pr.prNumber, prUrl: pr.prUrl });
    logger.info({ taskId, prNumber: pr.prNumber }, "PR created for task");
  }

  return prs;
}
```

### Step 6: Create progress tracking service

**Files:** `src/server/services/progress.service.ts` (create)

```typescript
import { z } from "zod";
import type { TaskGraph } from "@/server/orchestrator/task-graph";
import { prisma } from "@/server/db";
import { TaskGraphSchema } from "@/server/orchestrator/task-graph";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "progress-service" });

export const PipelineProgressSchema = z.object({
  pipelineId: z.string().uuid(),
  ticketRef: z.string().min(1),
  stage: z.string(),
  totalTasks: z.number().int().min(0),
  completedTasks: z.number().int().min(0),
  activeTasks: z.number().int().min(0),
  failedTasks: z.number().int().min(0),
  blockedTasks: z.number().int().min(0),
  totalPoints: z.number().int().min(0),
  completedPoints: z.number().int().min(0),
  lastUpdated: z.string().datetime(),
});
export type PipelineProgress = z.infer<typeof PipelineProgressSchema>;

export async function persistDecomposition(
  pipelineId: string,
  graph: TaskGraph,
): Promise<void> {
  await prisma.taskDecomposition.upsert({
    where: { pipelineId },
    create: {
      pipelineId,
      taskGraph: graph as unknown as Record<string, unknown>,
      totalPoints: graph.totalEstimatedPoints,
      riskAreas: graph.riskAreas,
      affectedFiles: graph.nodes.flatMap((n) => n.affectedFiles),
    },
    update: {
      taskGraph: graph as unknown as Record<string, unknown>,
      totalPoints: graph.totalEstimatedPoints,
      riskAreas: graph.riskAreas,
      affectedFiles: graph.nodes.flatMap((n) => n.affectedFiles),
    },
  });

  logger.info({ pipelineId, taskCount: graph.nodes.length }, "Task decomposition persisted");
}

export async function loadDecomposition(pipelineId: string): Promise<TaskGraph | null> {
  const record = await prisma.taskDecomposition.findUnique({
    where: { pipelineId },
  });

  if (!record) return null;

  return TaskGraphSchema.parse(record.taskGraph);
}

export async function calculateProgress(
  pipelineId: string,
  completedNodeIds: Set<string>,
  activeNodeIds: Set<string>,
  failedNodeIds: Set<string>,
  blockedNodeIds: Set<string>,
): Promise<PipelineProgress> {
  const pipeline = await prisma.pipeline.findUniqueOrThrow({
    where: { id: pipelineId },
    include: { decomposition: true },
  });

  const graph = pipeline.decomposition
    ? TaskGraphSchema.parse(pipeline.decomposition.taskGraph)
    : null;

  const completedPoints = graph
    ? graph.nodes
        .filter((n) => completedNodeIds.has(n.id))
        .reduce((sum, n) => sum + n.estimatedPoints, 0)
    : 0;

  return {
    pipelineId,
    ticketRef: pipeline.epicKey,
    stage: pipeline.status,
    totalTasks: graph?.nodes.length ?? 0,
    completedTasks: completedNodeIds.size,
    activeTasks: activeNodeIds.size,
    failedTasks: failedNodeIds.size,
    blockedTasks: blockedNodeIds.size,
    totalPoints: graph?.totalEstimatedPoints ?? 0,
    completedPoints,
    lastUpdated: new Date().toISOString(),
  };
}
```

### Step 7: Wire feature pipeline into orchestrator

**Files:** `src/server/orchestrator/engine.ts` (modify)

Extend the `onDoRPass` and `onPlanApproved` handlers:

```typescript
import { verifyBDDRequirements } from "@/server/services/bdd-verification";
import { decomposeFeature, decomposeEpic } from "./decomposer";
import { executeTaskGraph } from "./parallel-executor";
import { calculateMergeSequence, createMergePRs } from "./merge-sequencer";
import { persistDecomposition } from "@/server/services/progress.service";
import { createHash } from "node:crypto";

// In onDoRPass — feature/epic branch:
private async executeFeaturePipeline(ticketRef: string, ticket: JiraTicket): Promise<void> {
  // 1. Verify BDD requirements
  const bddResult = verifyBDDRequirements(ticket.acceptanceCriteria);
  if (!bddResult.passed) {
    await this.publishGateFailure(ticketRef, "dor", bddResult.violations);
    return;
  }

  // 2. Decompose into task graph
  const graph = await decomposeFeature({
    ticket,
    scenarios: bddResult.scenarios,
    projectStructure: await this.getProjectStructure(),
  });

  // 3. Persist decomposition
  const pipeline = await prisma.pipeline.findFirst({ where: { epicKey: ticketRef } });
  if (pipeline) {
    await persistDecomposition(pipeline.id, graph);
  }

  // 4. Request human approval
  const planHash = createHash("sha256").update(JSON.stringify(graph)).digest("hex");
  await this.messageBus.publish({
    kind: "human-approval-request",
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sourceAgent: "orchestrator-project",
    ticketRef,
    planSummary: `Feature decomposed into ${graph.nodes.length} tasks (${graph.totalEstimatedPoints} points). Risk areas: ${graph.riskAreas.join(", ") || "none identified"}.`,
    filesToChange: graph.nodes.flatMap((n) => n.affectedFiles),
    agentAssignments: graph.nodes.map((n) => ({
      agentId: resolveAgentForTask(n),
      taskType: n.taskType,
      description: n.title,
    })),
    riskLevel: graph.riskAreas.length > 2 ? "high" : graph.riskAreas.length > 0 ? "medium" : "low",
  });

  // Store plan hash for integrity verification when approved
  if (pipeline) {
    await prisma.approval.create({
      data: {
        pipelineId: pipeline.id,
        type: "PLAN",
        requestedBy: "orchestrator-project",
        planSummary: `${graph.nodes.length} tasks, ${graph.totalEstimatedPoints} points`,
        planHash,
        affectedFiles: graph.nodes.flatMap((n) => n.affectedFiles),
        estimatedPoints: graph.totalEstimatedPoints,
        riskLevel: graph.riskAreas.length > 2 ? "high" : graph.riskAreas.length > 0 ? "medium" : "low",
      },
    });
  }
}

// On plan-approved event:
private async onPlanApproved(event: DomainEvent & { kind: "plan-approved" }): Promise<void> {
  const pipeline = await prisma.pipeline.findFirst({ where: { epicKey: event.ticketRef } });
  if (!pipeline) return;

  const graph = await loadDecomposition(pipeline.id);
  if (!graph) return;

  const executor = getExecutor();

  // Execute task graph in parallel
  const result = await executeTaskGraph(graph, executor, undefined, (completed, total, failed) => {
    logger.info({ ticketRef: event.ticketRef, completed, total, failed }, "Pipeline progress");
  });

  if (result.allSuccessful) {
    // Calculate merge order and create PRs
    const sequence = calculateMergeSequence(graph, result.completed);
    const prs = await createMergePRs(graph, sequence, result.completed);

    // Publish completion
    await this.messageBus.publish({
      kind: "status-update",
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      sourceAgent: "orchestrator-project",
      ticketRef: event.ticketRef,
      status: "prs-created",
      details: `${prs.size} PRs created, ready for human review`,
    });
  } else {
    // Partial failure — notify human
    await this.escalateFeatureFailure(event.ticketRef, result);
  }
}
```

### Step 8: Wire epic pipeline

**Files:** `src/server/orchestrator/engine.ts` (modify)

```typescript
private async executeEpicPipeline(ticketRef: string, ticket: JiraTicket): Promise<void> {
  // 1. Decompose epic into stories + tasks
  const { stories, taskGraph } = await decomposeEpic(
    ticket,
    await this.getProjectStructure(),
  );

  // 2. Persist decomposition
  const pipeline = await prisma.pipeline.findFirst({ where: { epicKey: ticketRef } });
  if (pipeline) {
    await persistDecomposition(pipeline.id, taskGraph);
    await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { status: "REFINEMENT" },
    });
  }

  // 3. Create Jira sub-tickets for stories (if Jira client supports createTicket)
  // NOTE: Jira ticket creation is a future enhancement - for now, log the decomposition

  // 4. Request human approval for the epic plan
  const planHash = createHash("sha256").update(JSON.stringify(taskGraph)).digest("hex");
  await this.messageBus.publish({
    kind: "human-approval-request",
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sourceAgent: "orchestrator-project",
    ticketRef,
    planSummary: `Epic decomposed into ${stories.length} stories with ${taskGraph.nodes.length} tasks (${taskGraph.totalEstimatedPoints} points).`,
    filesToChange: taskGraph.nodes.flatMap((n) => n.affectedFiles),
    agentAssignments: taskGraph.nodes.map((n) => ({
      agentId: resolveAgentForTask(n),
      taskType: n.taskType,
      description: n.title,
    })),
    riskLevel: taskGraph.riskAreas.length > 3 ? "high" : "medium",
  });

  if (pipeline) {
    await prisma.approval.create({
      data: {
        pipelineId: pipeline.id,
        type: "PLAN",
        requestedBy: "orchestrator-project",
        planSummary: `Epic: ${stories.length} stories, ${taskGraph.nodes.length} tasks, ${taskGraph.totalEstimatedPoints} points`,
        planHash,
        affectedFiles: taskGraph.nodes.flatMap((n) => n.affectedFiles),
        estimatedPoints: taskGraph.totalEstimatedPoints,
        riskLevel: taskGraph.riskAreas.length > 3 ? "high" : "medium",
      },
    });
  }
}
```

## Files to Create/Modify

| Path | Action | Purpose |
|------|--------|---------|
| `src/server/orchestrator/task-graph.ts` | Create | `TaskNode`, `TaskGraph` Zod schemas + helpers (topological sort, ready nodes, dependents) |
| `src/server/services/bdd-verification.ts` | Create | `verifyBDDRequirements()` — parse and validate Given/When/Then scenarios |
| `src/server/orchestrator/decomposer.ts` | Create | `decomposeFeature()`, `decomposeEpic()` via Anthropic SDK |
| `src/server/orchestrator/parallel-executor.ts` | Create | `executeTaskGraph()` — concurrent agent execution respecting dependency graph |
| `src/server/orchestrator/merge-sequencer.ts` | Create | `calculateMergeSequence()`, `createMergePRs()` — topological merge ordering |
| `src/server/services/progress.service.ts` | Create | `persistDecomposition()`, `loadDecomposition()`, `calculateProgress()` |
| `src/server/orchestrator/engine.ts` | Modify | Wire `executeFeaturePipeline()`, `executeEpicPipeline()`, `onPlanApproved()` |

## Testing Requirements

### Unit Tests

- `__tests__/server/orchestrator/task-graph.test.ts`
  - Test `topologicalSort()` with linear, diamond, and disconnected graphs
  - Test `findReadyNodes()` with various completed/failed states
  - Test `findDependentNodes()` with transitive dependencies
  - Test `resolveAgentForTask()` mapping
  - Test Zod validation of `TaskGraphSchema`

- `__tests__/server/services/bdd-verification.test.ts`
  - Test `verifyBDDRequirements()` with valid BDD scenarios
  - Test detection of missing Given/When/Then
  - Test parsing of multiple scenarios
  - Test And-step association with correct keyword

- `__tests__/server/orchestrator/decomposer.test.ts`
  - Test `decomposeFeature()` with mocked Anthropic SDK
  - Test `decomposeEpic()` with mocked Anthropic SDK
  - Test Zod validation of LLM response
  - Test JSON extraction from markdown-wrapped responses

- `__tests__/server/orchestrator/parallel-executor.test.ts`
  - Test `executeTaskGraph()` with `MockAgentExecutor`
  - Test concurrent execution limits (maxConcurrentTasks)
  - Test dependency ordering (dependents wait for dependencies)
  - Test failure handling (dependents blocked when dependency fails)
  - Test progress callback

- `__tests__/server/orchestrator/merge-sequencer.test.ts`
  - Test `calculateMergeSequence()` returns topological order
  - Test conflict detection for overlapping files
  - Test `createMergePRs()` with mocked Octokit

- `__tests__/server/services/progress.service.test.ts`
  - Test `persistDecomposition()` writes to Prisma
  - Test `loadDecomposition()` reads and validates with Zod
  - Test `calculateProgress()` computes correct totals

### Budget Constraints

- Unit tests <3 seconds (mock executor, mocked Anthropic SDK, no real API calls)
- 80%+ coverage on new files

## Acceptance Criteria

**Stage 2 — Features:**
- [ ] `verifyBDDRequirements()` catches missing Given/When/Then from `ticket.acceptanceCriteria`
- [ ] `decomposeFeature()` calls Anthropic SDK and returns validated `TaskGraph`
- [ ] `TaskGraph` persisted to `TaskDecomposition` Prisma model
- [ ] `HumanApprovalRequest` published with plan summary, affected files, risk level
- [ ] `Approval` record created with `planHash` for integrity verification
- [ ] `executeTaskGraph()` respects dependency order and concurrency limits
- [ ] Each completed task creates one PR via `createPullRequest()`
- [ ] `calculateMergeSequence()` returns topological order with conflict warnings
- [ ] Progress callback reports completion/total/failed counts

**Stage 3 — Epics:**
- [ ] `decomposeEpic()` produces stories with BDD criteria + implementation tasks
- [ ] Epic stories stored as `EpicStory[]` with acceptance criteria
- [ ] Pipeline status transitions: FUNNEL → REFINEMENT → APPROVED → IN_PROGRESS → REVIEW → DONE
- [ ] Blocked tasks paused when dependencies fail (not crashed)
- [ ] `PipelineProgress` tracks completion percentage across all tasks
- [ ] Partial failure notifies human with failure context

**Cross-cutting:**
- [ ] Zero `any` types — all external data (LLM responses, Prisma JSON) validated with Zod
- [ ] All unit tests pass within 3s budget
- [ ] Feature-flagged via `AGENT_EXECUTOR` env var (mock executor for development)

## Dependencies

- **Depends on:** ALL previous plans (01-09)
- **Blocks:** None (this is the capstone)
- **DevOps:** DEVOPS-NEEDS #5 (Anthropic API key), GitHub token

## Estimated Conversations

4-5 conversations:
1. TaskGraph types + BDD verification + tests
2. LLM decomposition service (feature + epic) + tests
3. Parallel executor + merge sequencer + tests
4. Progress tracking + orchestrator wiring + tests
5. Integration testing across full pipeline

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM returns invalid JSON | High — decomposition fails | Zod validation catches; retry with error context in prompt |
| LLM hallucinates file paths | Medium — affected files wrong | Cross-reference with actual filesystem; warn on non-existent paths |
| Parallel agents modify same files | Medium — merge conflicts | Static conflict detection before dispatch; serialize conflicting tasks |
| Anthropic API rate limits | Medium — decomposition throttled | `withRetry()` with exponential backoff; queue decomposition requests |
| Epic decomposition too many stories | Low — overhead | Cap at 15 stories per epic; human approval can reject |
| Task graph has cycles | High — infinite loop | Validate DAG property in `TaskGraphSchema` refinement |
| Human never approves plan | Medium — pipeline stuck | Approval expiration (24h default from `OrchestratorConfig.approvalTimeoutMs`) |
