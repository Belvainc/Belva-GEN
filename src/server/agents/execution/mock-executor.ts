import type { AgentExecutor, ExecutionRequest, ExecutionResult } from "./types";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "mock-executor" });

// ─── File Path Templates by Task Type ───────────────────────────────────────

const FILE_TEMPLATES: Record<string, string[]> = {
  backend: [
    "src/server/services/{name}.service.ts",
    "src/server/lib/{name}.ts",
    "src/app/api/{name}/route.ts",
  ],
  frontend: [
    "src/components/organisms/{Name}.tsx",
    "src/app/dashboard/{name}/page.tsx",
  ],
  testing: [
    "__tests__/server/{name}.test.ts",
    "e2e/{name}.spec.ts",
  ],
  documentation: ["docs/{name}.md"],
  orchestration: [
    "src/server/orchestrator/{name}.ts",
  ],
};

/**
 * Mock executor for development and testing.
 * Returns plausible ExecutionResult with simulated delay.
 * No external API calls — safe to use without credentials.
 */
export class MockAgentExecutor implements AgentExecutor {
  private readonly delayMs: number;

  constructor(options?: { delayMs?: number }) {
    this.delayMs = options?.delayMs ?? 100;
    logger.info({ delayMs: this.delayMs }, "MockAgentExecutor initialized");
  }

  async execute(
    request: ExecutionRequest,
    signal?: AbortSignal
  ): Promise<ExecutionResult> {
    const start = Date.now();

    signal?.throwIfAborted();

    // Simulate execution time
    await this.simulateDelay(signal);

    signal?.throwIfAborted();

    const changedFiles = this.generateChangedFiles(
      request.taskType,
      request.domainPaths,
      request.ticketRef
    );

    const result: ExecutionResult = {
      taskId: request.taskId,
      status: "completed",
      changedFiles,
      testRequirements: this.generateTestRequirements(changedFiles),
      summary: `[MOCK] Completed ${request.taskType} task for ${request.ticketRef}: ${request.description.slice(0, 100)}`,
      durationMs: Date.now() - start,
    };

    logger.info(
      { taskId: request.taskId, agentId: request.agentId, changedFiles: changedFiles.length },
      "Mock execution completed"
    );

    return result;
  }

  async healthCheck(): Promise<{ status: "healthy" | "unhealthy" | "disabled" }> {
    return { status: "healthy" };
  }

  private async simulateDelay(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true }
      );
    });
  }

  private generateChangedFiles(
    taskType: string,
    domainPaths: string[],
    ticketRef: string
  ): string[] {
    // If domain paths are provided, generate files within those paths
    if (domainPaths.length > 0) {
      return domainPaths.slice(0, 3).map((p) => {
        // If it's a directory pattern, append a plausible file
        if (p.endsWith("/") || p.endsWith("*")) {
          const base = p.replace(/[\/*]+$/, "");
          return `${base}/mock-change.ts`;
        }
        return p;
      });
    }

    // Otherwise, use templates for the task type
    const templates = FILE_TEMPLATES[taskType] ?? FILE_TEMPLATES["backend"] ?? [];
    const slug = ticketRef.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return templates.map((t) =>
      t.replace("{name}", slug).replace("{Name}", slug.charAt(0).toUpperCase() + slug.slice(1))
    );
  }

  private generateTestRequirements(changedFiles: string[]): string[] {
    return changedFiles
      .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts"))
      .map((f) => `Verify changes in ${f}`);
  }
}
