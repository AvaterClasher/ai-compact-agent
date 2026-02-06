import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eq } from "drizzle-orm";
import { sessions, sendMessageSchema } from "@repo/shared";
import { db } from "../db/client.js";
import { runAgentLoop } from "../agent/loop.js";

export const streamRouter = new Hono();

// POST /api/stream/:sessionId - Send message and stream response via SSE
streamRouter.post("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  // Verify session exists
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));

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

  let eventId = 0;

  return streamSSE(c, async (stream) => {
    await runAgentLoop(sessionId, parsed.data.content, {
      onToken: async (delta) => {
        await stream.writeSSE({
          data: JSON.stringify({ delta }),
          event: "token",
          id: String(eventId++),
        });
      },

      onStepFinish: async (usage, toolResults) => {
        await stream.writeSSE({
          data: JSON.stringify({ usage, toolResults }),
          event: "step-finish",
          id: String(eventId++),
        });
      },

      onDone: async (messageId, usage) => {
        await stream.writeSSE({
          data: JSON.stringify({ messageId, usage }),
          event: "done",
          id: String(eventId++),
        });
      },

      onError: async (error) => {
        await stream.writeSSE({
          data: JSON.stringify({ message: error.message }),
          event: "error",
          id: String(eventId++),
        });
      },
    });
  });
});
