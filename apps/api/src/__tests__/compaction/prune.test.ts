import { beforeEach, describe, expect, test } from "bun:test";
import { messageParts } from "@repo/shared";
import { eq } from "drizzle-orm";
import { prune } from "../../compaction/prune.js";
import {
  insertMessage,
  insertMessagePart,
  insertSession,
  seedConversation,
} from "../helpers/factories.js";
import { createTestDB, type TestDB } from "../helpers/test-db.js";

describe("prune", () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDB();
  });

  test("returns 0 when session has no messages", async () => {
    const session = await insertSession(db);
    expect(await prune(db, session.id)).toBe(0);
  });

  test("returns 0 when total tokens below PRUNE_PROTECT threshold", async () => {
    // Small conversation: well under 40k tokens
    const { session } = await seedConversation(db, { turns: 2, contentSize: 100 });
    expect(await prune(db, session.id)).toBe(0);
  });

  test("prunes tool-result and tool-call parts from old messages", async () => {
    // Create conversation with enough tokens to trigger pruning
    // PRUNE_PROTECT = 40000 tokens = 160000 chars
    const { session } = await seedConversation(db, { turns: 10, contentSize: 20000 });
    const pruned = await prune(db, session.id);
    expect(pruned).toBeGreaterThan(0);
  });

  test("protects the last 2 user turns from pruning", async () => {
    const { session, messages: msgs } = await seedConversation(db, {
      turns: 10,
      contentSize: 20000,
    });

    await prune(db, session.id);

    // Get the last 2 user messages (sorted by createdAt desc)
    const userMsgs = msgs.filter((m) => m.role === "user");
    const lastTwoUserIds = userMsgs.slice(-2).map((m) => m.id);

    // Parts belonging to protected messages should NOT be pruned
    for (const msgId of lastTwoUserIds) {
      const parts = db.select().from(messageParts).where(eq(messageParts.messageId, msgId)).all();
      for (const part of parts) {
        expect(part.pruned).toBe(false);
      }
    }
  });

  test("replaces pruned content with placeholder", async () => {
    const { session } = await seedConversation(db, { turns: 10, contentSize: 20000 });
    await prune(db, session.id);

    const prunedParts = db.select().from(messageParts).where(eq(messageParts.pruned, true)).all();

    expect(prunedParts.length).toBeGreaterThan(0);
    for (const part of prunedParts) {
      expect(part.content).toContain("content pruned");
    }
  });

  test("only prunes tool-call and tool-result parts, not text", async () => {
    const { session } = await seedConversation(db, { turns: 10, contentSize: 20000 });
    await prune(db, session.id);

    const prunedParts = db.select().from(messageParts).where(eq(messageParts.pruned, true)).all();

    for (const part of prunedParts) {
      expect(["tool-call", "tool-result"]).toContain(part.type);
    }
  });

  test("returns 0 if pruneable tokens below PRUNE_MINIMUM", async () => {
    const session = await insertSession(db);
    // Add enough text parts to cross PRUNE_PROTECT (40k tokens = 160k chars)
    for (let i = 0; i < 5; i++) {
      const msg = await insertMessage(db, session.id, {
        role: "user",
        content: "x".repeat(40000),
        createdAt: new Date(Date.now() - (10 - i) * 10000),
      });
      await insertMessagePart(db, msg.id, {
        type: "text",
        content: "x".repeat(40000),
        tokenEstimate: 10000,
        createdAt: new Date(Date.now() - (10 - i) * 10000),
      });
    }
    // Add tiny tool parts (well under PRUNE_MINIMUM = 20k tokens)
    const oldMsg = await insertMessage(db, session.id, {
      role: "assistant",
      content: "resp",
      createdAt: new Date(Date.now() - 100000),
    });
    await insertMessagePart(db, oldMsg.id, {
      type: "tool-result",
      content: "small",
      tokenEstimate: 2,
      createdAt: new Date(Date.now() - 100000),
    });

    const result = await prune(db, session.id);
    expect(result).toBe(0);
  });
});
