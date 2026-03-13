import { z } from "zod";

// ─── OpenClaw Chat Completions API ─────────────────────────────────────────
// Request/response schemas for the OpenClaw Gateway v1/chat/completions endpoint.

export const OpenClawMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
export type OpenClawMessage = z.infer<typeof OpenClawMessageSchema>;

export const OpenClawRequestSchema = z.object({
  model: z.string(),
  messages: z.array(OpenClawMessageSchema),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  agent_id: z.string().optional(),
});
export type OpenClawRequest = z.infer<typeof OpenClawRequestSchema>;

// ─── Response ──────────────────────────────────────────────────────────────

const OpenClawChoiceSchema = z.object({
  index: z.number(),
  message: z.object({
    role: z.literal("assistant"),
    content: z.string(),
  }),
  finish_reason: z.enum(["stop", "length", "tool_use"]).nullable(),
});

const OpenClawUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
}).partial();

export const OpenClawResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(OpenClawChoiceSchema).min(1),
  usage: OpenClawUsageSchema.optional(),
});
export type OpenClawResponse = z.infer<typeof OpenClawResponseSchema>;

// ─── Task Result (parsed from assistant content) ───────────────────────────

export const OpenClawTaskResultSchema = z.object({
  changedFiles: z.array(z.string()),
  testRequirements: z.array(z.string()),
  summary: z.string().min(1),
});
export type OpenClawTaskResult = z.infer<typeof OpenClawTaskResultSchema>;

// ─── Config Patch RPC ──────────────────────────────────────────────────────

export const ConfigGetResponseSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  baseHash: z.string(),
});
export type ConfigGetResponse = z.infer<typeof ConfigGetResponseSchema>;

export const ConfigPatchRequestSchema = z.object({
  baseHash: z.string(),
  patch: z.record(z.string(), z.unknown()),
});
export type ConfigPatchRequest = z.infer<typeof ConfigPatchRequestSchema>;
