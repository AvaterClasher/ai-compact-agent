import { sessions } from "@repo/shared";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tracer } from "../instrumentation.js";
import { logger } from "../logger.js";
import { resolveModel } from "./model.js";

function getTitleModel(): string {
  if (process.env.ANTHROPIC_API_KEY) return "claude-haiku-4-5-20251001";
  return "gpt-4.1-nano";
}

export async function generateSessionTitle(sessionId: string, userMessage: string): Promise<void> {
  return tracer.startActiveSpan(
    "agent.title-generation",
    { attributes: { "session.id": sessionId } },
    async (span) => {
      try {
        const { text } = await generateText({
          model: resolveModel(getTitleModel()),
          system:
            "Generate a very short title (3-5 words) for a chat session based on the user's first message. Return only the title text, no quotes or punctuation at the end.",
          prompt: userMessage,
        });

        const title = text.trim().slice(0, 200);
        if (!title) return;

        // Re-check title hasn't been renamed by user
        const [current] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
        if (!current || current.title !== "New Session") return;

        await db
          .update(sessions)
          .set({ title, updatedAt: new Date() })
          .where(eq(sessions.id, sessionId));
      } catch (error) {
        span.recordException(error as Error);
        logger.error("Failed to generate title", { sessionId, error });
      } finally {
        span.end();
      }
    },
  ); // end tracer.startActiveSpan
}
