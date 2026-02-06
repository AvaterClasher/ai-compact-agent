import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { messages, messageParts } from "@repo/shared";
import { db } from "../db/client.js";

export const messagesRouter = new Hono();

// GET /api/messages/:sessionId - Get message history for a session
messagesRouter.get("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  // Fetch parts for each message
  const messagesWithParts = await Promise.all(
    result.map(async (msg) => {
      const parts = await db
        .select()
        .from(messageParts)
        .where(eq(messageParts.messageId, msg.id))
        .orderBy(asc(messageParts.createdAt));

      return { ...msg, parts };
    })
  );

  return c.json(messagesWithParts);
});
