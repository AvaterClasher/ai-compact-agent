import { beforeEach, describe, expect, mock, test } from "bun:test";
import { insertMessage, insertMessagePart, insertSession } from "../helpers/factories.js";
import { createTestDB, type TestDB } from "../helpers/test-db.js";

let testDb: TestDB;
const dbProxy = new Proxy(
  {},
  {
    get(_, prop) {
      return (testDb as never)[prop];
    },
  },
);

mock.module("../../db/client.js", () => ({ db: dbProxy }));
mock.module("../../db/migrate.js", () => ({}));

const { default: appModule } = await import("../../index.js");
const app = {
  request: async (path: string, init?: RequestInit) =>
    appModule.fetch(new Request(`http://localhost${path}`, init), {}),
};

describe("messages routes", () => {
  beforeEach(() => {
    testDb = createTestDB();
  });

  describe("GET /api/messages/:sessionId", () => {
    test("returns empty array for session with no messages", async () => {
      const session = await insertSession(testDb);
      const res = await app.request(`/api/messages/${session.id}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    test("returns messages with their parts", async () => {
      const session = await insertSession(testDb);
      const msg = await insertMessage(testDb, session.id, { content: "Hello" });
      await insertMessagePart(testDb, msg.id, { type: "text", content: "Hello" });

      const res = await app.request(`/api/messages/${session.id}`);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].content).toBe("Hello");
      expect(body[0].parts).toHaveLength(1);
      expect(body[0].parts[0].type).toBe("text");
    });

    test("returns messages ordered by createdAt ascending", async () => {
      const session = await insertSession(testDb);
      await insertMessage(testDb, session.id, {
        content: "First",
        createdAt: new Date("2024-01-01"),
      });
      await insertMessage(testDb, session.id, {
        content: "Second",
        createdAt: new Date("2024-06-01"),
      });

      const res = await app.request(`/api/messages/${session.id}`);
      const body = await res.json();
      expect(body[0].content).toBe("First");
      expect(body[1].content).toBe("Second");
    });

    test("returns empty array for non-existent session", async () => {
      const res = await app.request("/api/messages/nonexistent");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });
});
