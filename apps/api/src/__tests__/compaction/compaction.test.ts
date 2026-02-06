import { beforeEach, describe, expect, mock, test } from "bun:test";
import { compactions, messages, sessions } from "@repo/shared";
import { eq } from "drizzle-orm";
import { insertMessage, insertSession } from "../helpers/factories.js";
import { createTestDB, type TestDB } from "../helpers/test-db.js";

// Mock AI SDK before importing processCompaction
mock.module("ai", () => ({
  generateText: async () => ({
    text: "This is a summary of the conversation.",
  }),
}));

mock.module("@ai-sdk/anthropic", () => ({
  anthropic: () => ({}),
}));

const { processCompaction } = await import("../../compaction/index.js");

describe("processCompaction", () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDB();
  });

  test("restores session to active status after compaction", async () => {
    const session = await insertSession(db);
    await insertMessage(db, session.id, { content: "User question" });
    await insertMessage(db, session.id, { role: "assistant", content: "Response" });

    await processCompaction(db, session.id);

    const [updated] = db.select().from(sessions).where(eq(sessions.id, session.id)).all();
    expect(updated.status).toBe("active");
  });

  test("deletes old messages and inserts summary as system message", async () => {
    const session = await insertSession(db);
    await insertMessage(db, session.id, { content: "Q1" });
    await insertMessage(db, session.id, { role: "assistant", content: "A1" });
    await insertMessage(db, session.id, { content: "Q2" });

    await processCompaction(db, session.id);

    const remaining = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].role).toBe("system");
    expect(remaining[0].content).toContain("Conversation Summary");
    expect(remaining[0].content).toContain("3 messages compacted");
  });

  test("creates a compaction record", async () => {
    const session = await insertSession(db);
    await insertMessage(db, session.id, { content: "Hello" });

    await processCompaction(db, session.id);

    const records = db
      .select()
      .from(compactions)
      .where(eq(compactions.sessionId, session.id))
      .all();
    expect(records).toHaveLength(1);
    expect(records[0].messageCountBefore).toBe(1);
    expect(records[0].auto).toBe(true);
  });

  test("no-ops for session with zero messages", async () => {
    const session = await insertSession(db);
    await processCompaction(db, session.id);

    const [updated] = db.select().from(sessions).where(eq(sessions.id, session.id)).all();
    expect(updated.status).toBe("active");

    const records = db.select().from(compactions).all();
    expect(records).toHaveLength(0);
  });
});
