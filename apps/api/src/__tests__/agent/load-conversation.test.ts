import { beforeEach, describe, expect, mock, test } from "bun:test";
import { insertMessage, insertMessagePart, insertSession } from "../helpers/factories.js";
import { buildTextResponse, createMockStream } from "../helpers/mock-ai.js";
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

// Capture the messages arg passed to streamText
let capturedMessages: unknown[] = [];

mock.module("../../db/client.js", () => ({ db: dbProxy }));
mock.module("../../db/migrate.js", () => ({}));
mock.module("@ai-sdk/anthropic", () => ({ anthropic: () => ({}) }));
mock.module("@ai-sdk/openai", () => ({ openai: () => ({}) }));
mock.module("../../agent/tools/index.js", () => ({
  agentTools: {},
  createSandboxedTools: () => ({}),
}));
mock.module("../../agent/model.js", () => ({
  resolveModel: () => ({}),
  getDefaultModel: () => "claude-sonnet-4-20250514",
}));

mock.module("ai", () => ({
  streamText: (opts: { messages: unknown[] }) => {
    capturedMessages = opts.messages;
    return createMockStream(buildTextResponse("OK"));
  },
  generateText: async () => ({ text: "Summary" }),
}));

const { runAgentLoop } = await import("../../agent/loop.js");

function noopCallbacks() {
  return {
    onToken: () => {},
    onToolCall: () => {},
    onToolResult: () => {},
    onReasoningDelta: () => {},
    onStepFinish: () => {},
    onCompaction: () => {},
    onDone: () => {},
    onError: () => {},
  };
}

describe("loadConversation (via runAgentLoop streamText capture)", () => {
  beforeEach(() => {
    testDb = createTestDB();
    capturedMessages = [];
  });

  test("plain user + assistant text → correct message shapes", async () => {
    const session = await insertSession(testDb);
    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Hello",
      createdAt: new Date(Date.now() - 3000),
    });
    await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Hi there",
      createdAt: new Date(Date.now() - 2000),
    });

    await runAgentLoop(session.id, "Follow up", noopCallbacks());

    // Messages: [user "Hello", assistant "Hi there", user "Follow up"]
    // The user message "Follow up" is saved by runAgentLoop before loadConversation
    expect(capturedMessages.length).toBeGreaterThanOrEqual(3);

    const userMsg = capturedMessages[0] as { role: string; content: string };
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toBe("Hello");

    const assistantMsg = capturedMessages[1] as { role: string; content: string };
    expect(assistantMsg.role).toBe("assistant");
    // Plain text assistant (no tool-call parts) should be a string
    expect(typeof assistantMsg.content).toBe("string");
    expect(assistantMsg.content).toBe("Hi there");
  });

  test("assistant with tool-call parts → structured AssistantContentPart[] + tool message", async () => {
    const session = await insertSession(testDb);

    const _userMsg = await insertMessage(testDb, session.id, {
      role: "user",
      content: "Read file",
      createdAt: new Date(Date.now() - 5000),
    });

    const assistantMsg = await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Let me read that.",
      createdAt: new Date(Date.now() - 4000),
    });
    await insertMessagePart(testDb, assistantMsg.id, {
      type: "text",
      content: "Let me read that.",
      tokenEstimate: 5,
      createdAt: new Date(Date.now() - 4000),
    });
    await insertMessagePart(testDb, assistantMsg.id, {
      type: "tool-call",
      toolName: "readFile",
      toolCallId: "call_1",
      content: JSON.stringify({ path: "/src/index.ts" }),
      tokenEstimate: 10,
      createdAt: new Date(Date.now() - 3500),
    });
    await insertMessagePart(testDb, assistantMsg.id, {
      type: "tool-result",
      toolName: "readFile",
      toolCallId: "call_1",
      content: JSON.stringify({ content: "file contents" }),
      tokenEstimate: 10,
      createdAt: new Date(Date.now() - 3400),
    });

    await runAgentLoop(session.id, "Thanks", noopCallbacks());

    // Expected: [user, assistant (structured), tool, user "Thanks"]
    // Find the assistant message with structured content
    const structured = capturedMessages.find(
      (m: unknown) =>
        (m as { role: string }).role === "assistant" &&
        Array.isArray((m as { content: unknown }).content),
    ) as { role: string; content: Array<{ type: string; [key: string]: unknown }> } | undefined;

    expect(structured).toBeDefined();
    const textPart = structured?.content.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect((textPart as unknown as { text: string }).text).toBe("Let me read that.");

    const toolCallPart = structured?.content.find((p) => p.type === "tool-call");
    expect(toolCallPart).toBeDefined();
    expect((toolCallPart as unknown as { toolName: string }).toolName).toBe("readFile");
    expect((toolCallPart as unknown as { input: unknown }).input).toEqual({
      path: "/src/index.ts",
    });

    // Find the tool message following the assistant
    const toolMsg = capturedMessages.find(
      (m: unknown) => (m as { role: string }).role === "tool",
    ) as
      | {
          role: string;
          content: Array<{ type: string; toolCallId: string; output: unknown }>;
        }
      | undefined;
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content[0].toolCallId).toBe("call_1");
    expect(toolMsg?.content[0].output).toEqual({
      type: "json",
      value: { content: "file contents" },
    });
  });

  test("pruned tool-result parts → JSON.parse works on placeholder content", async () => {
    const session = await insertSession(testDb);

    const assistantMsg = await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Read file.",
      createdAt: new Date(Date.now() - 4000),
    });
    await insertMessagePart(testDb, assistantMsg.id, {
      type: "tool-call",
      toolName: "readFile",
      toolCallId: "call_1",
      content: JSON.stringify({ path: "/file.ts" }),
      tokenEstimate: 5,
      createdAt: new Date(Date.now() - 3500),
    });
    await insertMessagePart(testDb, assistantMsg.id, {
      type: "tool-result",
      toolName: "readFile",
      toolCallId: "call_1",
      // Pruned content is stored as JSON.stringify of the placeholder
      content: JSON.stringify("[content pruned to save context]"),
      tokenEstimate: 5,
      pruned: true,
      createdAt: new Date(Date.now() - 3400),
    });

    await runAgentLoop(session.id, "Continue", noopCallbacks());

    const toolMsg = capturedMessages.find(
      (m: unknown) => (m as { role: string }).role === "tool",
    ) as { role: string; content: Array<{ output: unknown }> } | undefined;
    expect(toolMsg).toBeDefined();
    // The output should be wrapped as text type (string values get text wrapping)
    expect(toolMsg?.content[0].output).toEqual({
      type: "text",
      value: "[content pruned to save context]",
    });
  });

  test("post-compaction system summary → loads as system role message", async () => {
    const session = await insertSession(testDb);

    await insertMessage(testDb, session.id, {
      role: "system",
      content: "[Conversation Summary - 5 messages compacted]\n\nPrevious work done...",
      createdAt: new Date(Date.now() - 3000),
    });

    await runAgentLoop(session.id, "What was I working on?", noopCallbacks());

    const systemMsg = capturedMessages.find(
      (m: unknown) => (m as { role: string }).role === "system",
    ) as { role: string; content: string } | undefined;
    expect(systemMsg).toBeDefined();
    expect(systemMsg?.content).toContain("Conversation Summary");
    expect(systemMsg?.content).toContain("Previous work done...");
  });

  test("messages ordered by createdAt ascending", async () => {
    const session = await insertSession(testDb);

    await insertMessage(testDb, session.id, {
      role: "user",
      content: "First",
      createdAt: new Date(Date.now() - 5000),
    });
    await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Second",
      createdAt: new Date(Date.now() - 4000),
    });
    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Third",
      createdAt: new Date(Date.now() - 3000),
    });

    await runAgentLoop(session.id, "Fourth", noopCallbacks());

    // capturedMessages should be in order: First, Second, Third, Fourth
    const contents = capturedMessages.map((m: unknown) => {
      const msg = m as { content: unknown };
      return typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    });
    expect(contents[0]).toBe("First");
    expect(contents[1]).toBe("Second");
    expect(contents[2]).toBe("Third");
    expect(contents[3]).toBe("Fourth");
  });

  test("text-only assistant (no tool-call parts) → plain string content, not array", async () => {
    const session = await insertSession(testDb);

    const assistantMsg = await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Just a plain response",
      createdAt: new Date(Date.now() - 3000),
    });
    // Only a text part, no tool-call parts
    await insertMessagePart(testDb, assistantMsg.id, {
      type: "text",
      content: "Just a plain response",
      tokenEstimate: 5,
      createdAt: new Date(Date.now() - 3000),
    });

    await runAgentLoop(session.id, "Next", noopCallbacks());

    const assistantInConv = capturedMessages.find(
      (m: unknown) => (m as { role: string }).role === "assistant",
    ) as { role: string; content: string } | undefined;
    expect(assistantInConv).toBeDefined();
    expect(typeof assistantInConv?.content).toBe("string");
    expect(assistantInConv?.content).toBe("Just a plain response");
  });
});
