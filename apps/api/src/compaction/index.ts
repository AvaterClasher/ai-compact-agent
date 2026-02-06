import { anthropic } from "@ai-sdk/anthropic";
import type { TokenUsage } from "@repo/shared";
import { compactions, messages, OUTPUT_TOKEN_MAX, sessions } from "@repo/shared";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DB } from "../db/client.js";
import { estimateTokens } from "./token.js";

export { prune } from "./prune.js";
export { estimateTokens } from "./token.js";

/**
 * Check if the context is overflowing and compaction is needed.
 * Formula: input + cacheRead + output > contextWindow - OUTPUT_TOKEN_MAX
 *
 * Claude's context window is 200k tokens.
 */
export function isOverflow(usage: TokenUsage, contextWindow = 200_000): boolean {
  const totalUsed = usage.input + usage.cacheRead + usage.output;
  return totalUsed > contextWindow - OUTPUT_TOKEN_MAX;
}

/**
 * Process compaction: summarize the conversation and replace history.
 */
export async function processCompaction(
  db: DB,
  sessionId: string,
  model = "claude-sonnet-4-20250514",
): Promise<void> {
  // Mark session as compacting
  await db
    .update(sessions)
    .set({ status: "compacting", updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  try {
    // Get all messages for the session
    const sessionMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt);

    if (sessionMessages.length === 0) {
      await db
        .update(sessions)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(sessions.id, sessionId));
      return;
    }

    // Estimate tokens before compaction
    const tokensBefore = sessionMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);

    // Build conversation text for summarization
    const conversationText = sessionMessages
      .map((msg) => `[${msg.role}]: ${msg.content}`)
      .join("\n\n");

    // Generate summary
    const { text: summary } = await generateText({
      model: anthropic(model),
      system: `You are a conversation summarizer. Create a detailed summary of the following conversation between a user and a coding assistant.
Include:
- Key decisions made
- Code files created or modified (with paths)
- Current state of the task
- Any pending items or next steps
- Important context the assistant needs to continue helping

Be thorough but concise. This summary will replace the full conversation history.`,
      prompt: conversationText,
    });

    const tokensAfter = estimateTokens(summary);

    // Store compaction record
    await db.insert(compactions).values({
      id: nanoid(),
      sessionId,
      summary,
      tokensBefore,
      tokensAfter,
      messageCountBefore: sessionMessages.length,
      auto: true,
      createdAt: new Date(),
    });

    // Delete old messages
    for (const msg of sessionMessages) {
      await db.delete(messages).where(eq(messages.id, msg.id));
    }

    // Insert summary as a system message
    await db.insert(messages).values({
      id: nanoid(),
      sessionId,
      role: "system",
      content: `[Conversation Summary - ${sessionMessages.length} messages compacted]\n\n${summary}`,
      tokensInput: 0,
      tokensOutput: 0,
      tokensReasoning: 0,
      tokensCacheRead: 0,
      tokensCacheWrite: 0,
      cost: 0,
      createdAt: new Date(),
    });

    // Restore session status
    await db
      .update(sessions)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));

    console.log(
      `Compacted session ${sessionId}: ${tokensBefore} -> ${tokensAfter} tokens (${sessionMessages.length} messages)`,
    );
  } catch (error) {
    // Restore session status on error
    await db
      .update(sessions)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
    throw error;
  }
}
