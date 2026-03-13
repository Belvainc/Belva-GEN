import type { AgentId, TaskType, TaskAssignment } from "@/types/agent-protocol";
import type { DomainEvent, EpicState, DoRFailEvent, DoDFailEvent } from "@/types/events";
import type { GateResult } from "@/types/gates";
import type {
  EpicContext,
  OrchestratorConfig,
  TaskNode,
  TaskResult,
  DecompositionResult,
} from "./types";
import {
  OrchestratorConfigSchema,
  EpicContextSchema,
  getRootTaskIds,
  getTaskNode,
} from "./types";
import { validateTransition } from "./state-machine";
import { decomposeTicket } from "./decompose";
import {
  saveEpicContext,
  loadEpicContext,
  saveDecomposition,
  auditLog,
  loadActiveEpics,
} from "./persistence";
import {
  generatePlanSummary as generatePlanSummaryFn,
  type PlanSummary,
} from "./plan-summary";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/server/config/env";
import { buildApprovalRequestPayload } from "@/server/mcp/slack/messages";
import type { JiraMCPClient } from "@/server/mcp/jira/client";
import type { SlackNotificationClient } from "@/server/mcp/slack/client";
import type { MessageBus } from "@/server/agents/message-bus";
import type { AgentRegistry } from "@/server/agents/registry";
import { createAgentLogger } from "@/lib/logger";
import { triageTicket } from "./triage";
import { decomposeFeatureTicket, executeFeaturePipeline } from "./feature-pipeline";
import { decomposeEpicTicket, executeEpicPipeline } from "./epic-pipeline";
import { getExecutor } from "@/server/agents/execution";
import { loadDecomposition, calculateProgress } from "@/server/services/progress.service";
import { evaluateDoD } from "@/server/services/gates";
import { agentTaskQueue } from "@/server/queues";

const logger = createAgentLogger("orchestrator-project");

// ─── Engine Dependencies ──────────────────────────────────────────────────────

export interface OrchestratorDependencies {
  jiraClient: JiraMCPClient;
  slackClient: SlackNotificationClient;
  messageBus: MessageBus;
  agentRegistry: AgentRegistry;
}

/**
 * Core orchestration engine that drives the epic lifecycle.
 * Receives events, evaluates gates, and delegates work to specialized agents.
 */
export class OrchestratorEngine {
  readonly config: OrchestratorConfig;
  private readonly epics: Map<string, EpicContext> = new Map();
  deps: OrchestratorDependencies | undefined;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = OrchestratorConfigSchema.parse(config ?? {});
    logger.info("Orchestrator engine initialized", {
      approvalTimeoutMs: this.config.approvalTimeoutMs,
      maxRevisionCycles: this.config.maxRevisionCycles,
      maxConcurrentTasksPerEpic: this.config.maxConcurrentTasksPerEpic,
    });
  }

  /**
   * Initialize the engine with dependencies.
   * Must be called before processing events.
   */
  async initialize(deps: OrchestratorDependencies): Promise<void> {
    this.deps = deps;

    // Subscribe to task completions
    this.deps.messageBus.subscribe("task-completion", async (message) => {
      await this.onTaskCompleted(message.sourceAgent, message.taskAssignmentId, {
        taskId: message.taskAssignmentId,
        success: true,
        changedFiles: message.changedFiles,
        summary: message.summary,
        completedAt: new Date().toISOString(),
      });
    });

    // Load active epics from database
    const activeEpics = await loadActiveEpics();
    for (const epic of activeEpics) {
      this.epics.set(epic.ticketRef, epic);
    }

    logger.info(`Engine initialized with ${activeEpics.length} active epics`);
  }

  /**
   * Process an incoming domain event and determine the next action.
   */
  async handleEvent(event: DomainEvent): Promise<void> {
    logger.info(`Processing event: ${event.kind}`, { ticketRef: event.ticketRef });

    switch (event.kind) {
      case "dor-pass":
        await this.onDoRPass(event.ticketRef, event.validatedCriteria);
        break;
      case "dor-fail":
        await this.onDoRFail(event);
        break;
      case "plan-approved":
        await this.onPlanApproved(event.ticketRef, event.approverIdentity);
        break;
      case "plan-rejected":
        await this.onPlanRejected(event.ticketRef, event.reason);
        break;
      case "plan-revision-requested":
        await this.onPlanRevisionRequested(
          event.ticketRef,
          event.revisionCount,
          event.feedback
        );
        break;
      case "plan-expired":
        await this.onPlanExpired(event.ticketRef);
        break;
      case "dod-pass":
        await this.onDoDPass(event.ticketRef);
        break;
      case "dod-fail":
        await this.onDoDFail(event);
        break;
      case "ideation-approved":
        await this.onIdeationApproved(event.ticketRef, event.stakeholderIdentity);
        break;
      case "ideation-rejected":
        await this.onIdeationRejected(event.ticketRef, event.reason);
        break;
      case "team-confirmed":
        await this.onTeamConfirmed(event.ticketRef, event.confirmedBy);
        break;
      case "review-requested":
        logger.info(`Review requested for ${event.ticketRef}`, { reviewType: event.reviewType });
        break;
      case "review-completed":
        await this.onReviewCompleted(event.ticketRef, event.verdict, event.findingSummary);
        break;
      case "task-blocked":
        await this.onTaskBlocked(event.ticketRef, event.taskId, event.agentId, event.reason, event.suggestedAction);
        break;
      case "learn-extracted":
        logger.info(`Knowledge extracted for ${event.ticketRef}`, {
          patternCount: event.patternCount,
          categories: event.categories,
        });
        break;
      case "epic-state-transition":
        logger.info(
          `Epic ${event.ticketRef}: ${event.fromState} → ${event.toState}`,
          { reason: event.reason }
        );
        break;
      default: {
        const _exhaustive: never = event;
        throw new Error(`Unhandled event kind: ${(_exhaustive as DomainEvent).kind}`);
      }
    }
  }

  /**
   * Transition an epic to a new state after validation.
   */
  async transitionEpic(
    ticketRef: string,
    targetState: EpicState,
    trigger: string
  ): Promise<GateResult> {
    const epic = this.epics.get(ticketRef);
    if (epic === undefined) {
      return {
        gateType: "dor",
        ticketRef,
        passed: false,
        evaluatedAt: new Date().toISOString(),
        violations: [
          {
            rule: "epic-exists",
            description: `Epic ${ticketRef} not found in registry`,
            severity: "error",
          },
        ],
      };
    }

    const fromState = epic.currentState;
    const result = validateTransition(fromState, targetState, trigger);

    if (!result.valid) {
      return {
        gateType: "dor",
        ticketRef,
        passed: false,
        evaluatedAt: new Date().toISOString(),
        violations: [
          {
            rule: "valid-transition",
            description: result.reason,
            severity: "error",
          },
        ],
      };
    }

    epic.currentState = targetState;
    epic.updatedAt = new Date().toISOString();

    // Persist state change
    await saveEpicContext(ticketRef, epic);

    // Audit log
    await auditLog("epic.transitioned", ticketRef, {
      fromState,
      toState: targetState,
      trigger,
    });

    logger.info(`Epic ${ticketRef} transitioned to ${targetState}`, {
      trigger,
      fromState,
    });

    return {
      gateType: "dor",
      ticketRef,
      passed: true,
      evaluatedAt: new Date().toISOString(),
      violations: [],
    };
  }

  /**
   * Register a new epic in the engine.
   */
  async registerEpic(ticketRef: string): Promise<void> {
    const now = new Date().toISOString();
    const context: EpicContext = EpicContextSchema.parse({
      ticketRef,
      currentState: "funnel",
      assignedAgents: [],
      revisionCount: 0,
      createdAt: now,
      updatedAt: now,
      activeTasks: [],
      completedTaskIds: [],
      taskResults: [],
    });

    this.epics.set(ticketRef, context);
    await saveEpicContext(ticketRef, context);
    await auditLog("epic.registered", ticketRef);

    logger.info(`Epic ${ticketRef} registered in funnel state`);
  }

  /**
   * Determine which agent should handle a given task type.
   */
  resolveAgent(taskType: TaskType): AgentId {
    switch (taskType) {
      case "backend":
        return "node-backend";
      case "frontend":
        return "next-ux";
      case "testing":
        return "ts-testing";
      case "documentation":
      case "orchestration":
        return "orchestrator-project";
      default: {
        const _exhaustive: never = taskType;
        throw new Error(`Unknown task type: ${String(_exhaustive)}`);
      }
    }
  }

  getEpic(ticketRef: string): EpicContext | undefined {
    return this.epics.get(ticketRef);
  }

  getAllEpics(): ReadonlyArray<EpicContext> {
    return Array.from(this.epics.values());
  }

  getEpicsByState(state: EpicState): ReadonlyArray<EpicContext> {
    return Array.from(this.epics.values()).filter(
      (epic) => epic.currentState === state
    );
  }

  // ─── Event Handlers ─────────────────────────────────────────────────────────

  /**
   * Handle DoR pass: triage ticket, decompose, and request human approval.
   * Routes to the appropriate pipeline based on ticket type and complexity.
   */
  private async onDoRPass(
    ticketRef: string,
    _validatedCriteria: string[]
  ): Promise<void> {
    const epic = this.epics.get(ticketRef);
    if (epic === undefined) {
      logger.error(`Epic ${ticketRef} not found for DoR pass`);
      return;
    }

    this.ensureDeps();

    try {
      // 1. Fetch full ticket from Jira
      const ticket = await this.deps.jiraClient.getTicket(ticketRef);

      // 2. Triage to determine pipeline type
      const triage = triageTicket(ticket);
      logger.info(`Triaged ${ticketRef} as ${triage.pipelineType}`, {
        complexity: triage.complexity,
        bypassPlanningGate: triage.bypassPlanningGate,
      });

      // 3. Route to appropriate decomposition pipeline
      let decomposition: DecompositionResult;

      if (triage.pipelineType === "feature" || triage.pipelineType === "epic") {
        // Find pipeline record for persistence
        const pipeline = await prisma.pipeline.findUnique({
          where: { epicKey: ticketRef },
        });
        const pipelineId = pipeline?.id ?? ticketRef;

        // Get project structure for LLM context
        const projectStructure = await this.getProjectStructure();

        if (triage.pipelineType === "epic") {
          const epicResult = await decomposeEpicTicket(
            ticket,
            pipelineId,
            projectStructure,
            this.deps.jiraClient,
            undefined
          );
          // Convert to DecompositionResult for plan summary compatibility
          decomposition = {
            graph: {
              ticketRef: epicResult.taskGraph.ticketRef,
              nodes: epicResult.taskGraph.nodes.map((n) => ({
                taskId: n.id,
                title: n.title,
                description: n.description,
                taskType: n.taskType,
                estimatedPoints: n.estimatedPoints,
                dependsOn: n.dependsOn,
              })),
            },
            totalEstimatedPoints: epicResult.taskGraph.totalEstimatedPoints,
            riskAreas: epicResult.taskGraph.riskAreas,
            affectedFiles: epicResult.taskGraph.nodes.flatMap((n) => n.affectedFiles),
          };
        } else {
          const featureResult = await decomposeFeatureTicket(
            ticket,
            pipelineId,
            projectStructure,
            undefined
          );
          decomposition = {
            graph: {
              ticketRef: featureResult.graph.ticketRef,
              nodes: featureResult.graph.nodes.map((n) => ({
                taskId: n.id,
                title: n.title,
                description: n.description,
                taskType: n.taskType,
                estimatedPoints: n.estimatedPoints,
                dependsOn: n.dependsOn,
              })),
            },
            totalEstimatedPoints: featureResult.graph.totalEstimatedPoints,
            riskAreas: featureResult.graph.riskAreas,
            affectedFiles: featureResult.graph.nodes.flatMap((n) => n.affectedFiles),
          };
        }
      } else {
        // Default decomposition for other ticket types
        decomposition = await decomposeTicket(ticket);
      }

      // 4. Store decomposition in epic context
      epic.taskGraph = decomposition.graph;
      epic.decomposition = decomposition;
      await saveDecomposition(ticketRef, decomposition);

      // 5. Generate plan summary
      const planSummary = this.generatePlanSummary(
        ticketRef,
        ticket.summary,
        decomposition
      );

      // 6. Transition to approved (awaiting human approval)
      await this.transitionEpic(ticketRef, "approved", "dor-passed");

      // 7. Request human approval via Slack
      await this.requestHumanApproval(planSummary);

      // 8. Audit log
      await auditLog("epic.decomposed", ticketRef, {
        pipelineType: triage.pipelineType,
        taskCount: decomposition.graph.nodes.length,
        totalPoints: decomposition.totalEstimatedPoints,
      });

      logger.info(`DoR passed for ${ticketRef}, awaiting plan approval`, {
        pipelineType: triage.pipelineType,
        taskCount: decomposition.graph.nodes.length,
        totalPoints: decomposition.totalEstimatedPoints,
      });
    } catch (error) {
      logger.error("Failed to process DoR pass", { error: String(error), ticketRef });
      await this.notifyError(ticketRef, "Task decomposition failed", String(error));
    }
  }

  /**
   * Handle DoR fail: notify and add Jira comment.
   */
  private async onDoRFail(event: DoRFailEvent): Promise<void> {
    this.ensureDeps();

    const { ticketRef, failures } = event;

    // Transition to refinement
    await this.transitionEpic(ticketRef, "refinement", "sent-back");

    // Add Jira comment with failures
    const failureList = failures
      .map((f) => `- **${f.step}**: ${f.description}\n  Remediation: ${f.remediation}`)
      .join("\n");

    await this.deps.jiraClient.addComment(
      ticketRef,
      `⚠️ **Definition of Ready check failed**\n\n${failureList}`
    );

    // Notify via Slack
    await this.deps.slackClient.send({
      text: `❌ DoR failed for ${ticketRef}: ${failures.length} issue(s) found`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `❌ *DoR Failed* for \`${ticketRef}\`\n${failures.length} issue(s) require attention before this ticket can proceed.`,
          },
        },
      ],
    });

    logger.warn(`DoR failed for ${ticketRef}`, { failures: failures.length });
  }

  /**
   * Handle plan approved: dispatch tasks via appropriate pipeline.
   * Features and epics use parallel executor; other types use direct dispatch.
   */
  private async onPlanApproved(
    ticketRef: string,
    approverIdentity: string
  ): Promise<void> {
    const epic = this.epics.get(ticketRef);
    if (epic?.taskGraph === undefined) {
      logger.error(`No task graph for ticket ${ticketRef}`);
      return;
    }

    this.ensureDeps();

    // 1. Log approval
    await auditLog("plan.approved", ticketRef, { approverIdentity });

    // 2. Transition to in-progress
    await this.transitionEpic(ticketRef, "in-progress", "plan-approved");

    // 3. Check if a Plan 10 TaskGraph exists in the database (feature/epic pipeline)
    const pipeline = await prisma.pipeline.findUnique({
      where: { epicKey: ticketRef },
    });
    const plan10Graph = pipeline
      ? await loadDecomposition(pipeline.id)
      : null;

    if (plan10Graph !== null) {
      // Feature/Epic pipeline: use parallel executor + merge sequencer
      await this.executeWithParallelPipeline(ticketRef, plan10Graph, epic);
    } else {
      // Default: dispatch root tasks via message bus
      const rootTaskIds = getRootTaskIds(epic.taskGraph);
      for (const taskId of rootTaskIds) {
        await this.dispatchTask(ticketRef, taskId);
      }
    }

    // 4. Notify status
    await this.notifyStatus(ticketRef, "Execution started", "info");

    logger.info(`Plan approved for ${ticketRef}`, {
      approver: approverIdentity,
      taskCount: epic.taskGraph.nodes.length,
    });
  }

  /**
   * Execute a feature or epic ticket using the parallel execution pipeline.
   * Determines pipeline type from point total and delegates accordingly.
   */
  private async executeWithParallelPipeline(
    ticketRef: string,
    graph: import("./task-graph").TaskGraph,
    epic: EpicContext
  ): Promise<void> {
    const executor = getExecutor();
    const isEpic = graph.totalEstimatedPoints >= 40;

    const onProgress = (completed: number, total: number, failed: number) => {
      logger.info(`${ticketRef} progress: ${completed}/${total} (${failed} failed)`);
    };

    try {
      const result = isEpic
        ? await executeEpicPipeline(graph, executor, onProgress)
        : await executeFeaturePipeline(graph, executor, onProgress);

      // Update epic context with results
      for (const [taskId, execResult] of result.completed) {
        epic.completedTaskIds.push(taskId);
        epic.taskResults.push({
          taskId,
          success: true,
          changedFiles: execResult.changedFiles,
          summary: execResult.summary,
          completedAt: new Date().toISOString(),
        });
      }

      await saveEpicContext(ticketRef, epic);

      // Track progress in database
      if (epic.taskGraph !== undefined) {
        const pipeline = await prisma.pipeline.findUnique({
          where: { epicKey: ticketRef },
        });
        if (pipeline) {
          await calculateProgress(
            pipeline.id,
            new Set(result.completed.keys()),
            new Set(),
            new Set(result.failed.keys()),
            result.blocked
          );
        }
      }

      if (result.allSuccessful) {
        logger.info(`All tasks complete for ${ticketRef}, requesting DoD check`);
        // DoD validation will be triggered via the existing event flow
      } else {
        await this.notifyError(
          ticketRef,
          "Partial execution failure",
          `${result.failed.size} failed, ${result.blocked.size} blocked`
        );
      }

      await auditLog("pipeline.executed", ticketRef, {
        completed: result.completed.size,
        failed: result.failed.size,
        blocked: result.blocked.size,
        prCount: result.prs.size,
        allSuccessful: result.allSuccessful,
      });
    } catch (error) {
      logger.error("Pipeline execution failed", { error: String(error), ticketRef });
      await this.notifyError(ticketRef, "Pipeline execution failed", String(error));
    }
  }

  /**
   * Handle plan rejected: return to refinement.
   */
  private async onPlanRejected(ticketRef: string, reason: string): Promise<void> {
    this.ensureDeps();

    await this.transitionEpic(ticketRef, "refinement", "plan-rejected");

    // Add Jira comment
    await this.deps.jiraClient.addComment(
      ticketRef,
      `🚫 **Implementation plan rejected**\n\nReason: ${reason}\n\nPlease revise the ticket and resubmit.`
    );

    await auditLog("plan.rejected", ticketRef, { reason });

    logger.info(`Plan rejected for ${ticketRef}: ${reason}`);
  }

  /**
   * Handle plan revision requested: re-run decomposition with feedback.
   */
  private async onPlanRevisionRequested(
    ticketRef: string,
    revisionCount: number,
    feedback: string
  ): Promise<void> {
    const epic = this.epics.get(ticketRef);
    if (epic === undefined) {
      logger.error(`Epic ${ticketRef} not found for revision`);
      return;
    }

    this.ensureDeps();

    if (revisionCount >= this.config.maxRevisionCycles) {
      logger.warn(
        `Max revision cycles (${this.config.maxRevisionCycles}) reached for ${ticketRef}`
      );
      await this.notifyStatus(
        ticketRef,
        `Max revision cycles reached. Manual intervention required.`,
        "warning"
      );
      return;
    }

    // Increment revision count
    epic.revisionCount = revisionCount;
    epic.updatedAt = new Date().toISOString();

    // Add feedback to Jira
    await this.deps.jiraClient.addComment(
      ticketRef,
      `🔄 **Plan revision #${revisionCount} requested**\n\nFeedback: ${feedback}`
    );

    // Re-trigger decomposition (will use the feedback)
    try {
      const ticket = await this.deps.jiraClient.getTicket(ticketRef);
      const decomposition = await decomposeTicket(ticket);

      epic.taskGraph = decomposition.graph;
      epic.decomposition = decomposition;
      await saveDecomposition(ticketRef, decomposition);

      const planSummary = this.generatePlanSummary(
        ticketRef,
        ticket.summary,
        decomposition
      );
      await this.requestHumanApproval(planSummary);

      await auditLog("plan.revised", ticketRef, { revisionCount, feedback });

      logger.info(`Plan revision #${revisionCount} for ${ticketRef}`);
    } catch (error) {
      logger.error("Failed to revise plan", { error: String(error), ticketRef });
    }
  }

  /**
   * Handle plan expired: send reminder, do NOT auto-approve.
   */
  private async onPlanExpired(ticketRef: string): Promise<void> {
    this.ensureDeps();

    // Send reminder - NO auto-approval per governance rules
    await this.deps.slackClient.send({
      text: `⏰ Plan approval for ${ticketRef} has expired. Please review.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⏰ *Approval Reminder*\n\nThe implementation plan for \`${ticketRef}\` is awaiting approval.\nNo auto-approval — human review required.`,
          },
        },
      ],
    });

    await auditLog("plan.expired", ticketRef);
    logger.warn(`Plan expired for ${ticketRef} — reminder sent`);
  }

  /**
   * Handle DoD pass: transition to done.
   */
  private async onDoDPass(ticketRef: string): Promise<void> {
    this.ensureDeps();

    await this.transitionEpic(ticketRef, "done", "dod-passed");

    // Add Jira comment
    await this.deps.jiraClient.addComment(
      ticketRef,
      `✅ **Definition of Done validated**\n\nAll acceptance criteria met. Ready for merge.`
    );

    // Notify success
    await this.deps.slackClient.send({
      text: `✅ ${ticketRef} completed — ready for merge`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✅ *DoD Passed* for \`${ticketRef}\`\n\nAll tasks completed and validated. Proceeding to squash-merge.`,
          },
        },
      ],
    });

    await auditLog("epic.completed", ticketRef);
    logger.info(`DoD passed for ${ticketRef}, proceeding to squash-merge`);
  }

  /**
   * Handle DoD fail: notify and request remediation.
   */
  private async onDoDFail(event: DoDFailEvent): Promise<void> {
    this.ensureDeps();

    const { ticketRef, failures } = event;

    // Transition back to in-progress for remediation
    await this.transitionEpic(ticketRef, "in-progress", "dod-failed");

    // Add Jira comment
    const failureList = failures
      .map((f) => `- **${f.step}**: ${f.description}\n  Remediation: ${f.remediation}`)
      .join("\n");

    await this.deps.jiraClient.addComment(
      ticketRef,
      `❌ **Definition of Done check failed**\n\n${failureList}`
    );

    // Notify via Slack
    await this.deps.slackClient.send({
      text: `❌ DoD failed for ${ticketRef}: ${failures.length} issue(s) found`,
    });

    await auditLog("dod.failed", ticketRef, { failures });
    logger.warn(`DoD failed for ${ticketRef}`, { failures: failures.length });
  }

  // ─── Stage 1: Ideation Handlers ───────────────────────────────────────────

  /**
   * Handle ideation approved: transition from funnel to refinement, trigger DoR.
   */
  private async onIdeationApproved(
    ticketRef: string,
    stakeholderIdentity: string
  ): Promise<void> {
    this.ensureDeps();

    await this.transitionEpic(ticketRef, "refinement", "ideation-approved");

    await this.deps.jiraClient.addComment(
      ticketRef,
      `✅ **Ideation approved** by ${stakeholderIdentity}. Proceeding to Definition of Ready validation.`
    );

    await auditLog("ideation.approved", ticketRef, { stakeholderIdentity });
    logger.info(`Ideation approved for ${ticketRef} by ${stakeholderIdentity}`);

    // Trigger DoR validation
    const ticket = await this.deps.jiraClient.getTicket(ticketRef);
    const { evaluateDoR } = await import("@/server/services/gates/dor-validation");
    const dorResult = await evaluateDoR(ticket);

    if (dorResult.passed) {
      await this.handleEvent({
        kind: "dor-pass",
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ticketRef,
        validatedCriteria: dorResult.violations
          .filter((v) => v.severity === "warning")
          .map((v) => v.rule),
      });
    } else {
      const failures = dorResult.violations
        .filter((v) => v.severity === "error")
        .map((v) => ({
          step: v.rule,
          description: v.description,
          remediation: `Fix: ${v.description}`,
        }));

      await this.handleEvent({
        kind: "dor-fail",
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ticketRef,
        failures,
      });
    }
  }

  /**
   * Handle ideation rejected: add Jira comment, stay in funnel.
   */
  private async onIdeationRejected(
    ticketRef: string,
    reason: string
  ): Promise<void> {
    this.ensureDeps();

    await this.deps.jiraClient.addComment(
      ticketRef,
      `❌ **Ideation rejected**: ${reason}\n\nPlease revise the problem statement, value hypothesis, and strategic alignment before resubmitting.`
    );

    await this.deps.slackClient.send({
      text: `❌ Ideation rejected for ${ticketRef}: ${reason}`,
    });

    await auditLog("ideation.rejected", ticketRef, { reason });
    logger.info(`Ideation rejected for ${ticketRef}: ${reason}`);
  }

  // ─── Stage 2: Team Confirmation Handler ──────────────────────────────────

  /**
   * Handle team confirmed: proceed with decomposition and plan approval.
   */
  private async onTeamConfirmed(
    ticketRef: string,
    confirmedBy: string
  ): Promise<void> {
    const epic = this.epics.get(ticketRef);
    if (epic === undefined) {
      logger.error(`Epic ${ticketRef} not found for team confirmation`);
      return;
    }

    this.ensureDeps();

    await this.deps.jiraClient.addComment(
      ticketRef,
      `✅ **Team confirmed** by ${confirmedBy}. Proceeding to task decomposition.`
    );

    await auditLog("team.confirmed", ticketRef, { confirmedBy });
    logger.info(`Team confirmed for ${ticketRef} by ${confirmedBy}`);

    // The decomposition and plan approval flow is handled by onDoRPass
    // Team confirmation is an additional gate between DoR and decomposition
    // For now, we re-trigger onDoRPass to continue the flow
    // In Phase 2 implementation, onDoRPass will be split to check for team confirmation
  }

  // ─── Stage 5: Review Handler ─────────────────────────────────────────────

  /**
   * Handle review completed: proceed to DoD or back to in-progress.
   */
  private async onReviewCompleted(
    ticketRef: string,
    verdict: string,
    findingSummary: string
  ): Promise<void> {
    this.ensureDeps();

    if (verdict === "APPROVE") {
      logger.info(`Review approved for ${ticketRef}, triggering DoD validation`);
      await auditLog("review.approved", ticketRef, { findingSummary });

      // Trigger DoD validation
      const epic = this.epics.get(ticketRef);
      if (epic !== undefined) {
        await this.triggerDoDValidation(ticketRef, epic);
      } else {
        logger.error(`Epic ${ticketRef} not found for DoD validation after review`);
      }
    } else {
      // REQUEST_CHANGES or BLOCK — back to in-progress
      await this.transitionEpic(ticketRef, "in-progress", "dod-failed");

      await this.deps.jiraClient.addComment(
        ticketRef,
        `⚠️ **Code review**: ${verdict}\n\n${findingSummary}`
      );

      await this.deps.slackClient.send({
        text: `⚠️ Review ${verdict.toLowerCase()} for ${ticketRef}`,
      });

      await auditLog("review.changes-requested", ticketRef, { verdict, findingSummary });
      logger.info(`Review ${verdict} for ${ticketRef}`);
    }
  }

  // ─── Stage 4: Task Blocked Handler ───────────────────────────────────────

  /**
   * Handle task blocked: attempt reassignment, escalation, or abort.
   */
  private async onTaskBlocked(
    ticketRef: string,
    taskId: string,
    agentId: string,
    reason: string,
    suggestedAction: string
  ): Promise<void> {
    this.ensureDeps();

    await auditLog("task.blocked", ticketRef, { taskId, agentId, reason, suggestedAction });
    logger.warn(`Task ${taskId} blocked for ${ticketRef}`, { agentId, reason, suggestedAction });

    if (suggestedAction === "escalate") {
      // Create a RISK approval for human intervention
      await prisma.approval.create({
        data: {
          pipelineId: (await prisma.pipeline.findUnique({ where: { epicKey: ticketRef } }))?.id ?? ticketRef,
          type: "RISK",
          status: "PENDING",
          requestedBy: agentId,
          planSummary: `Task ${taskId} blocked: ${reason}. Agent ${agentId} requests human intervention.`,
          riskLevel: "high",
          expiresAt: new Date(Date.now() + this.config.approvalTimeoutMs),
        },
      });

      await this.deps.slackClient.send({
        text: `🚨 Task blocked for ${ticketRef}: ${reason}. Human intervention required.`,
      });
    } else if (suggestedAction === "abort") {
      // Mark task as failed, check if epic should be blocked
      const epic = this.epics.get(ticketRef);
      if (epic !== undefined) {
        epic.activeTasks = epic.activeTasks.filter((t) => t.taskId !== taskId);
        await saveEpicContext(ticketRef, epic);
      }

      await this.deps.jiraClient.addComment(
        ticketRef,
        `⚠️ Task ${taskId} aborted: ${reason}`
      );
    }
    // "reassign" will be handled by the abort-protocol service in Phase 3
  }

  // ─── Task Dispatch ──────────────────────────────────────────────────────────

  /**
   * Dispatch a task to the appropriate agent.
   */
  private async dispatchTask(ticketRef: string, taskId: string): Promise<void> {
    const epic = this.epics.get(ticketRef);
    if (epic?.taskGraph === undefined) {
      logger.error(`No task graph for ${ticketRef}`);
      return;
    }

    this.ensureDeps();

    // Check concurrent task limit
    if (epic.activeTasks.length >= this.config.maxConcurrentTasksPerEpic) {
      logger.debug(
        "Concurrent task limit reached, queueing task",
        { ticketRef, taskId }
      );
      return; // Will be dispatched when another task completes
    }

    const taskNode = getTaskNode(epic.taskGraph, taskId);
    if (taskNode === undefined) {
      logger.error(`Task ${taskId} not found in graph for ${ticketRef}`);
      return;
    }

    // Resolve agent
    const agentId = this.resolveAgent(taskNode.taskType);

    // Check agent availability
    const agentStatus = this.deps.agentRegistry.getStatus(agentId);
    if (agentStatus?.status === "offline") {
      logger.warn(`Agent ${agentId} is offline, queueing task ${taskId} for retry`);
      await agentTaskQueue.add(
        `retry-${taskId}`,
        {
          taskType: taskNode.taskType,
          targetAgent: agentId,
          ticketRef,
          description: `${taskNode.title}\n\n${taskNode.description}`,
          priority: 3, // Higher priority for retries
        },
        { delay: 30_000 } // Retry after 30s
      );
      return;
    }

    // Create task assignment
    const assignment: TaskAssignment = {
      kind: "task-assignment",
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      sourceAgent: "orchestrator-project",
      targetAgent: agentId,
      taskType: taskNode.taskType,
      ticketRef,
      description: `${taskNode.title}\n\n${taskNode.description}`,
      constraints: [],
      acceptanceCriteria: [],
    };

    // Track active task
    epic.activeTasks.push({
      taskId,
      agentId,
      startedAt: new Date().toISOString(),
    });
    await saveEpicContext(ticketRef, epic);

    // Publish to message bus
    await this.deps.messageBus.publish(assignment);

    await auditLog("task.dispatched", ticketRef, { taskId, agentId });
    logger.info(`Task ${taskId} dispatched to ${agentId}`, { ticketRef });
  }

  /**
   * Handle task completion: dispatch dependents, check if all done.
   */
  private async onTaskCompleted(
    _sourceAgent: AgentId,
    _assignmentId: string,
    result: TaskResult
  ): Promise<void> {
    // Find the epic for this task
    let targetEpic: EpicContext | undefined;
    let taskId: string | undefined;

    for (const epic of this.epics.values()) {
      const activeTask = epic.activeTasks.find(
        (t) => t.taskId === result.taskId
      );
      if (activeTask !== undefined) {
        targetEpic = epic;
        taskId = activeTask.taskId;
        break;
      }
    }

    if (targetEpic === undefined || taskId === undefined) {
      logger.warn(`No epic found for completed task ${result.taskId}`);
      return;
    }

    const ticketRef = targetEpic.ticketRef;

    // Mark task complete
    targetEpic.activeTasks = targetEpic.activeTasks.filter(
      (t) => t.taskId !== taskId
    );
    targetEpic.completedTaskIds.push(taskId);
    targetEpic.taskResults.push(result);

    // Check for unblocked dependent tasks
    if (targetEpic.taskGraph !== undefined) {
      const unblockedTasks = this.findUnblockedTasks(targetEpic);
      for (const unblockedId of unblockedTasks) {
        await this.dispatchTask(ticketRef, unblockedId);
      }
    }

    // Persist state
    await saveEpicContext(ticketRef, targetEpic);

    await auditLog("task.completed", ticketRef, {
      taskId,
      success: result.success,
      changedFiles: result.changedFiles.length,
    });

    // Check if all tasks complete — trigger DoD validation
    if (this.allTasksComplete(targetEpic)) {
      logger.info(`All tasks complete for ${ticketRef}, triggering DoD validation`);
      await this.triggerDoDValidation(ticketRef, targetEpic);
    }

    logger.info(`Task ${taskId} completed for ${ticketRef}`, {
      success: result.success,
      remaining: targetEpic.taskGraph?.nodes.length ?? 0 -
        targetEpic.completedTaskIds.length,
    });
  }

  /**
   * Find tasks whose dependencies are all complete.
   */
  private findUnblockedTasks(epic: EpicContext): string[] {
    if (epic.taskGraph === undefined) return [];

    const completedSet = new Set(epic.completedTaskIds);
    const activeSet = new Set(epic.activeTasks.map((t) => t.taskId));

    const unblocked: string[] = [];
    for (const node of epic.taskGraph.nodes) {
      // Skip already completed or active tasks
      if (completedSet.has(node.taskId) || activeSet.has(node.taskId)) continue;

      // Check if all dependencies are complete
      const depsComplete = node.dependsOn.every((depId) =>
        completedSet.has(depId)
      );
      if (depsComplete) {
        unblocked.push(node.taskId);
      }
    }

    return unblocked;
  }

  /**
   * Check if all tasks are complete.
   */
  private allTasksComplete(epic: EpicContext): boolean {
    if (epic.taskGraph === undefined) return false;
    return epic.completedTaskIds.length === epic.taskGraph.nodes.length;
  }

  // ─── DoD Validation ─────────────────────────────────────────────────────────

  /**
   * Trigger DoD validation when all tasks for an epic are complete.
   * Builds a Changeset from task results and evaluates against DoD rules.
   * Emits dod-pass or dod-fail events based on the result.
   */
  private async triggerDoDValidation(
    ticketRef: string,
    epic: EpicContext
  ): Promise<void> {
    this.ensureDeps();

    const allChangedFiles = epic.taskResults.flatMap((r) => r.changedFiles);
    const branchName = `feature/${ticketRef.toLowerCase()}`;

    const changeset = {
      ticketRef,
      branchName,
      changedFiles: [...new Set(allChangedFiles)],
      // Test/lint/security results are populated by CI — not available here.
      // The DoD gate will flag missing results as violations.
    };

    try {
      const dodResult = await evaluateDoD(changeset);

      if (dodResult.passed) {
        await this.handleEvent({
          kind: "dod-pass",
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          ticketRef,
          testSummary: {
            passCount: 0,
            failCount: 0,
            coveragePercent: 0,
          },
          securityScanResult: "clean",
        });
      } else {
        const failures = dodResult.violations
          .filter((v) => v.severity === "error")
          .map((v) => ({
            step: v.rule,
            description: v.description,
            remediation: `Fix violation: ${v.rule}`,
          }));

        await this.handleEvent({
          kind: "dod-fail",
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          ticketRef,
          failures,
        });
      }

      await auditLog("dod.evaluated", ticketRef, {
        passed: dodResult.passed,
        violationCount: dodResult.violations.length,
      });
    } catch (error) {
      logger.error("DoD validation failed", { error: String(error), ticketRef });
      await this.notifyError(ticketRef, "DoD validation failed", String(error));
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private ensureDeps(): asserts this is { deps: OrchestratorDependencies } {
    if (this.deps === undefined) {
      throw new Error("Engine not initialized — call initialize() first");
    }
  }

  /**
   * Get a summary of the project file structure for LLM decomposition context.
   * Returns a simple directory listing of src/ for the decomposer prompt.
   */
  private async getProjectStructure(): Promise<string> {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync(
        "find",
        ["src", "-type", "f", "-name", "*.ts", "-o", "-name", "*.tsx"],
        { cwd: process.cwd(), timeout: 5000 }
      );
      return stdout.trim();
    } catch {
      logger.warn("Failed to read project structure, using fallback");
      return "src/ (structure unavailable)";
    }
  }

  /**
   * Generate a plan summary from decomposition result.
   * Uses the dedicated plan-summary module for consistent formatting.
   */
  private generatePlanSummary(
    ticketRef: string,
    title: string,
    decomposition: DecompositionResult
  ): PlanSummary {
    return generatePlanSummaryFn(
      ticketRef,
      title,
      decomposition,
      (taskType) => this.resolveAgent(taskType)
    );
  }

  /**
   * Request human approval for an implementation plan.
   * Creates an Approval record in the database and sends Slack notification.
   */
  private async requestHumanApproval(planSummary: PlanSummary): Promise<void> {
    this.ensureDeps();

    const env = getEnv();

    // 1. Find or create the pipeline for this ticket
    const pipeline = await prisma.pipeline.findUnique({
      where: { epicKey: planSummary.ticketRef },
    });

    if (pipeline === null) {
      logger.error(`Pipeline not found for ${planSummary.ticketRef}`);
      return;
    }

    // 2. Create Approval record in database
    const approval = await prisma.approval.create({
      data: {
        pipelineId: pipeline.id,
        type: "PLAN",
        status: "PENDING",
        requestedBy: "orchestrator",
        expiresAt: new Date(Date.now() + this.config.approvalTimeoutMs),
        planSummary: planSummary.summary,
        planHash: planSummary.planHash,
        affectedFiles: planSummary.affectedFiles,
        estimatedPoints: planSummary.estimatedPoints,
        riskLevel: planSummary.riskLevel,
      },
    });

    // 3. Create dashboard URL for the approval
    const dashboardUrl = `${env.DASHBOARD_URL}/dashboard/approvals?id=${approval.id}`;

    // 4. Send Slack notification with dashboard link
    const slackPayload = buildApprovalRequestPayload({
      ticketRef: planSummary.ticketRef,
      title: planSummary.title,
      riskLevel: planSummary.riskLevel,
      dashboardUrl,
    });
    await this.deps.slackClient.send(slackPayload);

    // 5. Audit log
    await auditLog("approval.requested", planSummary.ticketRef, {
      approvalId: approval.id,
      planHash: planSummary.planHash,
      riskLevel: planSummary.riskLevel,
      taskCount: planSummary.taskCount,
    });

    logger.info(`Approval requested for ${planSummary.ticketRef}`, {
      approvalId: approval.id,
      riskLevel: planSummary.riskLevel,
      expiresAt: approval.expiresAt,
    });
  }

  private async notifyStatus(
    ticketRef: string,
    message: string,
    level: "info" | "warning" | "error"
  ): Promise<void> {
    this.ensureDeps();

    const emoji = level === "error" ? "❌" : level === "warning" ? "⚠️" : "ℹ️";
    await this.deps.slackClient.send({
      text: `${emoji} ${ticketRef}: ${message}`,
    });
  }

  private async notifyError(
    ticketRef: string,
    title: string,
    details: string
  ): Promise<void> {
    this.ensureDeps();

    await this.deps.slackClient.send({
      text: `❌ Error for ${ticketRef}: ${title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `❌ *Error* for \`${ticketRef}\`\n\n*${title}*\n\`\`\`${details.slice(0, 500)}\`\`\``,
          },
        },
      ],
    });
  }
}
