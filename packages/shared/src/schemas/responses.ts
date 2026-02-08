import { z } from "zod";

export const sessionResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  model: z.string(),
  status: z.enum(["active", "compacting", "archived"]),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const messagePartResponseSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  type: z.enum(["text", "tool-call", "tool-result", "reasoning", "compaction"]),
  toolName: z.string().nullable(),
  toolCallId: z.string().nullable(),
  content: z.string(),
  tokenEstimate: z.number(),
  pruned: z.boolean(),
  createdAt: z.number(),
});

export const messageResponseSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  tokensInput: z.number(),
  tokensOutput: z.number(),
  tokensReasoning: z.number(),
  tokensCacheRead: z.number(),
  tokensCacheWrite: z.number(),
  cost: z.number(),
  createdAt: z.number(),
  parts: z.array(messagePartResponseSchema),
});

export const errorResponseSchema = z.object({
  error: z.union([z.string(), z.record(z.unknown())]),
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  sandbox: z.object({
    status: z.enum(["ready", "building", "error", "not_checked"]),
    error: z.string().nullable(),
  }),
});

export const modelsResponseSchema = z.object({
  models: z.array(z.string()),
  default: z.string(),
});

export const generateTitleResponseSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().optional(),
});

export const deleteSuccessResponseSchema = z.object({
  success: z.boolean(),
});
