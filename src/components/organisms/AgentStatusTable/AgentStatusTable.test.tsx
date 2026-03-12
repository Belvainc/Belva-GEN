import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { AgentStatusTable } from "./AgentStatusTable";
import type { AgentWithStatus } from "@/server/services/agent.service";

expect.extend(toHaveNoViolations);

const mockAgents: AgentWithStatus[] = [
  {
    config: {
      agentId: "node-backend",
      name: "Node Backend Agent",
      description: "Handles backend tasks",
      capabilities: {
        taskTypes: ["backend"],
        maxConcurrentTasks: 1,
        ruleReferences: [],
      },
      ownedPaths: ["src/server/**"],
    },
    status: {
      agentId: "node-backend",
      status: "idle",
      currentTask: null,
      lastHeartbeat: new Date().toISOString(),
    },
  },
  {
    config: {
      agentId: "next-ux",
      name: "Next.js UX Agent",
      description: "Handles frontend tasks",
      capabilities: {
        taskTypes: ["frontend"],
        maxConcurrentTasks: 1,
        ruleReferences: [],
      },
      ownedPaths: ["src/components/**"],
    },
    status: {
      agentId: "next-ux",
      status: "busy",
      currentTask: "Building dashboard components",
      lastHeartbeat: new Date().toISOString(),
    },
  },
];

describe("AgentStatusTable", () => {
  it("renders empty state when no agents", () => {
    render(<AgentStatusTable agents={[]} />);
    expect(screen.getByText("No agents registered")).toBeInTheDocument();
  });

  it("renders table with agents", () => {
    render(<AgentStatusTable agents={mockAgents} />);
    
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Node Backend Agent")).toBeInTheDocument();
    expect(screen.getByText("Next.js UX Agent")).toBeInTheDocument();
  });

  it("displays agent status badges", () => {
    render(<AgentStatusTable agents={mockAgents} />);
    
    expect(screen.getByText("Idle")).toBeInTheDocument();
    expect(screen.getByText("Busy")).toBeInTheDocument();
  });

  it("displays current task when available", () => {
    render(<AgentStatusTable agents={mockAgents} />);
    
    expect(screen.getByText("Building dashboard components")).toBeInTheDocument();
  });

  it("displays em-dash for missing current task", () => {
    render(<AgentStatusTable agents={mockAgents} />);
    
    // The idle agent has no current task
    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  it("renders table headers correctly", () => {
    render(<AgentStatusTable agents={mockAgents} />);
    
    expect(screen.getByRole("columnheader", { name: "Agent" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Current Task" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Last Heartbeat" })).toBeInTheDocument();
  });

  it("has no accessibility violations with empty state", async () => {
    const { container } = render(<AgentStatusTable agents={[]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations with agents", async () => {
    const { container } = render(<AgentStatusTable agents={mockAgents} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
