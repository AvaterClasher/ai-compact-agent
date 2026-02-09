import { beforeEach, describe, expect, test } from "bun:test";
import { compactions, messageParts, messages, sessions } from "@repo/shared";
import { eq } from "drizzle-orm";
import {
  insertCompaction,
  insertMessage,
  insertMessagePart,
  insertSession,
} from "../helpers/factories.js";
import { createTestDB, type TestDB } from "../helpers/test-db.js";

describe("database operations", () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDB();
  });

  describe("sessions CRUD", () => {
    test("inserts and retrieves a session", async () => {
      const session = await insertSession(db, { title: "My Session" });
      const [found] = db.select().from(sessions).where(eq(sessions.id, session.id)).all();
      expect(found.title).toBe("My Session");
      expect(found.status).toBe("active");
    });

    test("updates session fields", async () => {
      const session = await insertSession(db);
      db.update(sessions).set({ title: "Updated" }).where(eq(sessions.id, session.id)).run();
      const [found] = db.select().from(sessions).where(eq(sessions.id, session.id)).all();
      expect(found.title).toBe("Updated");
    });

    test("deletes a session", async () => {
      const session = await insertSession(db);
      db.delete(sessions).where(eq(sessions.id, session.id)).run();
      const result = db.select().from(sessions).where(eq(sessions.id, session.id)).all();
      expect(result).toHaveLength(0);
    });
  });

  describe("cascading deletes", () => {
    test("deleting a session cascades to messages", async () => {
      const session = await insertSession(db);
      await insertMessage(db, session.id);
      await insertMessage(db, session.id);

      db.delete(sessions).where(eq(sessions.id, session.id)).run();

      const remaining = db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
      expect(remaining).toHaveLength(0);
    });

    test("deleting a session cascades to message parts via messages", async () => {
      const session = await insertSession(db);
      const msg = await insertMessage(db, session.id);
      await insertMessagePart(db, msg.id);

      db.delete(sessions).where(eq(sessions.id, session.id)).run();

      const remainingParts = db.select().from(messageParts).all();
      expect(remainingParts).toHaveLength(0);
    });

    test("deleting a session cascades to compactions", async () => {
      const session = await insertSession(db);
      await insertCompaction(db, session.id);

      db.delete(sessions).where(eq(sessions.id, session.id)).run();

      const remaining = db.select().from(compactions).all();
      expect(remaining).toHaveLength(0);
    });

    test("deleting a message cascades to its parts", async () => {
      const session = await insertSession(db);
      const msg = await insertMessage(db, session.id);
      await insertMessagePart(db, msg.id);
      await insertMessagePart(db, msg.id);

      db.delete(messages).where(eq(messages.id, msg.id)).run();

      const remaining = db
        .select()
        .from(messageParts)
        .where(eq(messageParts.messageId, msg.id))
        .all();
      expect(remaining).toHaveLength(0);
    });
  });

  describe("foreign key constraints", () => {
    test("cannot insert message with non-existent session_id", () => {
      expect(() => {
        db.insert(messages)
          .values({
            id: "msg-orphan",
            sessionId: "nonexistent",
            role: "user",
            content: "test",
            createdAt: new Date(),
          })
          .run();
      }).toThrow();
    });

    test("cannot insert message_part with non-existent message_id", () => {
      expect(() => {
        db.insert(messageParts)
          .values({
            id: "part-orphan",
            messageId: "nonexistent",
            type: "text",
            content: "test",
            createdAt: new Date(),
          })
          .run();
      }).toThrow();
    });
  });
});
