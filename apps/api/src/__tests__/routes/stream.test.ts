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

/** Parse UIMessageStream (SSE data-only format) into typed chunks */
function parseUIStream(text: string): Array<{ type: string; [key: string]: unknown }> {
  const chunks: Array<{ type: string; [key: string]: unknown }> = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ") && !line.startsWith("data: [DONE]")) {
      try {
        chunks.push(JSON.parse(line.slice(6)));
      } catch {
        // skip malformed
      }
    }
  }
  return chunks;
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

  test("returns UIMessageStream with text-delta and finish events", async () => {
    const session = await insertSession(testDb);
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    const chunks = parseUIStream(text);
    const types = chunks.map((c) => c.type);

    expect(types).toContain("text-delta");
    expect(types).toContain("finish");
  });

  test("done data event contains messageId and usage", async () => {
    const session = await insertSession(testDb);
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const chunks = parseUIStream(text);
    const doneChunk = chunks.find((c) => c.type === "data-done");

    expect(doneChunk).toBeDefined();
    expect(doneChunk?.data).toEqual({
      messageId: "msg-123",
      usage: { input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    });
  });

  test("emits finish-step before finish", async () => {
    const session = await insertSession(testDb);
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const chunks = parseUIStream(text);
    const types = chunks.map((c) => c.type);

    expect(types).toContain("finish-step");
    expect(types).toContain("finish");
    expect(types.indexOf("finish-step")).toBeLessThan(types.lastIndexOf("finish"));
  });

  test("text-delta events contain delta text", async () => {
    const session = await insertSession(testDb);
    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const chunks = parseUIStream(text);
    const textDeltas = chunks.filter((c) => c.type === "text-delta");

    expect(textDeltas).toHaveLength(2);
    expect(textDeltas[0].delta).toBe("Hello ");
    expect(textDeltas[1].delta).toBe("world!");
  });
});
