import type { LLMConfig, LLMResponse, StructuredOutputRequest } from "./types";
import { LLMConfigSchema, LLMResponseSchema } from "./types";
import { withRetry } from "@/server/lib/retry";
import { CircuitBreaker } from "@/server/lib/circuit-breaker";
import { createChildLogger } from "@/server/config/logger";
import { AgentCommunicationError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";

const logger = createChildLogger({ module: "llm-client" });

// ─── Anthropic API Types ──────────────────────────────────────────────────────

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string;
  messages: AnthropicMessage[];
}

interface AnthropicResponse {
  content: Array<{ type: "text"; text: string }>;
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence";
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ─── LLM Client ───────────────────────────────────────────────────────────────

/**
 * Anthropic Claude client for LLM operations.
 * Wrapped in circuit breaker + retry for resilience.
 * All responses are validated with Zod schemas.
 */
export class LLMClient {
  private readonly config: LLMConfig;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(config: Partial<LLMConfig> & { apiKey: string }) {
    this.config = parseOrThrow(LLMConfigSchema, config);
    this.circuitBreaker = new CircuitBreaker({
      name: "anthropic-llm",
      failureThreshold: 3,
      cooldownMs: 60_000,
    });
    logger.info({ model: this.config.model }, "LLM client initialized");
  }

  /**
   * Send a completion request to Claude.
   * Returns the text content of the response.
   */
  async complete(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal
  ): Promise<LLMResponse> {
    return this.circuitBreaker.execute(() =>
      withRetry(
        async () => {
          signal?.throwIfAborted();

          const request: AnthropicRequest = {
            model: this.config.model,
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          };

          logger.debug(
            { model: this.config.model, promptLength: userPrompt.length },
            "Sending LLM request"
          );

          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.config.apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(request),
            signal,
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error");
            throw new AgentCommunicationError(
              `Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`,
              "anthropic-llm"
            );
          }

          const data = (await response.json()) as AnthropicResponse;

          const textContent = data.content.find((c) => c.type === "text");
          if (textContent === undefined) {
            throw new ValidationError("No text content in LLM response", {
              content: data.content,
            });
          }

          const result: LLMResponse = {
            content: textContent.text,
            model: data.model,
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
            stopReason: data.stop_reason,
          };

          // Validate response shape
          parseOrThrow(LLMResponseSchema, result);

          logger.debug(
            {
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              stopReason: result.stopReason,
            },
            "LLM request completed"
          );

          return result;
        },
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          signal,
        }
      )
    );
  }

  /**
   * Request a structured JSON output from Claude.
   * Parses and validates the response against the provided Zod schema.
   */
  async completeStructured<T>(
    request: StructuredOutputRequest<T>
  ): Promise<T> {
    const augmentedSystem = `${request.systemPrompt}

IMPORTANT: You must respond with valid JSON only. No markdown code blocks, no explanation, just the JSON object.`;

    const response = await this.complete(
      augmentedSystem,
      request.userPrompt,
      request.signal
    );

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonContent = response.content.trim();
    if (jsonContent.startsWith("```")) {
      const lines = jsonContent.split("\n");
      jsonContent = lines.slice(1, -1).join("\n").trim();
    }

    try {
      const parsed: unknown = JSON.parse(jsonContent);
      return request.schema.parse(parsed);
    } catch (error) {
      throw new ValidationError(
        `Failed to parse LLM response as valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        { content: response.content.slice(0, 500) }
      );
    }
  }

  /**
   * Get circuit breaker state for health checks.
   */
  getCircuitState(): string {
    return this.circuitBreaker.getState();
  }
}

// ─── Stub Client ──────────────────────────────────────────────────────────────

/**
 * Stub client for development/testing when ANTHROPIC_API_KEY is not configured.
 * Returns mock responses instead of calling the API.
 */
export class LLMClientStub extends LLMClient {
  constructor() {
    // Pass a dummy config since we won't use the API
    super({ apiKey: "stub-key-not-used", model: "stub-model" });
    logger.info("LLM client initialized (STUB mode - no API key configured)");
  }

  override async complete(
    systemPrompt: string,
    userPrompt: string,
    _signal?: AbortSignal
  ): Promise<LLMResponse> {
    logger.info(
      {
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
      },
      "[STUB] Would send LLM request"
    );

    // Return a mock response
    return {
      content: JSON.stringify({
        tasks: [
          {
            taskId: "stub-task-1",
            title: "Stub Task",
            description: "This is a stub task for development",
            taskType: "backend",
            estimatedPoints: 3,
            dependsOn: [],
          },
        ],
        riskAreas: ["Development mode - no real decomposition"],
        affectedFiles: ["src/stub/example.ts"],
      }),
      model: "stub-model",
      inputTokens: 0,
      outputTokens: 0,
      stopReason: "end_turn",
    };
  }

  override async completeStructured<T>(
    request: StructuredOutputRequest<T>
  ): Promise<T> {
    const mockResponse = await this.complete(
      request.systemPrompt,
      request.userPrompt,
      request.signal
    );

    const parsed: unknown = JSON.parse(mockResponse.content);
    return request.schema.parse(parsed);
  }
}
