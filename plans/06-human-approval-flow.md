# Plan 06: Human-Gated Planning & Approval Flow

## Overview

Implement the complete human approval workflow that enforces mandatory human review before any agent executes implementation work. This includes plan presentation, approval UI in the dashboard, Slack routing for approvals, revision cycles with limits, and expiration handling. **Critical rule: NO automatic approval under any circumstances — not even on timeout.**

## Prerequisites

- Plan 03 complete: Slack MCP client for approval notifications
- Plan 04 complete: Orchestrator handles plan-approved/rejected/revision events
- Plan 05 complete: ApprovalService and API routes operational
- Prisma Approval model migrated to database

## Current State

| Asset | Path | Status |
|-------|------|--------|
| Approval model | `prisma/schema.prisma` | Complete — `Approval` with status, type, expiry fields |
| HumanApprovalRequest type | `src/types/agent-protocol.ts` | Complete — message type defined |
| Orchestrator handlers | `src/server/orchestrator/engine.ts` | Plan 04 implements event handling |
| Approval API routes | `src/app/api/approvals/` | Plan 05 wires to services |
| Approvals dashboard page | `src/app/dashboard/approvals/page.tsx` | Empty shell |
| Human approval skill | `.github/skills/human-plan-approval/SKILL.md` | Complete — full workflow definition |
| Config | `src/server/orchestrator/types.ts` | `approvalTimeoutMs`, `maxRevisionCycles` defined |

## Scope

### In Scope

- Plan presentation format (structured summary with dependency graph)
- Dashboard approval UI (view plan, approve/reject/request revision with comments)
- Slack approval routing (notification with deep link + optional inline actions)
- Revision cycle tracking (max 3 revisions, then escalate)
- Expiration handling (send reminder, keep pending — NO auto-approve)
- Audit logging for all approval decisions
- Role-based access control (only `approver` role can take actions)

### Out of Scope

- Full dependency graph visualization (show text summary; interactive graph is future)
- Mobile-optimized approval UI
- Approval delegation / proxy flow
- Multi-approver workflows (single approver sufficient for MVP)

## Research Questions

1. **Approver role** — Where is the `approver` role defined? In the Prisma User model? Session claims? Need to verify RBAC source.
2. **Revision tracking** — Does the Approval model have a `revisionCount` field? Need to track how many times a plan has been revised.
3. **Expiration reminders** — How often should we send reminders for expiring approvals? Every 4 hours? Daily?
4. **Slack inline vs link-only** — Should Slack approve/reject buttons work inline, or just link to dashboard? Inline is better UX but adds complexity.

## Architecture Decisions

### AD-01: Dashboard as primary approval interface

Dashboard is the authoritative approval interface with full plan details. Slack notifications link to the dashboard. Rationale: Complex plan details don't fit in Slack messages; dashboard provides better UX for reviewing dependency graphs.

### AD-02: Optional Slack inline actions

Implement Slack button actions that link to dashboard initially. Phase 2 can add inline approve/reject if the plan is simple enough (bug fixes). Rationale: Ship faster, add inline later based on user feedback.

### AD-03: Reminder-based expiration handling

When an approval expires (reaches `expiresAt`), the system:
1. Sends a reminder notification to Slack
2. Extends `expiresAt` by the configured timeout period
3. Keeps the approval in `PENDING` status
4. Logs the expiration event

**Never auto-approves.** Rationale: Human oversight is the core value of the governance model.

### AD-04: Revision cycle limits with escalation

After `maxRevisionCycles` (default: 3) revision requests:
1. The approval is marked as `ESCALATED`
2. A notification is sent to a supervisor channel
3. The original requester is notified
4. No more automatic revisions; manual intervention required

Rationale: Prevents infinite revision loops, surfaces poorly-scoped tickets.

## Implementation Steps

### Step 1: Extend Prisma Approval model

**Files:** `prisma/schema.prisma`

Add revision tracking and plan details:

```prisma
model Approval {
  id              String         @id @default(cuid())
  pipelineId      String         // ticketRef
  type            ApprovalType
  status          ApprovalStatus @default(PENDING)
  
  // Plan details (stored as JSON)
  planSummary     String?        @db.Text
  planHash        String?        // SHA-256 of plan for audit
  affectedFiles   String[]       // List of files to be modified
  estimatedPoints Int?
  riskLevel       String?        // 'low' | 'medium' | 'high'
  
  // Revision tracking
  revisionCount   Int            @default(0)
  revisionHistory Json[]         @default([])
  
  // Timing
  createdAt       DateTime       @default(now())
  expiresAt       DateTime
  decidedAt       DateTime?
  
  // Actors
  requestedBy     String
  decidedBy       String?
  decisionComment String?        @db.Text
  
  @@index([status])
  @@index([pipelineId])
}
```

Run migration: `npx prisma migrate dev --name add-approval-fields`

### Step 2: Create plan summary generator

**Files:** `src/server/orchestrator/plan-summary.ts` (create)

```typescript
import type { DecompositionResult, TaskGraph } from './types';
import crypto from 'crypto';

export interface PlanSummary {
  ticketRef: string;
  title: string;
  summary: string;           // Human-readable description
  taskCount: number;
  estimatedPoints: number;
  affectedFiles: string[];
  riskAreas: string[];
  riskLevel: 'low' | 'medium' | 'high';
  dependencyGraph: string;   // ASCII or Mermaid representation
  planHash: string;          // SHA-256 for audit
}

export function generatePlanSummary(
  ticketRef: string,
  title: string,
  decomposition: DecompositionResult
): PlanSummary {
  const taskCount = decomposition.graph.nodes.size;
  const riskLevel = calculateRiskLevel(decomposition);
  const dependencyGraph = renderDependencyGraph(decomposition.graph);
  
  const summaryText = buildSummaryText(decomposition);
  const planHash = crypto
    .createHash('sha256')
    .update(summaryText)
    .digest('hex');
  
  return {
    ticketRef,
    title,
    summary: summaryText,
    taskCount,
    estimatedPoints: decomposition.totalEstimatedPoints,
    affectedFiles: decomposition.affectedFiles,
    riskAreas: decomposition.riskAreas,
    riskLevel,
    dependencyGraph,
    planHash,
  };
}

function calculateRiskLevel(d: DecompositionResult): 'low' | 'medium' | 'high' {
  if (d.riskAreas.length > 3 || d.totalEstimatedPoints > 13) return 'high';
  if (d.riskAreas.length > 1 || d.totalEstimatedPoints > 5) return 'medium';
  return 'low';
}

function renderDependencyGraph(graph: TaskGraph): string {
  // Generate Mermaid flowchart syntax
  const lines = ['graph TD'];
  for (const [taskId, node] of graph.nodes) {
    lines.push(`  ${taskId}["${node.title}"]`);
    for (const depId of node.dependsOn) {
      lines.push(`  ${depId} --> ${taskId}`);
    }
  }
  return lines.join('\n');
}
```

### Step 3: Create approval request in orchestrator

**Files:** `src/server/orchestrator/engine.ts`

In `onDoRPass`, after decomposition:

```typescript
private async requestHumanApproval(
  ticketRef: string,
  planSummary: PlanSummary
): Promise<void> {
  // 1. Create Approval record
  const approval = await prisma.approval.create({
    data: {
      pipelineId: ticketRef,
      type: 'PLAN_APPROVAL',
      status: 'PENDING',
      planSummary: planSummary.summary,
      planHash: planSummary.planHash,
      affectedFiles: planSummary.affectedFiles,
      estimatedPoints: planSummary.estimatedPoints,
      riskLevel: planSummary.riskLevel,
      expiresAt: new Date(Date.now() + this.config.approvalTimeoutMs),
      requestedBy: 'system', // TODO: track original requester
    },
  });
  
  // 2. Send Slack notification with dashboard link
  const dashboardUrl = `${getEnv().DASHBOARD_URL}/dashboard/approvals?id=${approval.id}`;
  await this.slackClient.sendApprovalRequest(
    ticketRef,
    planSummary.summary,
    dashboardUrl
  );
  
  // 3. Emit event for tracking
  await this.auditLog('approval_requested', {
    approvalId: approval.id,
    ticketRef,
    planHash: planSummary.planHash,
  });
}
```

### Step 4: Implement dashboard approval UI

**Files:** `src/app/dashboard/approvals/page.tsx`

```typescript
import { getServerContext } from '@/server/context';
import { getPendingApprovals } from '@/server/services/approval.service';
import { ApprovalCard } from '@/components/organisms/ApprovalCard';
import { Suspense } from 'react';

export default async function ApprovalsPage() {
  return (
    <main className="container mx-auto py-8">
      <h1 className="text-2xl font-semibold mb-6">Pending Approvals</h1>
      <Suspense fallback={<ApprovalListSkeleton />}>
        <ApprovalList />
      </Suspense>
    </main>
  );
}

async function ApprovalList() {
  const context = getServerContext();
  const { data: approvals } = await getPendingApprovals(
    { engine: context.engine, slackClient: context.slackClient },
    { limit: 20 }
  );
  
  if (approvals.length === 0) {
    return <p className="text-muted">No pending approvals</p>;
  }
  
  return (
    <div className="space-y-4">
      {approvals.map(approval => (
        <ApprovalCard key={approval.id} approval={approval} />
      ))}
    </div>
  );
}
```

### Step 5: Create ApprovalCard organism

**Files:** `src/components/organisms/ApprovalCard/ApprovalCard.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import type { Approval } from '@prisma/client';

interface ApprovalCardProps {
  approval: Approval;
}

export function ApprovalCard({ approval }: ApprovalCardProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleAction = async (action: 'approve' | 'reject' | 'revision') => {
    setIsSubmitting(true);
    try {
      await fetch(`/api/approvals/${approval.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment }),
      });
      // Refresh page or update local state
      window.location.reload();
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <article className="bg-surface border border-border rounded-lg p-6">
      <header className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-lg font-medium">{approval.pipelineId}</h2>
          <Badge variant={riskVariant(approval.riskLevel)}>
            {approval.riskLevel} risk
          </Badge>
        </div>
        <time className="text-sm text-muted">
          Expires: {new Date(approval.expiresAt).toLocaleString()}
        </time>
      </header>
      
      <section className="mb-4">
        <h3 className="font-medium mb-2">Plan Summary</h3>
        <pre className="bg-muted/10 p-4 rounded text-sm overflow-x-auto">
          {approval.planSummary}
        </pre>
      </section>
      
      <section className="mb-4">
        <h3 className="font-medium mb-2">Affected Files ({approval.affectedFiles.length})</h3>
        <ul className="text-sm space-y-1">
          {approval.affectedFiles.slice(0, 10).map(file => (
            <li key={file} className="font-mono">{file}</li>
          ))}
          {approval.affectedFiles.length > 10 && (
            <li className="text-muted">... and {approval.affectedFiles.length - 10} more</li>
          )}
        </ul>
      </section>
      
      <section className="mb-4">
        <label htmlFor="comment" className="block font-medium mb-2">
          Comment (optional)
        </label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full p-2 border border-border rounded"
          rows={3}
          placeholder="Add feedback or reason for your decision..."
        />
      </section>
      
      <footer className="flex gap-3">
        <Button
          variant="primary"
          onClick={() => handleAction('approve')}
          disabled={isSubmitting}
        >
          ✓ Approve
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleAction('revision')}
          disabled={isSubmitting}
        >
          📝 Request Revision
        </Button>
        <Button
          variant="danger"
          onClick={() => handleAction('reject')}
          disabled={isSubmitting}
        >
          ✗ Reject
        </Button>
      </footer>
    </article>
  );
}

function riskVariant(level: string | null): 'success' | 'warning' | 'error' {
  if (level === 'high') return 'error';
  if (level === 'medium') return 'warning';
  return 'success';
}
```

### Step 6: Implement revision cycle handling

**Files:** `src/server/services/approval.service.ts`

Update `requestRevision()`:

```typescript
export async function requestRevision(
  deps: ApprovalServiceDeps,
  approvalId: string,
  userId: string,
  feedback: string
): Promise<Approval> {
  const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
  if (!approval) throw new NotFoundError('Approval not found');
  
  const newRevisionCount = approval.revisionCount + 1;
  
  // Check for max revisions
  if (newRevisionCount > deps.engine.config.maxRevisionCycles) {
    // Escalate instead of allowing more revisions
    await prisma.approval.update({
      where: { id: approvalId },
      data: { status: 'ESCALATED' },
    });
    
    // Notify supervisor channel
    await deps.slackClient.sendNotification({
      channel: 'supervisor-approvals',
      text: `⚠️ Approval ${approval.pipelineId} exceeded max revisions (${newRevisionCount}). Manual intervention required.`,
    });
    
    throw new Error(`Max revision cycles (${deps.engine.config.maxRevisionCycles}) exceeded. Approval escalated.`);
  }
  
  // Record revision in history
  const revisionRecord = {
    cycle: newRevisionCount,
    requestedBy: userId,
    feedback,
    timestamp: new Date().toISOString(),
  };
  
  await prisma.approval.update({
    where: { id: approvalId },
    data: {
      revisionCount: newRevisionCount,
      revisionHistory: {
        push: revisionRecord,
      },
    },
  });
  
  // Emit event to orchestrator for re-planning
  await deps.engine.handleEvent({
    kind: 'plan-revision-requested',
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ticketRef: approval.pipelineId,
    requestedBy: userId,
    feedback,
    revisionCycle: newRevisionCount,
  });
  
  return approval;
}
```

### Step 7: Implement expiration checker cron job

**Files:** `src/server/workers/expiration-checker.ts` (create)

```typescript
import { prisma } from '@/server/db/client';
import { getSlackMCPClient } from '@/server/mcp/slack';
import { getEnv } from '@/server/config/env';

/**
 * Check for expiring approvals and send reminders.
 * Run this on a schedule (e.g., every hour via cron or BullMQ repeatable job).
 */
export async function checkExpiringApprovals(): Promise<void> {
  const env = getEnv();
  const slackClient = getSlackMCPClient();
  
  // Find approvals expiring in the next hour
  const soonToExpire = await prisma.approval.findMany({
    where: {
      status: 'PENDING',
      expiresAt: {
        lte: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        gt: new Date(),
      },
    },
  });
  
  for (const approval of soonToExpire) {
    await slackClient.sendNotification({
      channel: env.SLACK_APPROVAL_CHANNEL ?? '#approvals',
      text: `⏰ Reminder: Approval for ${approval.pipelineId} expires in less than 1 hour. Review: ${env.DASHBOARD_URL}/dashboard/approvals?id=${approval.id}`,
    });
  }
  
  // Find expired approvals — extend timeout, send reminder
  const expired = await prisma.approval.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
  });
  
  for (const approval of expired) {
    // Extend expiration (DO NOT auto-approve)
    const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24 hours
    await prisma.approval.update({
      where: { id: approval.id },
      data: { expiresAt: newExpiresAt },
    });
    
    // Send reminder
    await slackClient.sendNotification({
      channel: env.SLACK_APPROVAL_CHANNEL ?? '#approvals',
      text: `🔴 Approval for ${approval.pipelineId} has expired and been extended. Human action required: ${env.DASHBOARD_URL}/dashboard/approvals?id=${approval.id}`,
    });
    
    // Log event
    await prisma.auditLog.create({
      data: {
        action: 'approval_expired',
        entityType: 'Approval',
        entityId: approval.id,
        payload: { oldExpiresAt: approval.expiresAt, newExpiresAt },
      },
    });
  }
}
```

### Step 8: Add BullMQ repeatable job for expiration checks

**Files:** `src/server/queues/index.ts`

```typescript
// Add repeatable job for expiration checks
export async function startExpirationChecker(): Promise<void> {
  await expirationQueue.add(
    'check-expirations',
    {},
    {
      repeat: { every: 60 * 60 * 1000 }, // Every hour
    }
  );
}
```

## Testing Requirements

### Unit Tests

- `__tests__/server/orchestrator/plan-summary.test.ts`
  - Test risk level calculation
  - Test dependency graph rendering
  - Test plan hash generation
- `__tests__/server/services/approval.service.test.ts`
  - Test revision count tracking
  - Test max revision escalation
  - Test revision history recording
- `__tests__/server/workers/expiration-checker.test.ts`
  - Test reminder notification for soon-to-expire
  - Test expiration extension (no auto-approve)
  - Test audit logging

### Integration Tests

- Full approval flow: request → Slack notification → dashboard view → approve → orchestrator event
- Revision flow: request → revision → re-plan → request again
- Expiration flow: create → wait → extend → reminder

### E2E Tests (Plan 07)

- User views pending approvals
- User approves a plan with comment
- User requests revision with feedback
- User rejects a plan

### Budget Constraints

- Unit test suite <3 seconds
- Zero skipped tests

## Acceptance Criteria

- [ ] Plan summary includes: task count, affected files, risk level, dependency graph
- [ ] Approval record created in database with plan hash for audit
- [ ] Slack notification sent with dashboard link on approval request
- [ ] Dashboard approval UI displays all pending approvals
- [ ] ApprovalCard shows plan details, affected files, actions
- [ ] Approve/Reject/Revision buttons emit correct events
- [ ] Revision count tracked; escalation after max cycles
- [ ] Revision history recorded with feedback
- [ ] Expiration checker runs hourly, sends reminders
- [ ] Expired approvals are extended, NOT auto-approved
- [ ] All approval actions require `approver` role
- [ ] Audit log records all approval decisions with plan hash
- [ ] Unit tests pass within budget

## Dependencies

- **Depends on:** Plan 03 (Slack client), Plan 04 (Orchestrator events), Plan 05 (API + services)
- **Blocks:** Plan 09 (Bug pipeline uses simplified approval), Plan 10 (Feature/Epic pipelines use full approval)

## Estimated Conversations

2-3 conversations: one for plan summary + approval creation, one for dashboard UI + ApprovalCard, one for expiration handling + tests.
