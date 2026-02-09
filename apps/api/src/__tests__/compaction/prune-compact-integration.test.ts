import { beforeEach, describe, expect, mock, test } from "bun:test";
import { messageParts, messages } from "@repo/shared";
import { eq } from "drizzle-orm";
import { insertMessage, insertMessagePart, insertSession } from "../helpers/factories.js";
import { createTestDB, type TestDB } from "../helpers/test-db.js";

let capturedPrompt = "";
mock.module("ai", () => ({
  generateText: async (opts: { prompt: string }) => {
    capturedPrompt = opts.prompt;
    return { text: "Post-prune summary." };
  },
}));

mock.module("@ai-sdk/anthropic", () => ({
  anthropic: () => ({}),
}));

const { processCompaction, isOverflow, prune, estimateTokens } = await import(
  "../../compaction/index.js"
);

describe("prune + compaction integration", () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDB();
    capturedPrompt = "";
  });

  /**
   * Create a session with enough tool-result parts to exceed PRUNE_PROTECT,
   * so prune() has material to work with.
   */
  async function seedLargeConversation(
    sessionId: string,
    turnCount: number,
    toolContentSize: number,
  ) {
    for (let i = 0; i < turnCount; i++) {
      const userMsg = await insertMessage(db, sessionId, {
        role: "user",
        content: `Question ${i}`,
        createdAt: new Date(Date.now() - (turnCount - i) * 4000),
      });
      await insertMessagePart(db, userMsg.id, {
        type: "text",
        content: `Question ${i}`,
        tokenEstimate: 5,
        createdAt: new Date(Date.now() - (turnCount - i) * 4000),
      });

      const assistantMsg = await insertMessage(db, sessionId, {
        role: "assistant",
        content: `Answer ${i}`,
        createdAt: new Date(Date.now() - (turnCount - i) * 4000 + 1000),
      });
      await insertMessagePart(db, assistantMsg.id, {
        type: "text",
        content: `Answer ${i}`,
        tokenEstimate: 5,
        createdAt: new Date(Date.now() - (turnCount - i) * 4000 + 500),
      });
      await insertMessagePart(db, assistantMsg.id, {
        type: "tool-call",
        toolName: "readFile",
        toolCallId: `call_${i}`,
        content: JSON.stringify({ path: `/file_${i}` }),
        tokenEstimate: 10,
        createdAt: new Date(Date.now() - (turnCount - i) * 4000 + 600),
      });
      await insertMessagePart(db, assistantMsg.id, {
        type: "tool-result",
        toolName: "readFile",
        toolCallId: `call_${i}`,
        content: "z".repeat(toolContentSize),
        tokenEstimate: Math.ceil(toolContentSize / 4),
        createdAt: new Date(Date.now() - (turnCount - i) * 4000 + 700),
      });
    }
  }

  test("prune reduces context but not enough → compaction still needed", async () => {
    const session = await insertSession(db);
    // 10 turns with large tool results: each tool-result = 40k/4 = 10k tokens
    // Total tool tokens = 10 * 10k = 100k — well over PRUNE_PROTECT (40k)
    await seedLargeConversation(session.id, 10, 40000);

    const prunedTokens = await prune(db, session.id);
    expect(prunedTokens).toBeGreaterThan(0);

    // Even after pruning, the messages still exist and would cause overflow
    // in a realistic scenario — compaction is still needed
    const remainingMsgs = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .all();
    expect(remainingMsgs.length).toBeGreaterThan(0);

    // Run compaction — should succeed
    await processCompaction(db, session.id);
    const finalMsgs = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    expect(finalMsgs).toHaveLength(1);
    expect(finalMsgs[0].role).toBe("system");
  });

  test("prune reduces enough → no compaction needed (verify with isOverflow)", async () => {
    const session = await insertSession(db);
    // Small conversation — token total under default context window
    await seedLargeConversation(session.id, 3, 200);

    const prunedTokens = await prune(db, session.id);

    // With small content, total is under PRUNE_PROTECT so nothing pruned
    expect(prunedTokens).toBe(0);

    // Check that isOverflow would say no compaction needed
    // Estimate total tokens from remaining content
    const allParts = db.select().from(messageParts).all();
    const totalTokens = allParts.reduce(
      (sum, p) => sum + (p.tokenEstimate || estimateTokens(p.content)),
      0,
    );
    const usage = { input: totalTokens, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
    expect(isOverflow(usage)).toBe(false);
  });

  test("pruned placeholder text appears in compaction summarization input", async () => {
    const session = await insertSession(db);
    // Create enough content for pruning to kick in
    await seedLargeConversation(session.id, 10, 40000);

    await prune(db, session.id);

    // Verify some parts are now pruned
    const prunedParts = db
      .select()
      .from(messageParts)
      .all()
      .filter((p) => p.pruned);
    expect(prunedParts.length).toBeGreaterThan(0);

    // Run compaction — it should see the pruned content
    await processCompaction(db, session.id);

    expect(capturedPrompt).toContain("[content pruned to save context]");
  });

  test("compaction cascade-deletes pruned parts along with all messages", async () => {
    const session = await insertSession(db);
    await seedLargeConversation(session.id, 10, 40000);

    await prune(db, session.id);

    // Get message IDs before compaction
    const msgsBefore = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    const msgIdsBefore = msgsBefore.map((m) => m.id);

    await processCompaction(db, session.id);

    // All old message parts should be gone (cascade delete)
    for (const msgId of msgIdsBefore) {
      const parts = db.select().from(messageParts).where(eq(messageParts.messageId, msgId)).all();
      expect(parts).toHaveLength(0);
    }

    // Only summary message remains
    const msgsAfter = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    expect(msgsAfter).toHaveLength(1);
    expect(msgsAfter[0].role).toBe("system");
  });
});
