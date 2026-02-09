import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  insertMessage,
  insertMessagePart,
  insertSession,
  seedConversation,
} from "../helpers/factories.js";
import {
  buildTextResponse,
  buildToolCallOnlyResponse,
  createMockStream,
} from "../helpers/mock-ai.js";
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

let streamCallCount = 0;
let capturedMessages: unknown[][] = [];

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
    streamCallCount++;
    capturedMessages.push([...opts.messages]);
    if (streamCallCount === 1) {
      // Step 1: tool call
      return createMockStream(
        buildToolCallOnlyResponse("shell", { command: "ls" }, "file.ts\nindex.ts"),
      );
    }
    // Step 2: final text (validates messages from step 1)
    return createMockStream(buildTextResponse("Done."));
  },
  generateText: async () => ({ text: "Summary" }),
}));

const { loadConversation, wrapToolOutput, runAgentLoop } = await import("../../agent/loop.js");

/** AI SDK v6 valid tool result output types */
const VALID_OUTPUT_TYPES = [
  "json",
  "text",
  "error-text",
  "error-json",
  "execution-denied",
  "content",
];

/** Assert that a tool result output matches AI SDK v6 discriminated union format */
function assertValidToolResultOutput(output: unknown) {
  expect(typeof output).toBe("object");
  expect(output).not.toBeNull();
  const obj = output as Record<string, unknown>;
  expect(obj).toHaveProperty("type");
  expect(obj).toHaveProperty("value");
  expect(VALID_OUTPUT_TYPES).toContain(obj.type as string);
}

describe("wrapToolOutput", () => {
  test("wraps object as json type", () => {
    const result = wrapToolOutput({ content: "file data" });
    expect(result).toEqual({ type: "json", value: { content: "file data" } });
  });

  test("wraps string as text type", () => {
    const result = wrapToolOutput("plain text output");
    expect(result).toEqual({ type: "text", value: "plain text output" });
  });

  test("wraps null as json type", () => {
    const result = wrapToolOutput(null);
    expect(result).toEqual({ type: "json", value: null });
  });

  test("wraps array as json type", () => {
    const result = wrapToolOutput([1, 2, 3]);
    expect(result).toEqual({ type: "json", value: [1, 2, 3] });
  });

  test("wraps number as json type", () => {
    const result = wrapToolOutput(42);
    expect(result).toEqual({ type: "json", value: 42 });
  });

  test("wraps boolean as json type", () => {
    const result = wrapToolOutput(true);
    expect(result).toEqual({ type: "json", value: true });
  });
});

describe("loadConversation produces AI SDK v6 compatible tool results", () => {
  beforeEach(() => {
    testDb = createTestDB();
  });

  test("tool result output has { type, value } discriminated union", async () => {
    const { session } = await seedConversation(testDb);
    const conversation = await loadConversation(session.id);

    const toolMessages = conversation.filter((m: { role: string }) => m.role === "tool");
    expect(toolMessages.length).toBeGreaterThan(0);

    for (const toolMsg of toolMessages) {
      const parts = (toolMsg as { content: Array<{ output: unknown }> }).content;
      for (const part of parts) {
        assertValidToolResultOutput(part.output);
      }
    }
  });

  test("JSON tool result preserves original data inside value field", async () => {
    const session = await insertSession(testDb);
    const msg = await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Read file",
    });
    await insertMessagePart(testDb, msg.id, {
      type: "tool-call",
      toolName: "readFile",
      toolCallId: "tc-fmt-1",
      content: JSON.stringify({ path: "/tmp/test.ts" }),
    });
    await insertMessagePart(testDb, msg.id, {
      type: "tool-result",
      toolName: "readFile",
      toolCallId: "tc-fmt-1",
      content: JSON.stringify({ content: "export const x = 1;" }),
    });

    const conversation = await loadConversation(session.id);
    const toolMsg = conversation.find((m: { role: string }) => m.role === "tool") as {
      content: Array<{ output: { type: string; value: unknown } }>;
    };

    expect(toolMsg).toBeDefined();
    expect(toolMsg.content[0].output.type).toBe("json");
    expect(toolMsg.content[0].output.value).toEqual({ content: "export const x = 1;" });
  });

  test("string tool result uses text type", async () => {
    const session = await insertSession(testDb);
    const msg = await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Run command",
    });
    await insertMessagePart(testDb, msg.id, {
      type: "tool-call",
      toolName: "shell",
      toolCallId: "tc-fmt-2",
      content: JSON.stringify({ command: "echo hi" }),
    });
    await insertMessagePart(testDb, msg.id, {
      type: "tool-result",
      toolName: "shell",
      toolCallId: "tc-fmt-2",
      content: JSON.stringify("hi"),
    });

    const conversation = await loadConversation(session.id);
    const toolMsg = conversation.find((m: { role: string }) => m.role === "tool") as {
      content: Array<{ output: { type: string; value: unknown } }>;
    };

    expect(toolMsg).toBeDefined();
    expect(toolMsg.content[0].output.type).toBe("text");
    expect(toolMsg.content[0].output.value).toBe("hi");
  });

  test("raw object without type/value fails format check (documents the bug)", () => {
    // This is what we USED to pass as output — a raw object
    const rawOutput = { content: "file data" };
    expect(rawOutput).not.toHaveProperty("type");

    // After wrapToolOutput, it passes
    const wrapped = wrapToolOutput(rawOutput);
    assertValidToolResultOutput(wrapped);
  });
});

describe("in-memory conversation format during multi-step loop", () => {
  beforeEach(() => {
    testDb = createTestDB();
    streamCallCount = 0;
    capturedMessages = [];
  });

  test("messages passed to streamText step 2 have valid tool result format", async () => {
    const session = await insertSession(testDb);

    await runAgentLoop(session.id, "List files", {
      onToken: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onReasoningDelta: () => {},
      onStepFinish: () => {},
      onCompaction: () => {},
      onDone: () => {},
      onError: () => {},
    });

    // Step 2's streamText call receives the conversation with tool results from step 1
    expect(capturedMessages.length).toBe(2);
    const step2Messages = capturedMessages[1] as Array<{
      role: string;
      content: unknown;
    }>;

    const toolMessages = step2Messages.filter((m) => m.role === "tool");
    expect(toolMessages.length).toBeGreaterThan(0);

    for (const toolMsg of toolMessages) {
      const parts = toolMsg.content as Array<{ output: unknown }>;
      for (const part of parts) {
        assertValidToolResultOutput(part.output);
      }
    }
  });

  test("tool result output in step 2 contains original tool output value", async () => {
    const session = await insertSession(testDb);

    await runAgentLoop(session.id, "List files", {
      onToken: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onReasoningDelta: () => {},
      onStepFinish: () => {},
      onCompaction: () => {},
      onDone: () => {},
      onError: () => {},
    });

    const step2Messages = capturedMessages[1] as Array<{
      role: string;
      content: unknown;
    }>;
    const toolMsg = step2Messages.find((m) => m.role === "tool") as {
      content: Array<{ output: { type: string; value: unknown } }>;
    };

    expect(toolMsg).toBeDefined();
    // The mock returned "file.ts\nindex.ts" as tool output
    expect(toolMsg.content[0].output.type).toBe("text");
    expect(toolMsg.content[0].output.value).toBe("file.ts\nindex.ts");
  });
});
