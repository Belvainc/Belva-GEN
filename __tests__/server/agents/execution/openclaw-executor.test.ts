import { OpenClawExecutor } from "@/server/agents/execution/openclaw-executor";
import type { ExecutionRequest } from "@/server/agents/execution/types";

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("@/server/config/env", () => ({
  getEnv: () => ({
    OPENCLAW_ENDPOINT: "http://localhost:3100",
    OPENCLAW_API_KEY: "test-key",
    ANTHROPIC_MODEL: "claude-sonnet-4-6",
  }),
}));

jest.mock("@/server/config/logger", () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeRequest(overrides?: Partial<ExecutionRequest>): ExecutionRequest {
  return {
    taskId: "00000000-0000-0000-0000-000000000001",
    agentId: "backend",
    taskType: "backend",
    ticketRef: "BELVA-042",
    description: "Implement user service",
    constraints: ["Use Zod validation"],
    acceptanceCriteria: ["Unit tests pass"],
    domainPaths: ["src/server/**"],
    systemPrompt: "You are the backend agent.",
    timeoutMs: 600_000,
    ...overrides,
  };
}

function makeOpenClawResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "resp-1",
      object: "chat.completion",
      created: Date.now(),
      model: "claude-sonnet-4-6",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
    }),
    text: async () => content,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OpenClawExecutor", () => {
  let executor: OpenClawExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    executor = new OpenClawExecutor();
  });

  it("sends request to OpenClaw endpoint with correct headers", async () => {
    const jsonResult = JSON.stringify({
      changedFiles: ["src/server/services/user.ts"],
      testRequirements: ["user service tests"],
      summary: "Implemented user service",
    });

    mockFetch.mockResolvedValue(
      makeOpenClawResponse(`\`\`\`json\n${jsonResult}\n\`\`\``)
    );

    await executor.execute(makeRequest());

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3100/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-key",
        },
      })
    );
  });

  it("parses structured JSON from response", async () => {
    const jsonResult = JSON.stringify({
      changedFiles: ["src/server/services/user.ts"],
      testRequirements: ["user service tests"],
      summary: "Implemented user service",
    });

    mockFetch.mockResolvedValue(
      makeOpenClawResponse(`Here is the result:\n\`\`\`json\n${jsonResult}\n\`\`\``)
    );

    const result = await executor.execute(makeRequest());

    expect(result.status).toBe("completed");
    expect(result.changedFiles).toEqual(["src/server/services/user.ts"]);
    expect(result.testRequirements).toEqual(["user service tests"]);
    expect(result.summary).toBe("Implemented user service");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns failed status on HTTP error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await executor.execute(makeRequest());

    expect(result.status).toBe("failed");
    expect(result.error).toContain("OpenClaw API error 500");
  });

  it("returns failed status on network error", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await executor.execute(makeRequest());

    expect(result.status).toBe("failed");
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("falls back gracefully when JSON parsing fails", async () => {
    mockFetch.mockResolvedValue(
      makeOpenClawResponse("I completed the task but didn't return JSON")
    );

    const result = await executor.execute(makeRequest());

    expect(result.status).toBe("completed");
    expect(result.changedFiles).toEqual([]);
    expect(result.summary).toContain("I completed the task");
  });

  it("includes agent_id in request body", async () => {
    const jsonResult = JSON.stringify({
      changedFiles: [],
      testRequirements: [],
      summary: "Done",
    });

    mockFetch.mockResolvedValue(
      makeOpenClawResponse(`\`\`\`json\n${jsonResult}\n\`\`\``)
    );

    await executor.execute(makeRequest({ agentId: "frontend" }));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.agent_id).toBe("frontend");
  });

  it("passes model override from request", async () => {
    const jsonResult = JSON.stringify({
      changedFiles: [],
      testRequirements: [],
      summary: "Done",
    });

    mockFetch.mockResolvedValue(
      makeOpenClawResponse(`\`\`\`json\n${jsonResult}\n\`\`\``)
    );

    await executor.execute(makeRequest({ model: "claude-opus-4-6" }));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.model).toBe("claude-opus-4-6");
  });

  describe("healthCheck", () => {
    it("returns healthy when gateway responds OK", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await executor.healthCheck();
      expect(result.status).toBe("healthy");
    });

    it("returns unhealthy when gateway is down", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
      const result = await executor.healthCheck();
      expect(result.status).toBe("unhealthy");
    });
  });
});
