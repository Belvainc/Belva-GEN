import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AgentExecutor, ExecutionRequest, ExecutionResult } from "./types";
import { getEnv } from "@/server/config/env";
import { CircuitBreaker } from "@/server/lib/circuit-breaker";
import { withRetry } from "@/server/lib/retry";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "claude-executor" });

// ─── Claude Response Schema ─────────────────────────────────────────────────
// Structured output from Claude's response, extracted from the text content.

const ClaudeTaskResultSchema = z.object({
  changedFiles: z.array(z.string()),
  testRequirements: z.array(z.string()),
  summary: z.string().min(1),
});

/**
 * Agent executor that uses the Anthropic Claude API.
 * Sends agent definition as system prompt, task details as user message.
 * Parses structured JSON response for file changes and test requirements.
 *
 * Wrapped in CircuitBreaker + withRetry for resilience.
 */
export class ClaudeCodeExecutor implements AgentExecutor {
  private readonly circuitBreaker: CircuitBreaker;
  private client: Anthropic | undefined;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      name: "claude-api",
      failureThreshold: 3,
      cooldownMs: 60_000,
      monitorWindowMs: 120_000,
    });
    logger.info("ClaudeCodeExecutor initialized");
  }

  async execute(
    request: ExecutionRequest,
    signal?: AbortSignal
  ): Promise<ExecutionResult> {
    const start = Date.now();
    const client = this.getClient();

    try {
      const responseText = await this.circuitBreaker.execute(() =>
        withRetry(
          async () => {
            signal?.throwIfAborted();

            const msg = await client.messages.create({
              model: getEnv().ANTHROPIC_MODEL,
              max_tokens: 4096,
              system: request.systemPrompt,
              messages: [
                {
                  role: "user",
                  content: this.buildUserMessage(request),
                },
              ],
            });

            const textBlock = msg.content.find((b) => b.type === "text");
            if (!textBlock || textBlock.type !== "text") {
              throw new Error("No text response from Claude API");
            }

            return textBlock.text;
          },
          { maxAttempts: 2, baseDelayMs: 2000, signal }
        )
      );

      // Parse structured result from response
      const parsed = this.parseResponse(responseText);

      const result: ExecutionResult = {
        taskId: request.taskId,
        status: "completed",
        changedFiles: parsed.changedFiles,
        testRequirements: parsed.testRequirements,
        summary: parsed.summary,
        durationMs: Date.now() - start,
      };

      logger.info(
        { taskId: request.taskId, agentId: request.agentId, changedFiles: parsed.changedFiles.length },
        "Claude execution completed"
      );

      return result;
    } catch (error) {
      const isTimeout = signal?.aborted === true;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      logger.error(
        { taskId: request.taskId, agentId: request.agentId, error: errorMessage },
        "Claude execution failed"
      );

      return {
        taskId: request.taskId,
        status: isTimeout ? "timeout" : "failed",
        changedFiles: [],
        testRequirements: [],
        summary: `Execution failed: ${errorMessage}`,
        durationMs: Date.now() - start,
        error: errorMessage,
      };
    }
  }

  async healthCheck(): Promise<{ status: "healthy" | "unhealthy" | "disabled" }> {
    const env = getEnv();

    if (!env.ANTHROPIC_API_KEY) {
      return { status: "disabled" };
    }

    if (this.circuitBreaker.getState() === "open") {
      return { status: "unhealthy" };
    }

    return { status: "healthy" };
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = getEnv().ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is required for ClaudeCodeExecutor");
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  private buildUserMessage(request: ExecutionRequest): string {
    const sections: string[] = [
      `## Task`,
      `- Ticket: ${request.ticketRef}`,
      `- Type: ${request.taskType}`,
      `- Task ID: ${request.taskId}`,
      ``,
      `## Description`,
      request.description,
    ];

    if (request.constraints.length > 0) {
      sections.push(
        ``,
        `## Constraints`,
        ...request.constraints.map((c) => `- ${c}`)
      );
    }

    if (request.acceptanceCriteria.length > 0) {
      sections.push(
        ``,
        `## Acceptance Criteria`,
        ...request.acceptanceCriteria.map((ac) => `- ${ac}`)
      );
    }

    if (request.domainPaths.length > 0) {
      sections.push(
        ``,
        `## Allowed File Paths`,
        ...request.domainPaths.map((p) => `- ${p}`)
      );
    }

    if (request.priorResults && request.priorResults.length > 0) {
      sections.push(
        ``,
        `## Prior Attempt Results`,
        ...request.priorResults.map((r) => `- ${r}`)
      );
    }

    sections.push(
      ``,
      `## Required Output Format`,
      `Respond with a JSON object containing:`,
      `\`\`\`json`,
      `{`,
      `  "changedFiles": ["list of file paths you modified"],`,
      `  "testRequirements": ["list of tests that should be run"],`,
      `  "summary": "brief description of what you did and why"`,
      `}`,
      `\`\`\``,
    );

    return sections.join("\n");
  }

  private parseResponse(text: string): z.infer<typeof ClaudeTaskResultSchema> {
    // Extract JSON block from response (may be wrapped in markdown code fences)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch?.[1]?.trim() ?? text.trim();

    try {
      const raw: unknown = JSON.parse(jsonStr);
      return ClaudeTaskResultSchema.parse(raw);
    } catch {
      // If parsing fails, construct a minimal result from the raw text
      logger.warn("Failed to parse structured JSON from Claude response, using fallback");
      return {
        changedFiles: [],
        testRequirements: [],
        summary: text.slice(0, 500),
      };
    }
  }
}
