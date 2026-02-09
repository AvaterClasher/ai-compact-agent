import type { TokenUsage } from "@repo/shared";
import {
  compactions,
  DEFAULT_CONTEXT_WINDOW,
  MODEL_CONTEXT_WINDOWS,
  messageParts,
  messages,
  OUTPUT_TOKEN_MAX,
  sessions,
} from "@repo/shared";
import { generateText } from "ai";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDefaultModel, resolveModel } from "../agent/model.js";
import type { DB } from "../db/client.js";
import { tracer } from "../instrumentation.js";
import { logger } from "../logger.js";
import { estimateTokens } from "./token.js";

export { prune } from "./prune.js";
export { estimateTokens } from "./token.js";

/**
 * Check if the context is overflowing and compaction is needed.
 * Formula: input + cacheRead + output > contextWindow - OUTPUT_TOKEN_MAX
 *
 * Uses per-model context windows from MODEL_CONTEXT_WINDOWS.
 */
export function isOverflow(usage: TokenUsage, model?: string): boolean {
  const contextWindow = (model && MODEL_CONTEXT_WINDOWS[model]) || DEFAULT_CONTEXT_WINDOW;
  const totalUsed = usage.input + usage.cacheRead + usage.output;
  return totalUsed > contextWindow - OUTPUT_TOKEN_MAX;
}

/**
 * Process compaction: summarize the conversation and replace history.
 */
export async function processCompaction(
  db: DB,
  sessionId: string,
  model = getDefaultModel(),
): Promise<void> {
  return tracer.startActiveSpan(
    "compaction.process",
    { attributes: { "session.id": sessionId } },
    async (span) => {
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

        // Fetch all message parts for tool context
        const messageIds = sessionMessages.map((m) => m.id);
        const allParts =
          messageIds.length > 0
            ? await db
                .select()
                .from(messageParts)
                .where(inArray(messageParts.messageId, messageIds))
            : [];

        // Group parts by messageId
        const partsByMessage = new Map<string, (typeof allParts)[number][]>();
        for (const part of allParts) {
          const existing = partsByMessage.get(part.messageId) ?? [];
          existing.push(part);
          partsByMessage.set(part.messageId, existing);
        }

        // Estimate tokens before compaction (messages + parts)
        const messageTokens = sessionMessages.reduce(
          (sum, msg) => sum + estimateTokens(msg.content),
          0,
        );
        const partTokens = allParts.reduce(
          (sum, p) => sum + (p.tokenEstimate || estimateTokens(p.content)),
          0,
        );
        const tokensBefore = messageTokens + partTokens;

        // Build conversation text for summarization (including tool context)
        const conversationText = sessionMessages
          .map((msg) => {
            const parts = partsByMessage.get(msg.id) ?? [];
            const toolParts = parts.filter(
              (p) => p.type === "tool-call" || p.type === "tool-result",
            );

            let text = `[${msg.role}]: ${msg.content}`;
            for (const part of toolParts) {
              if (part.type === "tool-call") {
                text += `\n[Tool Call: ${part.toolName}] ${part.content}`;
              } else if (part.type === "tool-result") {
                text += `\n[Tool Result: ${part.toolName}] ${part.content}`;
              }
            }
            return text;
          })
          .join("\n\n");

        // Generate summary
        const { text: summary } = await generateText({
          model: resolveModel(model),
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

        // Delete old messages (ON DELETE CASCADE handles messageParts cleanup)
        await db.delete(messages).where(eq(messages.sessionId, sessionId));

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

        span.setAttributes({
          "tokens.before": tokensBefore,
          "tokens.after": tokensAfter,
          "messages.count": sessionMessages.length,
        });
        logger.info("Compacted session", {
          sessionId,
          tokensBefore,
          tokensAfter,
          messageCount: sessionMessages.length,
        });
      } catch (error) {
        span.recordException(error as Error);
        // Restore session status on error
        await db
          .update(sessions)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(sessions.id, sessionId));
        throw error;
      } finally {
        span.end();
      }
    },
  ); // end tracer.startActiveSpan
}
