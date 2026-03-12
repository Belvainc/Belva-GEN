# Plan 04: Orchestrator Core Loop & Agent Routing

## Overview

Wire up the orchestrator engine's event handlers to actually orchestrate work. This plan implements task decomposition from tickets, dependency graph generation via LLM, agent resolution and dispatch via the message bus, completion tracking, and error handling. This is the critical plan that connects all infrastructure (Jira, Slack, gates, agents) into a functioning workflow.

## Prerequisites

- Plan 01 complete: Jira MCP client implemented (webhook events flowing)
- Plan 02 complete: DoR/DoD gate services implemented
- Plan 03 complete: Slack MCP client implemented (notifications flowing)
- BullMQ queues operational (Redis running)
- Agent registry populated with agent configurations

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Orchestrator engine | `src/server/orchestrator/engine.ts` | Partial — handlers scaffolded as TODOs, `resolveAgent()` implemented |
| State machine | `src/server/orchestrator/state-machine.ts` | Complete — transitions and guards defined |
| Orchestrator types | `src/server/orchestrator/types.ts` | Complete — `OrchestratorConfig`, `EpicContext`, `Transition` |
| Agent registry | `src/server/agents/registry.ts` | Complete — config + status tracking |
| Message bus | `src/server/agents/message-bus.ts` | Complete — typed pub/sub with Zod validation |
| Agent runner | `src/server/agents/runner.ts` | Partial — subscribes to messages, `executeTask()` is TODO |
| Agent protocol | `src/types/agent-protocol.ts` | Partial — missing `documentation` TaskType |
| Domain events | `src/types/events.ts` | Complete — all domain event types |
| LLM client | `src/server/llm/` | **Missing** — need to create |
| Jira MCP client | `src/server/mcp/jira/client.ts` | Complete — getTicket, search, transitions |
| Slack MCP client | `src/server/mcp/slack/client.ts` | Complete — webhook notifications |
| Prisma Pipeline model | `prisma/schema.prisma` | Partial — missing TaskDecomposition |

## Scope

### In Scope

- Implement all 9 orchestrator event handlers
- Task decomposition: LLM breaks ticket into sub-tasks with dependency graph
- Agent resolution: map task type to specialized agent ID
- Task dispatch via message bus (`TaskAssignment` messages)
- Completion tracking: monitor `TaskCompletion` messages, update state
- Error handling: retry logic, timeout handling, agent unavailability
- Integration with gate services (DoR check on entry, DoD check on completion)
- Integration with Slack notifications (status updates, plan approval requests)

### Out of Scope

- Actual agent execution (Plan 08 — OpenClaw integration)
- Human approval UI (Plan 06 — built on top of orchestrator events)
- Pipeline-level orchestration for epics (Plan 10 — feature/epic pipelines)
- Service layer wiring (Plan 05 — API routes call services which call orchestrator)

## Research Questions

1. **LLM for task decomposition** — Which LLM API do we use to decompose tickets into sub-tasks? OpenAI? Anthropic? Local model? Need to check for existing LLM client infrastructure.
2. **Dependency graph format** — What data structure represents the task dependency graph? Adjacency list? Topological sort for execution order?
3. **Agent availability** — How do we handle agent unavailability? Queue the task and retry? Fail the ticket? Need timeout + retry policy.
4. **Concurrent task limits** — Should we limit how many tasks run in parallel per epic? Per agent? Global limit?
5. **State persistence** — The engine uses in-memory `Map<string, EpicContext>`. Should we persist to database for crash recovery?

## Research Findings

> Answers to research questions based on codebase analysis.

### RQ-1: LLM for Task Decomposition

**Finding:** No LLM infrastructure exists. Need to add:
- `@anthropic-ai/sdk` npm dependency
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` env vars (see `DEVOPS-NEEDS.md` item #5)
- New module: `src/server/llm/client.ts` with circuit breaker + retry

**Decision:** Use **Anthropic Claude** for consistency with the project's Claude Code agent ecosystem. Claude Sonnet for balance of capability and cost.

### RQ-2: Dependency Graph Format

**Finding:** Proposed `TaskGraph` with `Map<string, TaskNode>` is appropriate. Each node stores `dependsOn: string[]` for edges.

**Decision:** Use adjacency list stored in each node. Topological sort at dispatch time to determine execution order. Root tasks (empty `dependsOn`) dispatch immediately.

### RQ-3: Agent Availability

**Finding:** `AgentRegistry` has status tracking (`idle`, `busy`, `error`, `offline`). `AgentRunner` updates status on task assignment/completion.

**Decision:** 
- If agent `offline`: queue task in BullMQ with exponential backoff (3 attempts)
- If agent `busy`: wait for `task-completion` message to trigger next dispatch
- If agent `error`: notify Slack, require manual intervention

### RQ-4: Concurrent Task Limits

**Finding:** Not addressed in current config.

**Decision:** Add `maxConcurrentTasksPerEpic: number` to `OrchestratorConfig` (default: 3). Prevents runaway parallel execution. Per-agent limits handled by `AgentRunner`.

### RQ-5: State Persistence

**Finding:** Prisma has `Pipeline` model for epic state, but no `TaskGraph` storage. Need schema update.

**Decision:** Add `TaskDecomposition` model with JSON column for `TaskGraph`. Update `Pipeline` to reference it. Checkpoint on: state transitions, task completions, plan amendments.

## Architecture Decisions

### AD-01: In-memory state with database checkpoints

Keep the in-memory `epicRegistry` for fast access but checkpoint to PostgreSQL on state transitions. Rationale: Performance for the common case, durability for crash recovery.

**Implementation:** Add `TaskDecomposition` Prisma model. Checkpoint on state transitions via `saveEpicContext()`.

### AD-02: LLM task decomposition via Anthropic Claude

Create a `decomposeTicket()` function that calls **Anthropic Claude Sonnet** with the ticket details and returns a typed `TaskGraph`. 

**Configuration:**
- `ANTHROPIC_API_KEY` — API key (required)
- `ANTHROPIC_MODEL` — Model ID (default: `claude-sonnet-4-20250514`)

**Rationale:** Anthropic chosen for consistency with Claude Code agent ecosystem. Separates LLM integration from orchestrator logic, allows testing with mocked decomposition.

### AD-03: Agent resolution by task type + domain

Map task types to agents using a resolution strategy:
- `backend` tasks → `node-backend` agent
- `frontend` tasks → `next-ux` agent  
- `testing` tasks → `ts-testing` agent
- `documentation` tasks → `orchestrator-project` agent
- `orchestration` tasks → `orchestrator-project` agent

**Note:** Current `TaskTypeSchema` missing `documentation` — add in Step 1.

Fallback to `orchestrator-project` for untyped tasks. Rationale: Matches the agent definitions in `.claude/agents/`.

### AD-04: Message bus for decoupled communication

Use the existing `MessageBus` for all agent communication. The orchestrator publishes `TaskAssignment` messages; agents subscribe and reply with `TaskCompletion`. Rationale: Decoupled, testable, supports async execution.

### AD-05: Concurrent task limits (NEW)

Add `maxConcurrentTasksPerEpic` config option (default: 3) to prevent runaway parallel execution. Orchestrator tracks active tasks per epic and holds dispatch until slots available.

## Implementation Steps

### Step 0: Update TaskTypeSchema (NEW)

**Files:** `src/types/agent-protocol.ts`

Add `documentation` to the existing `TaskTypeSchema`:

```typescript
export const TaskTypeSchema = z.enum([
  "backend",
  "frontend",
  "testing",
  "documentation", // NEW - handles docs, comments, README updates
  "orchestration",
]);
```

### Step 0.5: Add LLM client infrastructure (NEW)

**Files:** 
- `src/server/config/env.ts` — Add Anthropic env vars
- `src/server/llm/client.ts` — Create Anthropic client wrapper
- `src/server/llm/index.ts` — Export module

**env.ts additions:**
```typescript
// Anthropic (LLM for task decomposition)
ANTHROPIC_API_KEY: z.string().optional(),
ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),
```

**client.ts structure:**
```typescript
import Anthropic from "@anthropic-ai/sdk";

export class LLMClient {
  private readonly client: Anthropic;
  private readonly model: string;
  
  constructor(config: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
  }
  
  async complete(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal
  ): Promise<string> {
    // Wrapped in circuit breaker + retry
  }
}

// Stub for development without API key
export class LLMClientStub extends LLMClient { ... }
```

### Step 0.6: Add Prisma schema for TaskDecomposition (NEW)

**Files:** `prisma/schema.prisma`

Add model to persist task graphs:

```prisma
model TaskDecomposition {
  id              String          @id @default(uuid())
  pipelineId      String          @unique
  taskGraph       Json            // Serialized TaskGraph
  totalPoints     Int
  riskAreas       String[]
  affectedFiles   String[]
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // Relations
  pipeline        Pipeline        @relation(fields: [pipelineId], references: [id], onDelete: Cascade)

  @@map("task_decompositions")
}
```

Update `Pipeline` model to add relation:
```prisma
model Pipeline {
  // ... existing fields ...
  decomposition   TaskDecomposition?
}
```

Run migration: `npx prisma migrate dev --name add-task-decomposition`

### Step 1: Define TaskGraph and decomposition types

**Files:** `src/server/orchestrator/types.ts`

Add types for task decomposition:

```typescript
export interface TaskNode {
  taskId: string;
  title: string;
  description: string;
  taskType: 'backend' | 'frontend' | 'testing' | 'documentation' | 'orchestration';
  estimatedPoints: number;
  dependsOn: string[]; // taskIds this task depends on
}

export interface TaskGraph {
  ticketRef: string;
  rootTaskIds: string[]; // tasks with no dependencies (entry points)
  nodes: Map<string, TaskNode>;
}

export interface DecompositionResult {
  graph: TaskGraph;
  totalEstimatedPoints: number;
  riskAreas: string[];
  affectedFiles: string[];
}
```

### Step 2: Implement LLM task decomposition

**Files:** `src/server/orchestrator/decompose.ts` (create)

```typescript
export async function decomposeTicket(
  ticket: JiraTicket,
  signal?: AbortSignal
): Promise<DecompositionResult> {
  // 1. Build prompt with ticket details
  // 2. Call LLM API (configurable: OpenAI/Anthropic)
  // 3. Parse and validate response with Zod
  // 4. Build TaskGraph from LLM output
  // 5. Return typed result
}
```

**Implementation notes:**
- Use structured output (JSON mode) to get parseable response
- Include project context (file paths, existing code patterns) in prompt
- Validate returned task types match known agent capabilities
- Include `AbortSignal` for timeout control

### Step 3: Implement agent resolution

**Files:** `src/server/orchestrator/engine.ts`

Implement `resolveAgentForTask()` method:

```typescript
private resolveAgentForTask(taskType: TaskNode['taskType']): AgentId {
  const agentMap: Record<TaskNode['taskType'], AgentId> = {
    backend: 'node-backend',
    frontend: 'next-ux',
    testing: 'ts-testing',
    documentation: 'orchestrator-project',
    orchestration: 'orchestrator-project',
  };
  return agentMap[taskType] ?? 'orchestrator-project';
}
```

### Step 4: Implement onDoRPass handler

**Files:** `src/server/orchestrator/engine.ts`

```typescript
private async onDoRPass(event: DoRPassEvent): Promise<void> {
  const context = this.epicRegistry.get(event.ticketRef);
  if (!context) {
    throw new Error(`No context for ticket ${event.ticketRef}`);
  }
  
  // 1. Fetch full ticket from Jira
  const ticket = await this.jiraClient.getTicket(event.ticketRef);
  
  // 2. Decompose into task graph
  const decomposition = await decomposeTicket(ticket);
  
  // 3. Store decomposition in context
  context.taskGraph = decomposition.graph;
  context.decomposition = decomposition;
  
  // 4. Generate plan summary for human approval
  const planSummary = this.generatePlanSummary(decomposition);
  
  // 5. Request human approval
  await this.requestHumanApproval(event.ticketRef, planSummary);
  
  // 6. Transition to awaiting-approval state
  await this.transitionState(event.ticketRef, 'awaiting-approval');
}
```

### Step 5: Implement onPlanApproved handler

**Files:** `src/server/orchestrator/engine.ts`

```typescript
private async onPlanApproved(event: PlanApprovedEvent): Promise<void> {
  const context = this.epicRegistry.get(event.ticketRef);
  if (!context?.taskGraph) {
    throw new Error(`No task graph for ticket ${event.ticketRef}`);
  }
  
  // 1. Log approval in audit trail
  await this.auditLog('plan_approved', event);
  
  // 2. Transition to in-progress
  await this.transitionState(event.ticketRef, 'in-progress');
  
  // 3. Dispatch root tasks (no dependencies)
  const rootTasks = context.taskGraph.rootTaskIds;
  for (const taskId of rootTasks) {
    await this.dispatchTask(event.ticketRef, taskId);
  }
  
  // 4. Send status notification
  await this.notifyStatus(event.ticketRef, 'Execution started', 'info');
}
```

### Step 6: Implement task dispatch

**Files:** `src/server/orchestrator/engine.ts`

```typescript
private async dispatchTask(ticketRef: string, taskId: string): Promise<void> {
  const context = this.epicRegistry.get(ticketRef);
  const taskNode = context?.taskGraph?.nodes.get(taskId);
  if (!taskNode) {
    throw new Error(`Task ${taskId} not found in graph`);
  }
  
  // 1. Resolve agent for task type
  const agentId = this.resolveAgentForTask(taskNode.taskType);
  
  // 2. Check agent availability
  const agentStatus = this.agentRegistry.getStatus(agentId);
  if (agentStatus?.status === 'offline') {
    // Queue for retry
    await this.queueTaskForRetry(ticketRef, taskId);
    return;
  }
  
  // 3. Create TaskAssignment message
  const assignment: TaskAssignment = {
    kind: 'task-assignment',
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef,
    taskId,
    agentId,
    taskType: taskNode.taskType,
    title: taskNode.title,
    description: taskNode.description,
    context: {
      epicContext: context,
      dependencyResults: this.getDependencyResults(ticketRef, taskNode.dependsOn),
    },
  };
  
  // 4. Publish to message bus
  await this.messageBus.publish('task-assignment', assignment);
  
  // 5. Update tracking
  context.activeTasks.set(taskId, { agentId, startedAt: new Date().toISOString() });
}
```

### Step 7: Implement onTaskCompleted handler

**Files:** `src/server/orchestrator/engine.ts`

```typescript
private async onTaskCompleted(event: TaskCompletedEvent): Promise<void> {
  const context = this.epicRegistry.get(event.ticketRef);
  if (!context) return;
  
  // 1. Mark task complete
  context.completedTasks.add(event.taskId);
  context.activeTasks.delete(event.taskId);
  context.taskResults.set(event.taskId, event.result);
  
  // 2. Check for dependent tasks now unblocked
  const unblockedTasks = this.findUnblockedTasks(context);
  for (const taskId of unblockedTasks) {
    await this.dispatchTask(event.ticketRef, taskId);
  }
  
  // 3. Check if all tasks complete
  if (this.allTasksComplete(context)) {
    // Trigger DoD validation
    await this.requestDoDValidation(event.ticketRef);
  }
}

private findUnblockedTasks(context: EpicContext): string[] {
  const unblocked: string[] = [];
  for (const [taskId, node] of context.taskGraph.nodes) {
    if (context.completedTasks.has(taskId)) continue;
    if (context.activeTasks.has(taskId)) continue;
    
    const dependenciesMet = node.dependsOn.every(
      depId => context.completedTasks.has(depId)
    );
    if (dependenciesMet) {
      unblocked.push(taskId);
    }
  }
  return unblocked;
}
```

### Step 8: Implement remaining event handlers

**Files:** `src/server/orchestrator/engine.ts`

Implement handlers for:

- `onDoRFail`: Notify failure, transition to blocked, add Jira comment
- `onDoDPass`: Trigger merge workflow, transition to review
- `onDoDFail`: Notify failure, request remediation or human review
- `onPlanRejected`: Close task, update Jira status, notify requester
- `onPlanRevisionRequested`: Re-run decomposition with feedback, request new approval
- `onPlanExpired`: Send reminder notification, keep in queue (NO auto-approve)

### Step 9: Add database persistence for state checkpoints

**Files:** `src/server/orchestrator/persistence.ts` (create)

```typescript
export async function saveEpicContext(
  ticketRef: string,
  context: EpicContext
): Promise<void> {
  await prisma.epicState.upsert({
    where: { ticketRef },
    update: { context: JSON.stringify(context), updatedAt: new Date() },
    create: { ticketRef, context: JSON.stringify(context) },
  });
}

export async function loadEpicContext(
  ticketRef: string
): Promise<EpicContext | null> {
  const record = await prisma.epicState.findUnique({ where: { ticketRef } });
  return record ? JSON.parse(record.context) : null;
}
```

### Step 10: Subscribe to TaskCompletion messages

**Files:** `src/server/orchestrator/engine.ts`

In constructor or `start()` method:

```typescript
this.messageBus.subscribe('task-completion', async (message) => {
  const completion = message as TaskCompletion;
  await this.onTaskCompleted({
    kind: 'task-completed',
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef: completion.ticketRef,
    taskId: completion.taskId,
    result: completion.result,
  });
});
```

## Testing Requirements

### Unit Tests

- `__tests__/server/orchestrator/engine.test.ts`
  - Test each event handler in isolation with mocked dependencies
  - Test state transitions trigger correctly
  - Test error handling (missing context, agent unavailable)
- `__tests__/server/orchestrator/decompose.test.ts`
  - Test task decomposition with mocked LLM response
  - Test Zod validation of LLM output
  - Test dependency graph construction
- `__tests__/server/orchestrator/persistence.test.ts`
  - Test save/load round-trip
  - Test upsert behavior

### Integration Tests

- Full flow: Jira event → DoR check → decomposition → approval → dispatch → completion → DoD check
- Test with multiple concurrent tasks
- Test dependency ordering (parent completes before children dispatch)

### Budget Constraints

- Unit test suite must complete in <3 seconds
- Individual orchestrator test file <500ms
- Zero skipped tests

## Acceptance Criteria

- [ ] `TaskTypeSchema` includes `documentation` type
- [ ] LLM client (`src/server/llm/`) implemented with Anthropic SDK
- [ ] LLM client has stub for development without API key
- [ ] Prisma schema has `TaskDecomposition` model
- [ ] `onDoRPass` decomposes ticket and requests human approval
- [ ] `onPlanApproved` dispatches root tasks to agents via message bus
- [ ] `onTaskCompleted` unblocks dependent tasks and dispatches them
- [ ] All tasks complete → triggers DoD validation
- [ ] `onDoDPass` triggers merge workflow
- [ ] Agent resolution correctly maps task types to agent IDs (including `documentation`)
- [ ] Dependency graph is respected (children wait for parents)
- [ ] Concurrent task limit enforced (`maxConcurrentTasksPerEpic`)
- [ ] Epic state is checkpointed to database on transitions
- [ ] Message bus subscriptions receive and handle TaskCompletion
- [ ] No auto-approval on plan expiration (send reminder instead)
- [ ] Audit logging for all state transitions
- [ ] All async operations accept `AbortSignal`
- [ ] Unit tests pass within 3-second budget

## Dependencies

- **Depends on:** Plan 01 (Jira events), Plan 02 (Gate services), Plan 03 (Slack notifications)
- **DevOps:** Anthropic API credentials (DEVOPS-NEEDS.md item #5)
- **Blocks:** Plan 06 (Human Approval — orchestrator emits events), Plan 09 (Bug Pipeline), Plan 10 (Feature/Epic Pipelines)

## Estimated Conversations

3-4 conversations:
1. LLM client infrastructure + TaskTypeSchema update + Prisma migration
2. Event handlers + task decomposition function
3. Message bus integration + persistence + concurrent limits
4. Testing and edge cases
