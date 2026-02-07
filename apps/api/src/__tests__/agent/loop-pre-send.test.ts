import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DEFAULT_CONTEXT_WINDOW, OUTPUT_TOKEN_MAX } from "@repo/shared";
import { insertMessage, insertSession } from "../helpers/factories.js";
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

let capturedMessages: unknown[] = [];
let _streamCallCount = 0;
let compactionFired = false;
let generateTextCalled = false;

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
    _streamCallCount++;
    capturedMessages = opts.messages;
    return createMockStream(buildTextResponse("Response"));
  },
  generateText: async () => {
    generateTextCalled = true;
    return { text: "Compacted summary for overflow test." };
  },
}));

const { runAgentLoop } = await import("../../agent/loop.js");

function trackingCallbacks() {
  const events: string[] = [];
  return {
    events,
    callbacks: {
      onToken: () => {
        events.push("token");
      },
      onToolCall: () => {
        events.push("tool-call");
      },
      onToolResult: () => {
        events.push("tool-result");
      },
      onReasoningDelta: () => {},
      onStepFinish: () => {
        events.push("step-finish");
      },
      onCompaction: () => {
        compactionFired = true;
        events.push("compaction");
      },
      onDone: () => {
        events.push("done");
      },
      onError: () => {
        events.push("error");
      },
    },
  };
}

describe("loop pre-send overflow check", () => {
  beforeEach(() => {
    testDb = createTestDB();
    capturedMessages = [];
    _streamCallCount = 0;
    compactionFired = false;
    generateTextCalled = false;
  });

  test("last assistant tokensInput near threshold + new user message pushes over → compaction fires", async () => {
    // Set up a session where the last assistant has tokensInput near the limit
    const threshold = DEFAULT_CONTEXT_WINDOW - OUTPUT_TOKEN_MAX; // 168,000
    const session = await insertSession(testDb);

    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Initial question",
      createdAt: new Date(Date.now() - 5000),
    });

    // Assistant with tokensInput close to threshold
    await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Previous response",
      tokensInput: threshold - 100, // Just 100 tokens under
      tokensOutput: 500,
      createdAt: new Date(Date.now() - 4000),
    });

    // New user message with > 100 tokens worth of content → pushes over
    const longContent = "x".repeat(800); // estimateTokens = 200 tokens
    const { events, callbacks } = trackingCallbacks();
    await runAgentLoop(session.id, longContent, callbacks);

    expect(compactionFired).toBe(true);
    expect(generateTextCalled).toBe(true);
  });

  test("projection under threshold → no compaction", async () => {
    const session = await insertSession(testDb);

    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Small question",
      createdAt: new Date(Date.now() - 3000),
    });
    await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Small answer",
      tokensInput: 500, // Way under threshold
      tokensOutput: 100,
      createdAt: new Date(Date.now() - 2000),
    });

    const { events, callbacks } = trackingCallbacks();
    await runAgentLoop(session.id, "Another small question", callbacks);

    expect(compactionFired).toBe(false);
    expect(generateTextCalled).toBe(false);
  });

  test("no prior assistant message, but large conversation → fallback estimation triggers compaction", async () => {
    const session = await insertSession(testDb);

    // Insert user message with content large enough that estimateTokens (chars/4)
    // exceeds contextWindow - OUTPUT_TOKEN_MAX threshold
    const threshold = DEFAULT_CONTEXT_WINDOW - OUTPUT_TOKEN_MAX; // 168,000
    // Need chars/4 > threshold, so chars > threshold * 4 = 672,000
    const contentPerMsg = "x".repeat(threshold * 4 + 100);
    await insertMessage(testDb, session.id, {
      role: "user",
      content: contentPerMsg,
      createdAt: new Date(Date.now() - 3000),
    });

    const { events, callbacks } = trackingCallbacks();
    await runAgentLoop(session.id, "More content", callbacks);

    expect(compactionFired).toBe(true);
  });

  test("fallback estimation within limits → no compaction", async () => {
    const session = await insertSession(testDb);

    // Insert a small user message (no assistant messages)
    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Small message",
      createdAt: new Date(Date.now() - 3000),
    });

    const { events, callbacks } = trackingCallbacks();
    await runAgentLoop(session.id, "Another small message", callbacks);

    expect(compactionFired).toBe(false);
  });

  test("post-compaction summary is loaded into streamText messages", async () => {
    const threshold = DEFAULT_CONTEXT_WINDOW - OUTPUT_TOKEN_MAX;
    const session = await insertSession(testDb);

    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Setup question",
      createdAt: new Date(Date.now() - 5000),
    });
    await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Setup answer",
      tokensInput: threshold + 1000, // Already over threshold
      tokensOutput: 500,
      createdAt: new Date(Date.now() - 4000),
    });

    const { events, callbacks } = trackingCallbacks();
    await runAgentLoop(session.id, "Follow up", callbacks);

    // After compaction, capturedMessages should contain the system summary
    const systemMsg = capturedMessages.find((m: any) => m.role === "system") as any;
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain("Compacted summary for overflow test");
  });

  test("onCompaction fires before onToken", async () => {
    const threshold = DEFAULT_CONTEXT_WINDOW - OUTPUT_TOKEN_MAX;
    const session = await insertSession(testDb);

    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Q",
      createdAt: new Date(Date.now() - 5000),
    });
    await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "A",
      tokensInput: threshold + 5000,
      tokensOutput: 100,
      createdAt: new Date(Date.now() - 4000),
    });

    const { events, callbacks } = trackingCallbacks();
    await runAgentLoop(session.id, "Next", callbacks);

    const compactionIdx = events.indexOf("compaction");
    const firstTokenIdx = events.indexOf("token");

    expect(compactionIdx).not.toBe(-1);
    expect(firstTokenIdx).not.toBe(-1);
    expect(compactionIdx).toBeLessThan(firstTokenIdx);
  });
});
