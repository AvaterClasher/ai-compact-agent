import { beforeEach, describe, expect, mock, test } from "bun:test";
import { insertSession } from "../helpers/factories.js";
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

// Mock the agent loop to avoid real AI SDK calls
mock.module("../../agent/loop.js", () => ({
  runAgentLoop: async (
    _sessionId: string,
    _content: string,
    callbacks: {
      onToken: (delta: string) => Promise<void>;
      onStepFinish: (usage: unknown, toolResults?: unknown[]) => Promise<void>;
      onDone: (messageId: string, usage: unknown) => Promise<void>;
      onError: (error: Error) => Promise<void>;
    },
  ) => {
    await callbacks.onToken("Hello ");
    await callbacks.onToken("world!");
    await callbacks.onDone("msg-123", {
      input: 100,
      output: 50,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  },
}));

const { default: appModule } = await import("../../index.js");
const app = {
  request: async (path: string, init?: RequestInit) =>
    appModule.fetch(new Request(`http://localhost${path}`, init), {}),
};

describe("stream routes", () => {
  beforeEach(() => {
    testDb = createTestDB();
  });

  test("returns 404 for non-existent session", async () => {
    const res = await app.request("/api/stream/nonexistent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
    expect(res.status).toBe(404);
  });

  test("returns 400 for empty content", async () => {
    const session = await insertSession(testDb);
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 409 for session in compacting status", async () => {
    const session = await insertSession(testDb, { status: "compacting" });
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
    expect(res.status).toBe(409);
  });

  test("returns SSE stream with token and done events", async () => {
    const session = await insertSession(testDb);
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain("event: token");
    expect(text).toContain("event: done");
  });
});
