# Plan 08: OpenClaw Integration & Hybrid Deployment

## Overview

Integrate OpenClaw as the multi-agent task execution engine. Implement `AgentRunner.executeTask()` with actual agent invocation, create a mock executor for development, and architect the system for hybrid deployment (local Docker + future EC2). Enable multi-repo support so the orchestration layer can target different Git projects.

## Prerequisites

- Plan 04 complete: Orchestrator dispatches `TaskAssignment` via MessageBus
- Agent definitions exist in `.claude/agents/`
- Docker Compose infrastructure running (PostgreSQL + Redis)
- Anthropic API credentials provisioned (DEVOPS-NEEDS #5)

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Agent runner | `src/server/agents/runner.ts` | `executeTask()` is TODO — validates agent + updates status, but no execution |
| Agent registry | `src/server/agents/registry.ts` | Complete — config + status tracking |
| Message bus | `src/server/agents/message-bus.ts` | Complete — typed pub/sub, Zod validated |
| Agent types | `src/server/agents/types.ts` | Complete — `AgentConfig` with `capabilities`, `ownedPaths` |
| Agent protocol | `src/types/agent-protocol.ts` | Complete — `TaskAssignment` (constraints, acceptanceCriteria), `TaskCompletion` (changedFiles, testRequirements, summary) |
| Agent definitions | `.claude/agents/*.md` | Complete — 4 agents with roles, constraints, owned paths |
| Docker Compose | `docker-compose.yml` | PostgreSQL + Redis only |
| Docker build script | `scripts/docker/docker-build.sh` | Stub |
| Env config | `src/server/config/env.ts` | No OpenClaw or Anthropic vars |
| Package.json | `package.json` | No `@anthropic-ai/sdk` or `@octokit/rest` |

## Scope

### In Scope

- Research and document OpenClaw API / SDK
- Create execution abstraction layer (`AgentExecutor` interface)
- Implement `AgentRunner.executeTask()` against the abstraction
- Create `MockAgentExecutor` for development without OpenClaw
- Create `ClaudeCodeExecutor` as primary executor using Claude API + git worktrees
- Add OpenClaw env vars to `src/server/config/env.ts`
- Add `@anthropic-ai/sdk` dependency for LLM-powered agents
- Agent domain isolation (file path boundaries per agent type)
- Docker Compose profile for OpenClaw (optional startup)
- Document AWS EC2 deployment architecture

### Out of Scope

- Full Terraform/CDK infrastructure-as-code (document architecture only)
- Custom OpenClaw modifications or plugins
- Agent fine-tuning or prompt engineering (use `.claude/agents/*.md` as-is)
- Real-time agent output streaming to dashboard (future enhancement)
- Multi-repo deployment (architecture documented, single-repo implemented first)

## Research Questions — Resolved

### Q1: OpenClaw API surface
**Answer:** OpenClaw is an agent orchestration engine. For the MVP, we'll build an **executor abstraction layer** so the backend is pluggable. The primary executor will use the **Anthropic Claude API** to power agents (Claude Code-style task execution with tool use). OpenClaw can be integrated as a second executor later.

### Q2: Agent execution model
**Answer:** Each agent execution is:
1. Clone/checkout target repo to isolated worktree
2. Build system prompt from `.claude/agents/<agentId>.md` + applicable rules from `.claude/rules/`
3. Call Claude API with task context (changed files, prior results, constraints)
4. Parse response: extract file changes, test requirements, summary
5. Commit changes to agent's feature branch

### Q3: Agent definition format
**Answer:** Use existing `.claude/agents/*.md` files as system prompts. These already define roles, constraints, owned paths — exactly what an LLM agent needs. No separate config format needed.

### Q4: Task context injection
**Answer:** Context is built from:
- `TaskAssignment.description` — what to do
- `TaskAssignment.constraints` — rules to follow
- `TaskAssignment.acceptanceCriteria` — how to verify
- Agent's `ownedPaths` — which files to read/modify
- Prior task results (for dependent tasks)
- File contents from target repo (read files within agent's domain)

### Q5: Result format
**Answer:** Executor returns data matching `TaskCompletion`:
- `changedFiles: string[]` — list of modified file paths
- `testRequirements: string[]` — tests the agent recommends running
- `summary: string` — what was done and why

### Q6: Authentication
**Answer:** Git operations use `GITHUB_TOKEN` (PAT or GitHub App token). Anthropic API uses `ANTHROPIC_API_KEY`. Both stored in env vars / AWS Secrets Manager.

### Q7: Concurrency model
**Answer:** Controlled by `AgentCapabilitySchema.maxConcurrentTasks` (default 1 per agent). The `AgentRunner` checks `registry.getConfig(agentId).capabilities.maxConcurrentTasks` before dispatching. BullMQ `agent-tasks` queue already has `concurrency: 3`.

### Q8: Error handling
**Answer:** Three failure modes:
- **Timeout:** `AbortSignal.timeout()` per `async-concurrency.md` rule
- **API error:** Circuit breaker on Claude API calls
- **Agent failure:** Agent returns incomplete or invalid result → publish `TaskCompletion` with empty `changedFiles` and error `summary`

## Gaps Identified During Research

| Gap | Resolution |
|-----|------------|
| `@anthropic-ai/sdk` not in package.json | Add as dependency in this plan |
| `@octokit/rest` not in package.json | Add as dependency (Plan 09 needs it for PR creation) |
| No `ANTHROPIC_API_KEY` env var | Add to env schema (already in DEVOPS-NEEDS #5) |
| No `GITHUB_TOKEN` env var | Add to env schema |
| `AgentConfig` lacks `systemPromptPath` | Derive from agentId: `.claude/agents/${agentId}.md` — no schema change needed |
| No git worktree management | Create utility in `src/server/lib/git-worktree.ts` |
| Runner doesn't bridge to orchestrator on completion | `handleCompletion()` TODO needs to trigger DoD validation |

## Architecture Decisions

### AD-01: Executor abstraction layer

Define an `AgentExecutor` interface that the runner calls. Concrete implementations:
- `MockAgentExecutor` — Returns predefined results (development)
- `ClaudeCodeExecutor` — Uses Anthropic API with tool use (production)
- Future: `OpenClawExecutor` — Delegates to OpenClaw service

```typescript
export interface AgentExecutor {
  execute(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResult>;
  healthCheck(): Promise<{ status: 'healthy' | 'unhealthy' | 'disabled' }>;
}
```

### AD-02: Git worktree isolation

Each agent execution creates an isolated git worktree on a dedicated branch. This prevents concurrent agents from conflicting. Branch naming per `git-safety.md`:
```
fix/BELVA-XXX-agent-<agentId>
feature/BELVA-XXX-agent-<agentId>
```

### AD-03: System prompt composition

Agent system prompt = `.claude/agents/<agentId>.md` + relevant `.claude/rules/*.md` based on `ownedPaths`. This matches how Claude Code agents work today.

### AD-04: Feature-flagged executor selection

```typescript
AGENT_EXECUTOR: z.enum(["mock", "claude", "openclaw"]).default("mock"),
```

Development defaults to `mock`. Production uses `claude`. OpenClaw added when integrated.

## Implementation Steps

### Step 1: Add new dependencies and env vars

**Files:** `package.json`, `src/server/config/env.ts`

```bash
npm install @anthropic-ai/sdk @octokit/rest
```

Add to env schema:
```typescript
// Agent execution
AGENT_EXECUTOR: z.enum(["mock", "claude", "openclaw"]).default("mock"),
ANTHROPIC_API_KEY: z.string().optional(),
ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),

// GitHub (for PR creation in Plans 09/10)
GITHUB_TOKEN: z.string().optional(),
GITHUB_REPO: z.string().optional(), // format: "owner/repo"

// OpenClaw (future)
OPENCLAW_ENDPOINT: z.string().url().optional(),
OPENCLAW_API_KEY: z.string().optional(),
```

### Step 2: Define execution types

**Files:** `src/server/agents/execution/types.ts` (create)

```typescript
import { z } from "zod";
import { AgentIdSchema, TaskTypeSchema } from "@/types/agent-protocol";

export const ExecutionRequestSchema = z.object({
  taskId: z.string().uuid(),
  agentId: AgentIdSchema,
  taskType: TaskTypeSchema,
  ticketRef: z.string().min(1),
  description: z.string().min(1),
  constraints: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  domainPaths: z.array(z.string()),
  systemPrompt: z.string().min(1),
  priorResults: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().default(600_000),
});
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

export const ExecutionResultSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["completed", "failed", "timeout"]),
  changedFiles: z.array(z.string()),
  testRequirements: z.array(z.string()),
  summary: z.string(),
  durationMs: z.number().int().min(0),
  error: z.string().optional(),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

export interface AgentExecutor {
  execute(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResult>;
  healthCheck(): Promise<{ status: "healthy" | "unhealthy" | "disabled" }>;
}
```

### Step 3: Create MockAgentExecutor

**Files:** `src/server/agents/execution/mock-executor.ts` (create)

Returns valid `ExecutionResult` with simulated delay. Generates plausible file paths from the agent's `domainPaths`. Used for development and testing.

### Step 4: Create ClaudeCodeExecutor

**Files:** `src/server/agents/execution/claude-executor.ts` (create)

Uses `@anthropic-ai/sdk` to call Claude with:
- System prompt composed from agent definition + rules
- User message with task description, constraints, acceptance criteria
- Tool definitions for structured file editing output
- Response parsing to extract `changedFiles`, `testRequirements`, `summary`

Wrapped in `CircuitBreaker` + `withRetry()` per `infrastructure.md` rules.

### Step 5: Create system prompt composer

**Files:** `src/server/agents/execution/prompt-composer.ts` (create)

Reads `.claude/agents/<agentId>.md` and appends applicable rules from `.claude/rules/` based on the agent's `domainPaths` matching the rule's `appliesTo` patterns.

### Step 6: Implement AgentRunner.executeTask()

**Files:** `src/server/agents/runner.ts` (modify)

Replace the TODO with:
1. Compose system prompt via `composeSystemPrompt(agentId, ownedPaths)`
2. Build `ExecutionRequest` from `TaskAssignment` + `AgentConfig`
3. Call `executor.execute(request, signal)`
4. Publish `TaskCompletion` to MessageBus (success or failure)
5. Reset agent status in `finally` block

### Step 7: Create executor factory singleton

**Files:** `src/server/agents/execution/index.ts` (create)

Reads `AGENT_EXECUTOR` from env and returns the appropriate `AgentExecutor` implementation. Lazy singleton pattern matching existing singletons in the project.

### Step 8: Add executor health to health endpoint

**Files:** `src/app/api/health/route.ts` (modify)

Add `executor` status alongside existing `database` and `redis` checks.

### Step 9: Docker Compose OpenClaw profile

**Files:** `docker-compose.yml` (modify)

Add OpenClaw service under optional `openclaw` profile — only starts when explicitly requested via `docker compose --profile openclaw up`.

### Step 10: Document AWS EC2 deployment architecture

**Files:** `docs/deployment-architecture.md` (create)

Document: EC2 instance sizing, VPC/security groups, Secrets Manager integration, CloudWatch monitoring, deployment pipeline. Cross-reference DEVOPS-NEEDS.md.

## Files to Create/Modify

| Path | Action | Purpose |
|------|--------|---------|
| `src/server/agents/execution/types.ts` | Create | `ExecutionRequest`, `ExecutionResult`, `AgentExecutor` interface |
| `src/server/agents/execution/mock-executor.ts` | Create | Development mock |
| `src/server/agents/execution/claude-executor.ts` | Create | Anthropic API executor |
| `src/server/agents/execution/prompt-composer.ts` | Create | System prompt assembly |
| `src/server/agents/execution/index.ts` | Create | Factory singleton |
| `src/server/agents/runner.ts` | Modify | Wire `executeTask()` to executor |
| `src/server/config/env.ts` | Modify | Add executor/Anthropic/GitHub env vars |
| `src/app/api/health/route.ts` | Modify | Add executor health check |
| `docker-compose.yml` | Modify | Add OpenClaw profile |
| `docs/deployment-architecture.md` | Create | EC2 deployment docs |
| `package.json` | Modify | Add `@anthropic-ai/sdk`, `@octokit/rest` |

## Testing Requirements

### Unit Tests

- `__tests__/server/agents/execution/mock-executor.test.ts`
  - Test returns valid `ExecutionResult` for all task types
  - Test generates plausible file paths from domain paths
  - Test health check returns healthy
- `__tests__/server/agents/execution/claude-executor.test.ts`
  - Test API call with mocked Anthropic SDK
  - Test timeout handling (AbortSignal)
  - Test circuit breaker integration
  - Test result parsing from Claude response
- `__tests__/server/agents/execution/prompt-composer.test.ts`
  - Test reads agent definition file
  - Test loads applicable rules based on domain paths
  - Test handles missing agent file gracefully
- `__tests__/server/agents/runner.test.ts`
  - Test full execution flow with mock executor
  - Test status updates (idle → busy → idle)
  - Test error handling publishes failure completion
  - Test `TaskCompletion` message matches schema

### Budget Constraints

- Unit tests <3 seconds (mock executor is fast)
- 80%+ coverage on `src/server/agents/execution/`

## Acceptance Criteria

- [ ] `AgentExecutor` interface defined with `execute()` and `healthCheck()`
- [ ] `MockAgentExecutor` returns valid results for all task types
- [ ] `ClaudeCodeExecutor` calls Anthropic API with composed system prompt
- [ ] System prompt composed from `.claude/agents/<id>.md` + applicable `.claude/rules/*.md`
- [ ] `AgentRunner.executeTask()` TODO replaced with actual execution
- [ ] `TaskCompletion` published to MessageBus on success or failure
- [ ] Agent status correctly transitions: idle → busy → idle (or error)
- [ ] `AGENT_EXECUTOR` env var controls which executor is used
- [ ] `@anthropic-ai/sdk` and `@octokit/rest` added to dependencies
- [ ] Env vars added: `AGENT_EXECUTOR`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `GITHUB_TOKEN`, `GITHUB_REPO`
- [ ] Docker Compose includes OpenClaw service (optional profile)
- [ ] Health endpoint includes executor status
- [ ] All unit tests pass within 3s budget
- [ ] Zero `any` types — all external data validated with Zod

## Dependencies

- **Depends on:** Plan 04 (Orchestrator dispatches tasks via MessageBus)
- **Blocks:** Plan 09 (Bug pipeline needs agent execution), Plan 10 (Feature/Epic pipelines)
- **DevOps:** DEVOPS-NEEDS #5 (Anthropic API key), future GitHub token

## Estimated Conversations

2-3 conversations:
1. Execution types + MockExecutor + runner wiring + tests
2. ClaudeCodeExecutor implementation + prompt composer
3. Docker/deployment docs + integration testing

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Anthropic API rate limits | Medium — slows execution | Circuit breaker + backoff; mock executor for dev |
| Claude response format unexpected | Medium — parsing fails | Define structured tool_use schema; validate with Zod |
| OpenClaw API differs from expectations | Low — abstraction isolates | Executor interface allows swapping without runner changes |
| Agent produces invalid code | Medium — tests fail | Iterative loop in Plan 09 handles retries with error context |
