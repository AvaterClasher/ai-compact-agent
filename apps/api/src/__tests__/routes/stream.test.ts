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
mock.module("../../docker/manager.js", () => ({
  ensureImage: async () => {},
  getSandboxStatus: () => ({ status: "ready", error: null }),
}));
mock.module("../../docker/sandbox-pool.js", () => ({
  cleanupContainer: async () => {},
  cleanupAllContainers: async () => {},
}));

// Mock the agent loop to avoid real AI SDK calls
mock.module("../../agent/loop.js", () => ({
  runAgentLoop: async (
    _sessionId: string,
    _content: string,
    callbacks: {
      onToken: (delta: string) => Promise<void>;
      onStepFinish: (usage: unknown, toolResults?: unknown[]) => Promise<void>;
      onCompaction: () => Promise<void>;
      onDone: (messageId: string, usage: unknown) => Promise<void>;
      onError: (error: Error) => Promise<void>;
    },
  ) => {
    await callbacks.onToken("Hello ");
    await callbacks.onToken("world!");
    await callbacks.onStepFinish(
      { input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      [],
    );
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

/** Parse raw SSE text into an array of { event, data } objects */
function parseSSE(text: string): { event: string; data: unknown }[] {
  const events: { event: string; data: unknown }[] = [];
  let currentEvent = "";
  let currentData = "";

  for (const line of text.split("\n")) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      currentData = line.slice(6);
    } else if (line === "" && currentEvent && currentData) {
      try {
        events.push({ event: currentEvent, data: JSON.parse(currentData) });
      } catch {
        // skip malformed
      }
      currentEvent = "";
      currentData = "";
    }
  }

  return events;
}

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

  test("done event contains messageId and usage", async () => {
    const session = await insertSession(testDb);
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const events = parseSSE(text);
    const doneEvent = events.find((e) => e.event === "done");

    expect(doneEvent).toBeDefined();
    expect(doneEvent?.data).toEqual({
      messageId: "msg-123",
      usage: { input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    });
  });

  test("emits step-finish before done", async () => {
    const session = await insertSession(testDb);
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const events = parseSSE(text);
    const eventTypes = events.map((e) => e.event);

    expect(eventTypes).toContain("step-finish");
    expect(eventTypes).toContain("done");
    expect(eventTypes.indexOf("step-finish")).toBeLessThan(eventTypes.indexOf("done"));
  });

  test("token events contain delta text", async () => {
    const session = await insertSession(testDb);
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const events = parseSSE(text);
    const tokenEvents = events.filter((e) => e.event === "token");

    expect(tokenEvents).toHaveLength(2);
    expect(tokenEvents[0].data).toEqual({ delta: "Hello " });
    expect(tokenEvents[1].data).toEqual({ delta: "world!" });
  });
});
