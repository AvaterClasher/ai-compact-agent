import { beforeEach, describe, expect, mock, test } from "bun:test";
import { compactions, messageParts, messages, sessions } from "@repo/shared";
import { eq } from "drizzle-orm";
import { insertMessage, insertMessagePart, insertSession } from "../helpers/factories.js";
import { createTestDB, type TestDB } from "../helpers/test-db.js";

// Return different summaries on each call
let generateCallCount = 0;
mock.module("ai", () => ({
  generateText: async () => {
    generateCallCount++;
    return { text: `Summary ${generateCallCount}` };
  },
}));

mock.module("@ai-sdk/anthropic", () => ({
  anthropic: () => ({}),
}));

const { processCompaction } = await import("../../compaction/index.js");

describe("chain compaction (multiple compactions on same session)", () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDB();
    generateCallCount = 0;
  });

  async function addMessages(sessionId: string, count: number, baseTime = Date.now()) {
    for (let i = 0; i < count; i++) {
      const msg = await insertMessage(db, sessionId, {
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
        createdAt: new Date(baseTime + i * 1000),
      });
      await insertMessagePart(db, msg.id, {
        type: "text",
        content: `Message ${i}`,
        tokenEstimate: 5,
        createdAt: new Date(baseTime + i * 1000),
      });
    }
  }

  test("two compactions accumulate two records for same session", async () => {
    const session = await insertSession(db);
    await addMessages(session.id, 4);

    await processCompaction(db, session.id);
    await addMessages(session.id, 4, Date.now() + 100000);
    await processCompaction(db, session.id);

    const records = db
      .select()
      .from(compactions)
      .where(eq(compactions.sessionId, session.id))
      .all();
    expect(records).toHaveLength(2);
  });

  test("second summary replaces first — only 1 system message remains", async () => {
    const session = await insertSession(db);
    await addMessages(session.id, 4);

    await processCompaction(db, session.id);

    // After first compaction: 1 system message with Summary 1
    let msgs = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain("Summary 1");

    await addMessages(session.id, 2, Date.now() + 100000);
    await processCompaction(db, session.id);

    // After second compaction: 1 system message with Summary 2
    msgs = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("Summary 2");
  });

  test("second compaction messageCountBefore reflects post-first-compaction state", async () => {
    const session = await insertSession(db);
    await addMessages(session.id, 6);

    await processCompaction(db, session.id);

    // Add 3 new messages after first compaction
    await addMessages(session.id, 3, Date.now() + 100000);
    await processCompaction(db, session.id);

    const records = db
      .select()
      .from(compactions)
      .where(eq(compactions.sessionId, session.id))
      .all();

    // First compaction had 6 messages
    expect(records[0].messageCountBefore).toBe(6);
    // Second compaction had 1 (summary) + 3 (new) = 4 messages
    expect(records[1].messageCountBefore).toBe(4);
  });

  test("second compaction tokensBefore reflects summary + new message tokens", async () => {
    const session = await insertSession(db);
    await addMessages(session.id, 4);

    await processCompaction(db, session.id);
    await addMessages(session.id, 2, Date.now() + 100000);
    await processCompaction(db, session.id);

    const records = db
      .select()
      .from(compactions)
      .where(eq(compactions.sessionId, session.id))
      .all();

    // Second compaction's tokensBefore should be > 0 (summary tokens + new message tokens)
    expect(records[1].tokensBefore).toBeGreaterThan(0);
    // And should differ from first compaction
    expect(records[1].tokensBefore).not.toBe(records[0].tokensBefore);
  });

  test("cascade deletion removes old messageParts on each compaction", async () => {
    const session = await insertSession(db);
    await addMessages(session.id, 4);

    const msgsBefore = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    const partsBefore = db
      .select()
      .from(messageParts)
      .all()
      .filter((p) => msgsBefore.some((m) => m.id === p.messageId));
    expect(partsBefore.length).toBeGreaterThan(0);

    await processCompaction(db, session.id);

    // After compaction, only the system summary message exists — old parts were cascade-deleted
    const msgsAfter = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    expect(msgsAfter).toHaveLength(1);

    // Check that old message IDs' parts are gone
    for (const oldMsg of msgsBefore) {
      const remaining = db
        .select()
        .from(messageParts)
        .where(eq(messageParts.messageId, oldMsg.id))
        .all();
      expect(remaining).toHaveLength(0);
    }
  });

  test("session status returns to active after each compaction", async () => {
    const session = await insertSession(db);
    await addMessages(session.id, 4);

    await processCompaction(db, session.id);
    let [s] = db.select().from(sessions).where(eq(sessions.id, session.id)).all();
    expect(s.status).toBe("active");

    await addMessages(session.id, 2, Date.now() + 100000);
    await processCompaction(db, session.id);
    [s] = db.select().from(sessions).where(eq(sessions.id, session.id)).all();
    expect(s.status).toBe("active");
  });

  test("3 sequential compactions → 3 records, 1 final system message", async () => {
    const session = await insertSession(db);

    for (let round = 0; round < 3; round++) {
      await addMessages(session.id, 3, Date.now() + round * 200000);
      await processCompaction(db, session.id);
    }

    const records = db
      .select()
      .from(compactions)
      .where(eq(compactions.sessionId, session.id))
      .all();
    expect(records).toHaveLength(3);

    const finalMsgs = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    expect(finalMsgs).toHaveLength(1);
    expect(finalMsgs[0].role).toBe("system");
    expect(finalMsgs[0].content).toContain("Summary 3");
  });

  test("each compaction summary is distinct based on call counter", async () => {
    const session = await insertSession(db);

    await addMessages(session.id, 2);
    await processCompaction(db, session.id);

    await addMessages(session.id, 2, Date.now() + 100000);
    await processCompaction(db, session.id);

    const records = db
      .select()
      .from(compactions)
      .where(eq(compactions.sessionId, session.id))
      .all();

    expect(records[0].summary).toBe("Summary 1");
    expect(records[1].summary).toBe("Summary 2");
  });
});
