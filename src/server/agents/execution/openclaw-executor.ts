import { z } from "zod";
import type { AgentExecutor, ExecutionRequest, ExecutionResult } from "./types";
import { getEnv } from "@/server/config/env";
import { CircuitBreaker } from "@/server/lib/circuit-breaker";
import { withRetry } from "@/server/lib/retry";
import { createChildLogger } from "@/server/config/logger";
import {
  OpenClawResponseSchema,
  OpenClawTaskResultSchema,
  type OpenClawRequest,
} from "./openclaw-schemas";

const logger = createChildLogger({ module: "openclaw-executor" });

/**
 * Agent executor that delegates to an OpenClaw Gateway.
 *
 * Posts to the OpenClaw v1/chat/completions endpoint with:
 * - System prompt composed by our prompt-composer (agent def + SOUL.md)
 * - User message with task details
 * - Agent ID for MCP tool routing
 *
 * OpenClaw provides MCP tool access (Jira, GitHub, Filesystem),
 * workspace isolation, and model routing. System prompts are
 * composed by our orchestration layer, not OpenClaw's bootstrap.
 */
export class OpenClawExecutor implements AgentExecutor {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;

  constructor() {
    const env = getEnv();
    this.endpoint = env.OPENCLAW_ENDPOINT;
    this.apiKey = env.OPENCLAW_API_KEY;

    this.circuitBreaker = new CircuitBreaker({
      name: "openclaw-gateway",
      failureThreshold: 3,
      cooldownMs: 60_000,
      monitorWindowMs: 120_000,
    });

    logger.info({ endpoint: this.endpoint }, "OpenClawExecutor initialized");
  }

  async execute(
    request: ExecutionRequest,
    signal?: AbortSignal
  ): Promise<ExecutionResult> {
    const start = Date.now();

    try {
      const responseText = await this.circuitBreaker.execute(() =>
        withRetry(
          async () => {
            signal?.throwIfAborted();

            const body: OpenClawRequest = {
              model: request.model ?? getEnv().ANTHROPIC_MODEL,
              agent_id: request.agentId,
              messages: [
                { role: "system", content: request.systemPrompt },
                { role: "user", content: this.buildUserMessage(request) },
              ],
              max_tokens: 4096,
              temperature: 0.3,
            };

            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };
            if (this.apiKey) {
              headers["Authorization"] = `Bearer ${this.apiKey}`;
            }

            const response = await fetch(
              `${this.endpoint}/v1/chat/completions`,
              {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal,
              }
            );

            if (!response.ok) {
              const errorBody = await response.text().catch(() => "");
              throw new Error(
                `OpenClaw API error ${response.status}: ${errorBody.slice(0, 200)}`
              );
            }

            const rawJson: unknown = await response.json();
            const parsed = OpenClawResponseSchema.parse(rawJson);

            const firstChoice = parsed.choices[0];
            if (!firstChoice) {
              throw new Error("No choices in OpenClaw response");
            }

            return firstChoice.message.content;
          },
          { maxAttempts: 2, baseDelayMs: 2000, signal }
        )
      );

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
        {
          taskId: request.taskId,
          agentId: request.agentId,
          changedFiles: parsed.changedFiles.length,
          durationMs: result.durationMs,
        },
        "OpenClaw execution completed"
      );

      return result;
    } catch (error) {
      const isTimeout = signal?.aborted === true;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error(
        {
          taskId: request.taskId,
          agentId: request.agentId,
          error: errorMessage,
        },
        "OpenClaw execution failed"
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

  async healthCheck(): Promise<{
    status: "healthy" | "unhealthy" | "disabled";
  }> {
    if (this.circuitBreaker.getState() === "open") {
      return { status: "unhealthy" };
    }

    try {
      const response = await fetch(`${this.endpoint}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return { status: response.ok ? "healthy" : "unhealthy" };
    } catch {
      return { status: "unhealthy" };
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────

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
      `After completing the task, include a JSON block with your results:`,
      `\`\`\`json`,
      `{`,
      `  "changedFiles": ["list of file paths you modified"],`,
      `  "testRequirements": ["list of tests that should be run"],`,
      `  "summary": "brief description of what you did and why"`,
      `}`,
      `\`\`\``
    );

    return sections.join("\n");
  }

  private parseResponse(
    text: string
  ): z.infer<typeof OpenClawTaskResultSchema> {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch?.[1]?.trim() ?? text.trim();

    try {
      const raw: unknown = JSON.parse(jsonStr);
      return OpenClawTaskResultSchema.parse(raw);
    } catch {
      logger.warn(
        "Failed to parse structured JSON from OpenClaw response, using fallback"
      );
      return {
        changedFiles: [],
        testRequirements: [],
        summary: text.slice(0, 500),
      };
    }
  }
}
