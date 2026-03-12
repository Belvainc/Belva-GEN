import {
  generatePlanSummary,
  calculateRiskLevel,
  renderDependencyGraph,
  calculateAgentAssignments,
} from "@/server/orchestrator/plan-summary";
import type { DecompositionResult, TaskGraph, TaskNode } from "@/server/orchestrator/types";
import type { AgentId } from "@/types/agent-protocol";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createTaskGraph(nodes: Array<Partial<TaskNode>>): TaskGraph {
  return {
    ticketRef: "BELVA-001",
    nodes: nodes.map((node, index) => ({
      taskId: node.taskId ?? `task-${index + 1}`,
      title: node.title ?? `Task ${index + 1}`,
      description: node.description ?? "Test description",
      taskType: node.taskType ?? "backend",
      estimatedPoints: node.estimatedPoints ?? 3,
      dependsOn: node.dependsOn ?? [],
    })),
  };
}

function createDecompositionResult(
  overrides: Partial<DecompositionResult> = {}
): DecompositionResult {
  return {
    graph: overrides.graph ?? createTaskGraph([{ taskId: "task-1" }]),
    totalEstimatedPoints: overrides.totalEstimatedPoints ?? 3,
    riskAreas: overrides.riskAreas ?? [],
    affectedFiles: overrides.affectedFiles ?? [],
  };
}

function mockResolveAgent(taskType: TaskNode["taskType"]): AgentId {
  const mapping: Record<TaskNode["taskType"], AgentId> = {
    backend: "node-backend",
    frontend: "next-ux",
    testing: "ts-testing",
    documentation: "orchestrator-project",
    orchestration: "orchestrator-project",
  };
  return mapping[taskType];
}

// ─── calculateRiskLevel Tests ─────────────────────────────────────────────────

describe("calculateRiskLevel", () => {
  it("returns 'low' for minimal risk", () => {
    const decomposition = createDecompositionResult({
      riskAreas: [],
      totalEstimatedPoints: 3,
    });
    expect(calculateRiskLevel(decomposition)).toBe("low");
  });

  it("returns 'medium' for moderate risk areas", () => {
    const decomposition = createDecompositionResult({
      riskAreas: ["database migration", "external API"],
      totalEstimatedPoints: 5,
    });
    expect(calculateRiskLevel(decomposition)).toBe("medium");
  });

  it("returns 'medium' for moderate points (>5)", () => {
    const decomposition = createDecompositionResult({
      riskAreas: ["minor change"],
      totalEstimatedPoints: 8,
    });
    expect(calculateRiskLevel(decomposition)).toBe("medium");
  });

  it("returns 'high' for many risk areas (>3)", () => {
    const decomposition = createDecompositionResult({
      riskAreas: ["auth", "database", "API", "cache"],
      totalEstimatedPoints: 5,
    });
    expect(calculateRiskLevel(decomposition)).toBe("high");
  });

  it("returns 'high' for high points (>13)", () => {
    const decomposition = createDecompositionResult({
      riskAreas: [],
      totalEstimatedPoints: 21,
    });
    expect(calculateRiskLevel(decomposition)).toBe("high");
  });
});

// ─── renderDependencyGraph Tests ──────────────────────────────────────────────

describe("renderDependencyGraph", () => {
  it("renders a simple graph with no dependencies", () => {
    const graph = createTaskGraph([
      { taskId: "task-1", title: "First Task" },
      { taskId: "task-2", title: "Second Task" },
    ]);

    const result = renderDependencyGraph(graph);

    expect(result).toContain("graph TD");
    expect(result).toContain('task-1["First Task"]');
    expect(result).toContain('task-2["Second Task"]');
    expect(result).not.toContain("-->");
  });

  it("renders dependency edges", () => {
    const graph = createTaskGraph([
      { taskId: "task-1", title: "First Task", dependsOn: [] },
      { taskId: "task-2", title: "Second Task", dependsOn: ["task-1"] },
    ]);

    const result = renderDependencyGraph(graph);

    expect(result).toContain("task-1 --> task-2");
  });

  it("escapes quotes in titles", () => {
    const graph = createTaskGraph([
      { taskId: "task-1", title: 'Task with "quotes"' },
    ]);

    const result = renderDependencyGraph(graph);

    expect(result).toContain("task-1[\"Task with 'quotes'\"]");
  });

  it("truncates long titles with ellipsis", () => {
    const longTitle = "A".repeat(50);
    const graph = createTaskGraph([{ taskId: "task-1", title: longTitle }]);

    const result = renderDependencyGraph(graph);

    expect(result).toContain("...");
    expect(result).not.toContain("A".repeat(50));
  });
});

// ─── calculateAgentAssignments Tests ──────────────────────────────────────────

describe("calculateAgentAssignments", () => {
  it("groups tasks by agent", () => {
    const graph = createTaskGraph([
      { taskId: "task-1", taskType: "backend", estimatedPoints: 3 },
      { taskId: "task-2", taskType: "backend", estimatedPoints: 5 },
      { taskId: "task-3", taskType: "frontend", estimatedPoints: 2 },
    ]);

    const assignments = calculateAgentAssignments(graph, mockResolveAgent);

    const backendAssignment = assignments.find((a) => a.agentId === "node-backend");
    const frontendAssignment = assignments.find((a) => a.agentId === "next-ux");

    expect(backendAssignment).toEqual({
      agentId: "node-backend",
      taskCount: 2,
      points: 8,
    });
    expect(frontendAssignment).toEqual({
      agentId: "next-ux",
      taskCount: 1,
      points: 2,
    });
  });

  it("handles single agent assignments", () => {
    const graph = createTaskGraph([
      { taskId: "task-1", taskType: "testing", estimatedPoints: 5 },
    ]);

    const assignments = calculateAgentAssignments(graph, mockResolveAgent);

    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toEqual({
      agentId: "ts-testing",
      taskCount: 1,
      points: 5,
    });
  });
});

// ─── generatePlanSummary Tests ────────────────────────────────────────────────

describe("generatePlanSummary", () => {
  it("generates complete plan summary", () => {
    const decomposition = createDecompositionResult({
      graph: createTaskGraph([
        { taskId: "task-1", title: "API endpoint", taskType: "backend", estimatedPoints: 3 },
        { taskId: "task-2", title: "UI component", taskType: "frontend", estimatedPoints: 2 },
      ]),
      totalEstimatedPoints: 8,
      riskAreas: ["auth integration", "database migration"],
      affectedFiles: ["src/api/route.ts", "src/components/Card.tsx"],
    });

    const summary = generatePlanSummary(
      "BELVA-042",
      "Add user profile feature",
      decomposition,
      mockResolveAgent
    );

    expect(summary.ticketRef).toBe("BELVA-042");
    expect(summary.title).toBe("Add user profile feature");
    expect(summary.taskCount).toBe(2);
    expect(summary.estimatedPoints).toBe(8);
    expect(summary.riskLevel).toBe("medium");
    expect(summary.affectedFiles).toEqual([
      "src/api/route.ts",
      "src/components/Card.tsx",
    ]);
    expect(summary.riskAreas).toEqual(["auth integration", "database migration"]);
    expect(summary.agentAssignments).toHaveLength(2);
  });

  it("generates valid SHA-256 hash", () => {
    const decomposition = createDecompositionResult();
    const summary = generatePlanSummary(
      "BELVA-001",
      "Test",
      decomposition,
      mockResolveAgent
    );

    // SHA-256 hash is 64 hex characters
    expect(summary.planHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different plans", () => {
    const decomposition1 = createDecompositionResult({
      totalEstimatedPoints: 3,
    });
    const decomposition2 = createDecompositionResult({
      totalEstimatedPoints: 5,
    });

    const summary1 = generatePlanSummary(
      "BELVA-001",
      "Title",
      decomposition1,
      mockResolveAgent
    );
    const summary2 = generatePlanSummary(
      "BELVA-001",
      "Title",
      decomposition2,
      mockResolveAgent
    );

    expect(summary1.planHash).not.toBe(summary2.planHash);
  });

  it("includes Mermaid dependency graph", () => {
    const decomposition = createDecompositionResult({
      graph: createTaskGraph([
        { taskId: "task-1", title: "First", dependsOn: [] },
        { taskId: "task-2", title: "Second", dependsOn: ["task-1"] },
      ]),
    });

    const summary = generatePlanSummary(
      "BELVA-001",
      "Test",
      decomposition,
      mockResolveAgent
    );

    expect(summary.dependencyGraph).toContain("graph TD");
    expect(summary.dependencyGraph).toContain("task-1 --> task-2");
  });

  it("includes summary text with all sections", () => {
    const decomposition = createDecompositionResult({
      graph: createTaskGraph([{ taskId: "task-1", title: "API work" }]),
      riskAreas: ["security"],
      affectedFiles: ["src/api.ts"],
    });

    const summary = generatePlanSummary(
      "BELVA-001",
      "Feature",
      decomposition,
      mockResolveAgent
    );

    expect(summary.summary).toContain("# Implementation Plan: BELVA-001");
    expect(summary.summary).toContain("**Feature**");
    expect(summary.summary).toContain("## Agent Assignments");
    expect(summary.summary).toContain("## Tasks");
    expect(summary.summary).toContain("## Risk Areas");
    expect(summary.summary).toContain("## Affected Files");
  });
});
