import { beforeEach, describe, expect, mock, test } from "bun:test";
import { messageParts, messages } from "@repo/shared";
import { nanoid } from "nanoid";
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

let requestCount = 0;

mock.module("../../agent/loop.js", () => ({
  runAgentLoop: async (
    sessionId: string,
    content: string,
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
    requestCount++;
    const usage = { input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0 };

    // Save user message
    const userMsgId = nanoid();
    testDb
      .insert(messages)
      .values({ id: userMsgId, sessionId, role: "user", content, createdAt: new Date() })
      .run();
    testDb
      .insert(messageParts)
      .values({
        id: nanoid(),
        messageId: userMsgId,
        type: "text",
        content,
        tokenEstimate: Math.ceil(content.length / 4),
        createdAt: new Date(),
      })
      .run();

    // Save assistant message with tool call
    const assistantMsgId = nanoid();
    testDb
      .insert(messages)
      .values({
        id: assistantMsgId,
        sessionId,
        role: "assistant",
        content: "Here is the file content.",
        tokensInput: 150,
        tokensOutput: 30,
        createdAt: new Date(),
      })
      .run();

    // Tool call part
    testDb
      .insert(messageParts)
      .values({
        id: nanoid(),
        messageId: assistantMsgId,
        type: "tool-call",
        toolName: "readFile",
        toolCallId: `call-${requestCount}`,
        content: JSON.stringify({ path: "/tmp/test.ts" }),
        tokenEstimate: 10,
        createdAt: new Date(),
      })
      .run();

    // Tool result part
    testDb
      .insert(messageParts)
      .values({
        id: nanoid(),
        messageId: assistantMsgId,
        type: "tool-result",
        toolName: "readFile",
        toolCallId: `call-${requestCount}`,
        content: JSON.stringify({ content: "export const x = 1;" }),
        tokenEstimate: 10,
        createdAt: new Date(),
      })
      .run();

    // Text part
    testDb
      .insert(messageParts)
      .values({
        id: nanoid(),
        messageId: assistantMsgId,
        type: "text",
        content: "Here is the file content.",
        tokenEstimate: 6,
        createdAt: new Date(),
      })
      .run();

    // Stream events
    await callbacks.onToolCall(`call-${requestCount}`, "readFile", { path: "/tmp/test.ts" });
    await callbacks.onToolResult(`call-${requestCount}`, "readFile", {
      content: "export const x = 1;",
    });
    await callbacks.onStepFinish(usage, [{ content: "export const x = 1;" }]);
    await callbacks.onToken("Here is the file content.");
    await callbacks.onStepFinish(usage, []);
    await callbacks.onDone(assistantMsgId, usage);
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

describe("E2E: session with tool calls", () => {
  beforeEach(() => {
    testDb = createTestDB();
    requestCount = 0;
  });

  test("full lifecycle: create session → send message → verify tool parts in messages", async () => {
    // Step 1: Create session
    const createRes = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Tool Test" }),
    });
    expect(createRes.status).toBe(201);
    const session = (await createRes.json()) as { id: string };

    // Step 2: Send message via stream
    const streamRes = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Read the test file" }),
    });
    expect(streamRes.status).toBe(200);

    const text = await streamRes.text();
    const chunks = parseUIStream(text);
    const types = chunks.map((c) => c.type);

    // Verify UIMessageStream events include tool and text events
    expect(types).toContain("tool-input-available");
    expect(types).toContain("tool-output-available");
    expect(types).toContain("text-delta");
    expect(types).toContain("finish");

    // Step 3: Verify messages endpoint includes tool parts
    const msgRes = await app.request(`/api/messages/${session.id}`);
    expect(msgRes.status).toBe(200);

    const messageList = (await msgRes.json()) as Array<{
      role: string;
      content: string;
      parts?: Array<{ type: string; toolName?: string; toolCallId?: string }>;
    }>;

    expect(messageList.length).toBe(2);

    const assistantMsg = messageList.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.parts).toBeDefined();

    const toolCallPart = assistantMsg?.parts?.find((p) => p.type === "tool-call");
    expect(toolCallPart).toBeDefined();
    expect(toolCallPart?.toolName).toBe("readFile");

    const toolResultPart = assistantMsg?.parts?.find((p) => p.type === "tool-result");
    expect(toolResultPart).toBeDefined();
    expect(toolResultPart?.toolName).toBe("readFile");

    const textPart = assistantMsg?.parts?.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
  });

  test("tool-input-available event includes toolName and input", async () => {
    const createRes = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Tool Detail Test" }),
    });
    const session = (await createRes.json()) as { id: string };

    const streamRes = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Read a file" }),
    });

    const text = await streamRes.text();
    const chunks = parseUIStream(text);

    const toolInputChunk = chunks.find((c) => c.type === "tool-input-available") as {
      type: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
    };
    expect(toolInputChunk).toBeDefined();
    expect(toolInputChunk.toolName).toBe("readFile");
    expect(toolInputChunk.input).toEqual({ path: "/tmp/test.ts" });
  });

  test("tool-output-available event includes output", async () => {
    const createRes = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Tool Result Test" }),
    });
    const session = (await createRes.json()) as { id: string };

    const streamRes = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Read a file" }),
    });

    const text = await streamRes.text();
    const chunks = parseUIStream(text);

    const toolOutputChunk = chunks.find((c) => c.type === "tool-output-available") as {
      type: string;
      toolCallId: string;
      output: unknown;
    };
    expect(toolOutputChunk).toBeDefined();
    expect(toolOutputChunk.output).toEqual({ content: "export const x = 1;" });
  });
});
