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
    const events = parseSSE(text);
    const eventTypes = events.map((e) => e.event);

    // Verify SSE events include tool-call, tool-result, token, done
    expect(eventTypes).toContain("tool-call");
    expect(eventTypes).toContain("tool-result");
    expect(eventTypes).toContain("token");
    expect(eventTypes).toContain("done");

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

  test("tool-call SSE event includes toolName and input", async () => {
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
    const events = parseSSE(text);

    const toolCallEvent = events.find((e) => e.event === "tool-call") as {
      data: { toolCallId: string; toolName: string; input: unknown };
    };
    expect(toolCallEvent).toBeDefined();
    expect(toolCallEvent.data.toolName).toBe("readFile");
    expect(toolCallEvent.data.input).toEqual({ path: "/tmp/test.ts" });
  });

  test("tool-result SSE event includes output", async () => {
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
    const events = parseSSE(text);

    const toolResultEvent = events.find((e) => e.event === "tool-result") as {
      data: { toolCallId: string; toolName: string; output: unknown };
    };
    expect(toolResultEvent).toBeDefined();
    expect(toolResultEvent.data.toolName).toBe("readFile");
    expect(toolResultEvent.data.output).toEqual({ content: "export const x = 1;" });
  });
});
