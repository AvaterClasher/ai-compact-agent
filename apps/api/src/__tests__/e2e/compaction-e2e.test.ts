import { beforeEach, describe, expect, mock, test } from "bun:test";
import { messages } from "@repo/shared";
import { eq } from "drizzle-orm";
import { insertMessage, insertSession } from "../helpers/factories.js";
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

// Control mock behavior per test
type MockMode = "normal" | "compaction" | "tool-then-compaction" | "multi-compaction" | "error";
let mockMode: MockMode = "normal";
const compactionSummary = "E2E compaction summary";

mock.module("../../agent/loop.js", () => ({
  runAgentLoop: async (
    sessionId: string,
    _content: string,
    callbacks: {
      onToken: (delta: string) => Promise<void>;
      onToolCall: (toolCallId: string, toolName: string, input: unknown) => Promise<void>;
      onToolResult: (
        toolCallId: string,
        toolName: string,
        output: unknown,
        isError?: boolean,
      ) => Promise<void>;
      onStepFinish: (usage: unknown, toolResults?: unknown[]) => Promise<void>;
      onCompaction: () => Promise<void>;
      onDone: (messageId: string, usage: unknown) => Promise<void>;
      onError: (error: Error) => Promise<void>;
    },
  ) => {
    const usage = { input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0 };

    if (mockMode === "compaction") {
      testDb.delete(messages).where(eq(messages.sessionId, sessionId)).run();
      testDb
        .insert(messages)
        .values({
          id: "summary-msg-1",
          sessionId,
          role: "system",
          content: `[Conversation Summary]\n\n${compactionSummary}`,
          createdAt: new Date(),
        })
        .run();
      await callbacks.onCompaction();
    }

    if (mockMode === "tool-then-compaction") {
      await callbacks.onToolCall("tc-1", "shell", { command: "ls" });
      await callbacks.onToolResult("tc-1", "shell", { stdout: "file.ts" });
      await callbacks.onStepFinish(usage, [{ stdout: "file.ts" }]);

      testDb.delete(messages).where(eq(messages.sessionId, sessionId)).run();
      testDb
        .insert(messages)
        .values({
          id: "summary-msg-2",
          sessionId,
          role: "system",
          content: `[Conversation Summary]\n\nTool+compaction summary`,
          createdAt: new Date(),
        })
        .run();
      await callbacks.onCompaction();
    }

    if (mockMode === "multi-compaction") {
      await callbacks.onCompaction();
      await callbacks.onToken("Middle ");
      await callbacks.onStepFinish(usage, []);
      await callbacks.onCompaction();
    }

    if (mockMode === "error") {
      await callbacks.onError(new Error("Something went wrong in the agent loop"));
      return;
    }

    await callbacks.onToken("Hello ");
    await callbacks.onToken("world!");
    await callbacks.onStepFinish(usage, []);
    await callbacks.onDone("msg-e2e-123", usage);
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

describe("compaction e2e (SSE stream)", () => {
  beforeEach(() => {
    testDb = createTestDB();
    mockMode = "normal";
  });

  test("compaction event appears in SSE stream when onCompaction is called", async () => {
    mockMode = "compaction";
    const session = await insertSession(testDb);
    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Previous message",
      createdAt: new Date(Date.now() - 3000),
    });

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const events = parseSSE(text);

    const compactionEvent = events.find((e) => e.event === "compaction");
    expect(compactionEvent).toBeDefined();
    expect(compactionEvent?.data).toEqual({});
  });

  test("compaction event appears before done event", async () => {
    mockMode = "compaction";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const events = parseSSE(text);
    const eventTypes = events.map((e) => e.event);

    const compactionIdx = eventTypes.indexOf("compaction");
    const doneIdx = eventTypes.indexOf("done");

    expect(compactionIdx).not.toBe(-1);
    expect(doneIdx).not.toBe(-1);
    expect(compactionIdx).toBeLessThan(doneIdx);
  });

  test("after compaction, messages endpoint returns only summary", async () => {
    mockMode = "compaction";
    const session = await insertSession(testDb);
    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Old message that will be compacted",
      createdAt: new Date(Date.now() - 3000),
    });

    await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "new message" }),
    });

    const msgRes = await app.request(`/api/messages/${session.id}`);
    expect(msgRes.status).toBe(200);

    const data = (await msgRes.json()) as Array<{ role: string; content: string }>;
    const systemMsgs = data.filter((m) => m.role === "system");
    expect(systemMsgs.length).toBeGreaterThanOrEqual(1);
    expect(systemMsgs[0].content).toContain("E2E compaction summary");
  });

  test("no compaction → no compaction event in stream", async () => {
    mockMode = "normal";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const events = parseSSE(text);
    const compactionEvent = events.find((e) => e.event === "compaction");

    expect(compactionEvent).toBeUndefined();
  });

  test("tool-call + tool-result + compaction all appear in SSE in correct order", async () => {
    mockMode = "tool-then-compaction";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "list files and compact" }),
    });

    const text = await res.text();
    const events = parseSSE(text);
    const eventTypes = events.map((e) => e.event);

    const toolCallIdx = eventTypes.indexOf("tool-call");
    const toolResultIdx = eventTypes.indexOf("tool-result");
    const compactionIdx = eventTypes.indexOf("compaction");
    const doneIdx = eventTypes.indexOf("done");

    expect(toolCallIdx).not.toBe(-1);
    expect(toolResultIdx).not.toBe(-1);
    expect(compactionIdx).not.toBe(-1);
    expect(doneIdx).not.toBe(-1);

    expect(toolCallIdx).toBeLessThan(toolResultIdx);
    expect(toolResultIdx).toBeLessThan(compactionIdx);
    expect(compactionIdx).toBeLessThan(doneIdx);
  });

  test("multiple compaction events in single stream", async () => {
    mockMode = "multi-compaction";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "long conversation" }),
    });

    const text = await res.text();
    const events = parseSSE(text);
    const compactionEvents = events.filter((e) => e.event === "compaction");

    expect(compactionEvents.length).toBe(2);
  });

  test("error event appears in SSE stream", async () => {
    mockMode = "error";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "trigger error" }),
    });

    const text = await res.text();
    const events = parseSSE(text);

    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent?.data as { message: string }).message).toContain("Something went wrong");
  });

  test("stream to compacting session returns 409", async () => {
    const session = await insertSession(testDb, { status: "compacting" as const });

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("compacting");
  });
});
