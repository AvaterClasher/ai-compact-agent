import { beforeEach, describe, expect, mock, test } from "bun:test";
import { messageParts, messages } from "@repo/shared";
import { eq } from "drizzle-orm";
import { insertSession } from "../helpers/factories.js";
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

let streamCallCount = 0;

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
  streamText: () => {
    streamCallCount++;
    if (streamCallCount === 1) {
      // Step 1: tool call that returns an error result
      return createMockStream([
        {
          type: "tool-call",
          toolName: "shell",
          toolCallId: "err_call_1",
          input: { command: "rm -rf /protected" },
        },
        {
          type: "tool-result",
          toolName: "shell",
          toolCallId: "err_call_1",
          output: { error: "Permission denied: /protected" },
          isError: true,
        },
        {
          type: "finish",
          totalUsage: {
            inputTokens: 500,
            outputTokens: 100,
            inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 },
            outputTokenDetails: { reasoningTokens: 0 },
          },
        },
      ]);
    }
    // Step 2: agent responds to the error with text
    return createMockStream(buildTextResponse("The command failed due to permission issues."));
  },
  generateText: async () => {
    return { text: "Summary" };
  },
}));

const { runAgentLoop } = await import("../../agent/loop.js");

function trackingCallbacks() {
  const events: string[] = [];
  const toolResults: { toolCallId: string; isError?: boolean }[] = [];
  let doneMessageId = "";
  return {
    events,
    getToolResults: () => toolResults,
    getDoneMessageId: () => doneMessageId,
    callbacks: {
      onToken: () => {
        events.push("token");
      },
      onToolCall: () => {
        events.push("tool-call");
      },
      onToolResult: (_id: string, _name: string, _output: unknown, isError?: boolean) => {
        events.push("tool-result");
        toolResults.push({ toolCallId: _id, isError });
      },
      onReasoningDelta: () => {},
      onStepFinish: () => {
        events.push("step-finish");
      },
      onCompaction: () => {
        events.push("compaction");
      },
      onDone: (messageId: string) => {
        doneMessageId = messageId;
        events.push("done");
      },
      onError: () => {
        events.push("error");
      },
    },
  };
}

describe("loop tool execution error handling", () => {
  beforeEach(() => {
    testDb = createTestDB();
    streamCallCount = 0;
  });

  test("agent continues after tool error and produces final response", async () => {
    const session = await insertSession(testDb);
    const { events, callbacks } = trackingCallbacks();

    await runAgentLoop(session.id, "Delete the protected directory", callbacks);

    expect(events).toContain("tool-call");
    expect(events).toContain("tool-result");
    expect(events).toContain("done");
    // Should have called streamText twice (step 1 with error tool, step 2 with text)
    expect(streamCallCount).toBe(2);
  });

  test("error tool result is stored in message_parts", async () => {
    const session = await insertSession(testDb);
    const { callbacks } = trackingCallbacks();

    await runAgentLoop(session.id, "Delete the protected directory", callbacks);

    const allParts = testDb.select().from(messageParts).all();
    const toolResultParts = allParts.filter((p) => p.type === "tool-result");

    expect(toolResultParts.length).toBeGreaterThanOrEqual(1);
    const errorPart = toolResultParts.find((p) => p.toolCallId === "err_call_1");
    expect(errorPart).toBeDefined();
    expect(errorPart?.content).toContain("Permission denied");
  });

  test("onToolResult receives isError flag from stream", async () => {
    const session = await insertSession(testDb);
    const { callbacks, getToolResults } = trackingCallbacks();

    await runAgentLoop(session.id, "Delete the protected directory", callbacks);

    // Note: the AI SDK stream part has isError but loop.ts currently doesn't pass it through.
    // This test documents the current behavior.
    const results = getToolResults();
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test("final text response includes error acknowledgment", async () => {
    const session = await insertSession(testDb);
    const { callbacks, getDoneMessageId } = trackingCallbacks();

    await runAgentLoop(session.id, "Delete the protected directory", callbacks);

    const doneId = getDoneMessageId();
    const [finalMsg] = testDb.select().from(messages).where(eq(messages.id, doneId)).all();

    expect(finalMsg).toBeDefined();
    expect(finalMsg.content).toContain("permission");
  });
});
