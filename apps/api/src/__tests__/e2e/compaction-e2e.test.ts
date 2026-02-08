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

describe("compaction e2e (UIMessageStream)", () => {
  beforeEach(() => {
    testDb = createTestDB();
    mockMode = "normal";
  });

  test("compaction is transparent — no compaction event in stream", async () => {
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
    const chunks = parseUIStream(text);
    const types = chunks.map((c) => c.type);

    // Compaction is now transparent to the client — no compaction event
    expect(types).not.toContain("compaction");
    // But stream should still complete normally with text and finish
    expect(types).toContain("text-delta");
    expect(types).toContain("finish");
  });

  test("stream completes normally after compaction", async () => {
    mockMode = "compaction";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const chunks = parseUIStream(text);
    const types = chunks.map((c) => c.type);

    // Should have a complete stream lifecycle
    expect(types).toContain("start");
    expect(types).toContain("text-delta");
    expect(types).toContain("data-done");
    expect(types).toContain("finish");
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

  test("no compaction → normal stream without compaction events", async () => {
    mockMode = "normal";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    const text = await res.text();
    const chunks = parseUIStream(text);
    const types = chunks.map((c) => c.type);

    expect(types).not.toContain("compaction");
    expect(types).toContain("text-delta");
    expect(types).toContain("finish");
  });

  test("tool events + compaction all appear correctly in stream", async () => {
    mockMode = "tool-then-compaction";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "list files and compact" }),
    });

    const text = await res.text();
    const chunks = parseUIStream(text);
    const types = chunks.map((c) => c.type);

    // Tool events should be present
    expect(types).toContain("tool-input-available");
    expect(types).toContain("tool-output-available");

    // Compaction is transparent
    expect(types).not.toContain("compaction");

    // Stream should finish normally
    expect(types).toContain("finish");

    // Tool events should appear before text-delta and finish
    const toolInputIdx = types.indexOf("tool-input-available");
    const toolOutputIdx = types.indexOf("tool-output-available");
    expect(toolInputIdx).toBeLessThan(toolOutputIdx);
  });

  test("multiple compactions are transparent — stream completes normally", async () => {
    mockMode = "multi-compaction";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "long conversation" }),
    });

    const text = await res.text();
    const chunks = parseUIStream(text);
    const types = chunks.map((c) => c.type);

    // No compaction events
    expect(types).not.toContain("compaction");

    // Stream should still have text and complete
    expect(types).toContain("text-delta");
    expect(types).toContain("finish");
  });

  test("error event appears in stream", async () => {
    mockMode = "error";
    const session = await insertSession(testDb);

    const res = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "trigger error" }),
    });

    const text = await res.text();
    const chunks = parseUIStream(text);

    const errorChunk = chunks.find((c) => c.type === "error");
    expect(errorChunk).toBeDefined();
    expect(errorChunk?.errorText).toContain("Something went wrong");
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
