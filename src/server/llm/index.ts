export { LLMClient, LLMClientStub } from "./client";
export type { LLMConfig, LLMResponse, StructuredOutputRequest } from "./types";
export { LLMConfigSchema, LLMResponseSchema } from "./types";

import { LLMClient, LLMClientStub } from "./client";
import { getEnv } from "@/server/config/env";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "llm" });

// ─── Singleton Management ─────────────────────────────────────────────────────

let _client: LLMClient | undefined;

/**
 * Get the LLM client singleton.
 * Returns stub client if ANTHROPIC_API_KEY is not configured.
 */
export function getLLMClient(): LLMClient {
  if (_client === undefined) {
    const env = getEnv();

    if (env.ANTHROPIC_API_KEY !== undefined) {
      _client = new LLMClient({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL,
      });
      logger.info("LLM client created (Anthropic mode)");
    } else {
      _client = new LLMClientStub();
      logger.warn(
        "ANTHROPIC_API_KEY not configured - using stub LLM client. " +
          "Task decomposition will return mock data."
      );
    }
  }

  return _client;
}

/**
 * Reset the client singleton (for testing).
 */
export function resetLLMClient(): void {
  _client = undefined;
}
