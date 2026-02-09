import { errorResponseSchema, sendMessageSchema, sessions } from "@repo/shared";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { nanoid } from "nanoid";
import { runAgentLoop } from "../agent/loop.js";
import { db } from "../db/client.js";

export const streamRouter = new Hono();

// POST /api/stream/:sessionId - Send message and stream response via UIMessageStream
streamRouter.post(
  "/:sessionId",
  describeRoute({
    tags: ["Streaming"],
    summary: "Send message and stream response",
    description:
      "Sends a user message and returns a UI message stream with text deltas, tool calls, reasoning, and completion events.",
    requestBody: {
      content: {
        "application/json": {
          schema: resolver(sendMessageSchema) as never,
        },
      },
    },
    responses: {
      200: {
        description: "UI message stream",
        content: {
          "text/event-stream": {
            schema: { type: "string" },
          },
        },
      },
      400: {
        description: "Validation error",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      404: {
        description: "Session not found",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      409: {
        description: "Session is currently compacting",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const sessionId = c.req.param("sessionId");

    // Verify session exists
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (session.status === "compacting") {
      return c.json({ error: "Session is currently compacting" }, 409);
    }

    // Parse message
    const body = await c.req.json();
    const parsed = sendMessageSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    // State for tracking open text/reasoning blocks
    let currentTextId: string | null = null;
    let currentReasoningId: string | null = null;

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // biome-ignore lint/suspicious/noExplicitAny: custom data types not inferred
        const w = writer as any;

        w.write({ type: "start" });

        await runAgentLoop(
          sessionId,
          parsed.data.content,
          {
            onToken: (delta) => {
              // Close reasoning block if open
              if (currentReasoningId) {
                w.write({
                  type: "reasoning-end",
                  id: currentReasoningId,
                });
                currentReasoningId = null;
              }
              // Open text block if not open
              if (!currentTextId) {
                currentTextId = nanoid();
                w.write({ type: "text-start", id: currentTextId });
              }
              w.write({
                type: "text-delta",
                id: currentTextId,
                delta,
              });
            },

            onToolCall: (toolCallId, toolName, input) => {
              // Close any open blocks
              if (currentReasoningId) {
                w.write({
                  type: "reasoning-end",
                  id: currentReasoningId,
                });
                currentReasoningId = null;
              }
              if (currentTextId) {
                w.write({ type: "text-end", id: currentTextId });
                currentTextId = null;
              }
              w.write({
                type: "tool-input-available",
                toolCallId,
                toolName,
                input,
                dynamic: true,
              });
            },

            onToolResult: (toolCallId, _toolName, output, isError) => {
              if (isError) {
                w.write({
                  type: "tool-output-error",
                  toolCallId,
                  errorText: typeof output === "string" ? output : JSON.stringify(output),
                  dynamic: true,
                });
              } else {
                w.write({
                  type: "tool-output-available",
                  toolCallId,
                  output,
                  dynamic: true,
                });
              }
            },

            onReasoningDelta: (delta) => {
              // Open reasoning block if not open
              if (!currentReasoningId) {
                currentReasoningId = nanoid();
                w.write({
                  type: "reasoning-start",
                  id: currentReasoningId,
                });
              }
              w.write({
                type: "reasoning-delta",
                id: currentReasoningId,
                delta,
              });
            },

            onStepFinish: (usage, _toolResults) => {
              // Close any open text block
              if (currentTextId) {
                w.write({ type: "text-end", id: currentTextId });
                currentTextId = null;
              }
              // Send token usage as transient data
              w.write({
                type: "data-token-usage",
                data: usage,
                transient: true,
              });
              w.write({ type: "finish-step" });
              w.write({ type: "start-step" });
            },

            onCompaction: () => {
              // Compaction is now transparent to the client.
              // Server compacts and continues; client just sees continuous stream.
            },

            onDone: (messageId, usage) => {
              // Close any open text/reasoning blocks
              if (currentTextId) {
                w.write({ type: "text-end", id: currentTextId });
                currentTextId = null;
              }
              if (currentReasoningId) {
                w.write({
                  type: "reasoning-end",
                  id: currentReasoningId,
                });
                currentReasoningId = null;
              }
              w.write({
                type: "data-done",
                data: { messageId, usage },
                transient: true,
              });
              w.write({ type: "finish" });
            },

            onError: (error) => {
              w.write({
                type: "error",
                errorText: error.message,
              });
            },
          },
          session.model,
        );
      },
      onError: (error) => {
        return error instanceof Error ? error.message : String(error);
      },
    });

    return createUIMessageStreamResponse({ stream });
  },
);
