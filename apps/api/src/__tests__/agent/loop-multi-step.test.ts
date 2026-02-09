import { beforeEach, describe, expect, mock, test } from "bun:test";
import { compactions, DEFAULT_CONTEXT_WINDOW, messages, OUTPUT_TOKEN_MAX } from "@repo/shared";
import { eq } from "drizzle-orm";
import { insertSession } from "../helpers/factories.js";
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

const overflowThreshold = DEFAULT_CONTEXT_WINDOW - OUTPUT_TOKEN_MAX;

let streamCallCount = 0;
let generateTextCallCount = 0;
let capturedMessagesPerCall: unknown[][] = [];

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
    capturedMessagesPerCall.push([...opts.messages]);

    if (streamCallCount === 1) {
      // Step 1: tool call with normal usage
      return createMockStream(
        buildToolCallOnlyResponse("shell", { command: "ls" }, "file1.ts\nfile2.ts", {
          input: 500,
          output: 100,
        }),
      );
    }
    if (streamCallCount === 2) {
      // Step 2: tool call with overflow usage → triggers compaction
      return createMockStream(
        buildToolCallOnlyResponse("readFile", { path: "/file.ts" }, "file content", {
          input: overflowThreshold + 10000,
          output: 500,
        }),
      );
    }
    // Step 3 (post-compaction): final text response
    return createMockStream(buildTextResponse("Done after multi-step."));
  },
  generateText: async () => {
    generateTextCallCount++;
    return { text: `Multi-step summary ${generateTextCallCount}` };
  },
}));

const { runAgentLoop } = await import("../../agent/loop.js");

function trackingCallbacks() {
  const events: string[] = [];
  let compactionCount = 0;
  let doneMessageId = "";
  const toolCalls: string[] = [];
  return {
    events,
    getCompactionCount: () => compactionCount,
    getDoneMessageId: () => doneMessageId,
    getToolCalls: () => toolCalls,
    callbacks: {
      onToken: () => {
        events.push("token");
      },
      onToolCall: (_id: string, toolName: string) => {
        events.push("tool-call");
        toolCalls.push(toolName);
      },
      onToolResult: () => {
        events.push("tool-result");
      },
      onReasoningDelta: () => {},
      onStepFinish: () => {
        events.push("step-finish");
      },
      onCompaction: () => {
        compactionCount++;
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

describe("loop multi-step tool calls with mid-turn compaction", () => {
  beforeEach(() => {
    testDb = createTestDB();
    streamCallCount = 0;
    generateTextCallCount = 0;
    capturedMessagesPerCall = [];
  });

  test("3 steps: tool → tool (overflow) → compaction → text", async () => {
    const session = await insertSession(testDb);
    const { callbacks, getCompactionCount } = trackingCallbacks();

    await runAgentLoop(session.id, "List files then read one", callbacks);

    expect(getCompactionCount()).toBe(1);
    expect(streamCallCount).toBe(3);
  });

  test("both tool calls are recorded in events", async () => {
    const session = await insertSession(testDb);
    const { callbacks, getToolCalls } = trackingCallbacks();

    await runAgentLoop(session.id, "List files then read one", callbacks);

    expect(getToolCalls()).toEqual(["shell", "readFile"]);
  });

  test("event ordering: tool-call → tool-result → step-finish → tool-call → tool-result → step-finish → compaction → tokens → step-finish → done", async () => {
    const session = await insertSession(testDb);
    const { events, callbacks } = trackingCallbacks();

    await runAgentLoop(session.id, "List files then read one", callbacks);

    // Find key indices
    const firstToolCall = events.indexOf("tool-call");
    const secondToolCall = events.indexOf("tool-call", firstToolCall + 1);
    const compactionIdx = events.indexOf("compaction");
    const firstToken = events.indexOf("token", compactionIdx);
    const doneIdx = events.indexOf("done");

    expect(firstToolCall).toBeLessThan(secondToolCall);
    expect(secondToolCall).toBeLessThan(compactionIdx);
    expect(compactionIdx).toBeLessThan(firstToken);
    expect(firstToken).toBeLessThan(doneIdx);
  });

  test("post-compaction streamText receives system summary", async () => {
    const session = await insertSession(testDb);
    const { callbacks } = trackingCallbacks();

    await runAgentLoop(session.id, "List files then read one", callbacks);

    // Third streamText call (post-compaction) should have system summary
    expect(capturedMessagesPerCall.length).toBe(3);
    const thirdCallMessages = capturedMessagesPerCall[2];
    const systemMsg = thirdCallMessages.find(
      (m: unknown) => (m as { role: string }).role === "system",
    ) as { role: string; content: string } | undefined;
    expect(systemMsg).toBeDefined();
    expect(systemMsg?.content).toContain("Multi-step summary");
  });

  test("assistant message ID changes after compaction", async () => {
    const session = await insertSession(testDb);
    const { callbacks, getDoneMessageId } = trackingCallbacks();

    await runAgentLoop(session.id, "List files then read one", callbacks);

    const doneId = getDoneMessageId();
    // There should be multiple assistant messages (pre-compaction is deleted by compaction,
    // post-compaction placeholder + final)
    const allMsgs = testDb.select().from(messages).where(eq(messages.sessionId, session.id)).all();

    const assistantMsgs = allMsgs.filter((m) => m.role === "assistant");
    expect(assistantMsgs.some((m) => m.id === doneId)).toBe(true);
  });

  test("compaction creates DB record", async () => {
    const session = await insertSession(testDb);
    const { callbacks } = trackingCallbacks();

    await runAgentLoop(session.id, "List files then read one", callbacks);

    const records = testDb
      .select()
      .from(compactions)
      .where(eq(compactions.sessionId, session.id))
      .all();

    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0].summary).toContain("Multi-step summary");
  });
});
