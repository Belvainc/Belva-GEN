import { z } from "zod";

// ─── LLM Configuration ────────────────────────────────────────────────────────

export const LLMConfigSchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().min(1),
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.3),
});
export type LLMConfig = z.infer<typeof LLMConfigSchema>;

// ─── LLM Response ─────────────────────────────────────────────────────────────

export const LLMResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  stopReason: z.enum(["end_turn", "max_tokens", "stop_sequence"]),
});
export type LLMResponse = z.infer<typeof LLMResponseSchema>;

// ─── Structured Output Request ────────────────────────────────────────────────

export interface StructuredOutputRequest<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
}
