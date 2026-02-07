import { messageParts, messages, PRUNE_MINIMUM, PRUNE_PROTECT } from "@repo/shared";
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../db/client.js";
import { tracer } from "../instrumentation.js";
import { estimateTokens } from "./token.js";

/**
 * Prune old tool outputs from a session's message parts.
 *
 * Strategy (from OpenCode):
 * - Iterate backwards through message parts
 * - Skip parts belonging to the last 2 user turns
 * - Accumulate token counts past the PRUNE_PROTECT threshold
 * - Mark parts as pruned if >= PRUNE_MINIMUM tokens available
 */
export async function prune(db: DB, sessionId: string): Promise<number> {
  return tracer.startActiveSpan(
    "compaction.prune",
    { attributes: { "session.id": sessionId } },
    async (span) => {
      // Get all messages for this session, ordered by creation time
      const sessionMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(desc(messages.createdAt));

      // Find the last 2 user turn boundaries
      let userTurnCount = 0;
      const protectedMessageIds = new Set<string>();

      for (const msg of sessionMessages) {
        if (msg.role === "user") {
          userTurnCount++;
        }
        if (userTurnCount <= 2) {
          protectedMessageIds.add(msg.id);
        } else {
          break;
        }
        // Also protect messages between the user messages (assistant responses, tool results)
        protectedMessageIds.add(msg.id);
      }

      // Get all unpruned tool-result parts not in protected messages
      const allParts = await db
        .select()
        .from(messageParts)
        .where(and(eq(messageParts.pruned, false)))
        .orderBy(desc(messageParts.createdAt));

      // Filter to parts belonging to this session's messages and not protected
      const sessionMessageIds = new Set(sessionMessages.map((m) => m.id));
      const candidateParts = allParts.filter(
        (p) =>
          sessionMessageIds.has(p.messageId) &&
          !protectedMessageIds.has(p.messageId) &&
          (p.type === "tool-result" || p.type === "tool-call"),
      );

      // Calculate total tokens and determine what to prune
      let totalTokens = 0;
      for (const part of allParts.filter((p) => sessionMessageIds.has(p.messageId))) {
        totalTokens += part.tokenEstimate || estimateTokens(part.content);
      }

      // Only prune if we're past the protect threshold
      if (totalTokens <= PRUNE_PROTECT) {
        span.end();
        return 0;
      }

      // Accumulate tokens to prune from oldest candidates
      let tokensToPrune = 0;
      const partsToPrune: string[] = [];

      for (const part of candidateParts.reverse()) {
        const tokens = part.tokenEstimate || estimateTokens(part.content);
        tokensToPrune += tokens;
        partsToPrune.push(part.id);
      }

      // Only actually prune if we have enough to make it worthwhile
      if (tokensToPrune < PRUNE_MINIMUM) {
        span.end();
        return 0;
      }

      // Mark parts as pruned and replace content with placeholder
      for (const partId of partsToPrune) {
        await db
          .update(messageParts)
          .set({
            pruned: true,
            content: JSON.stringify("[content pruned to save context]"),
          })
          .where(eq(messageParts.id, partId));
      }

      span.setAttributes({ "tokens.pruned": tokensToPrune, "parts.pruned": partsToPrune.length });
      span.end();
      return tokensToPrune;
    },
  ); // end tracer.startActiveSpan
}
