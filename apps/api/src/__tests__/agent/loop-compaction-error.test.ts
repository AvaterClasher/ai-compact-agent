import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DEFAULT_CONTEXT_WINDOW, OUTPUT_TOKEN_MAX, sessions } from "@repo/shared";
import { eq } from "drizzle-orm";
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
    return createMockStream(buildTextResponse("Response"));
  },
  generateText: async () => {
    throw new Error("LLM API rate limit exceeded");
  },
}));

const { runAgentLoop } = await import("../../agent/loop.js");

function trackingCallbacks() {
  const events: string[] = [];
  let errorMessage = "";
  return {
    events,
    getErrorMessage: () => errorMessage,
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
        events.push("compaction");
      },
      onDone: () => {
        events.push("done");
      },
      onError: (error: Error) => {
        errorMessage = error.message;
        events.push("error");
      },
    },
  };
}

describe("loop compaction error handling", () => {
  beforeEach(() => {
    testDb = createTestDB();
  });

  test("generateText failure during pre-send compaction → onError fires", async () => {
    const threshold = DEFAULT_CONTEXT_WINDOW - OUTPUT_TOKEN_MAX;
    const session = await insertSession(testDb);

    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Setup",
      createdAt: new Date(Date.now() - 5000),
    });
    await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Answer",
      tokensInput: threshold + 5000,
      tokensOutput: 100,
      createdAt: new Date(Date.now() - 4000),
    });

    const { events, callbacks, getErrorMessage } = trackingCallbacks();
    await runAgentLoop(session.id, "Next question", callbacks);

    expect(events).toContain("error");
    expect(getErrorMessage()).toContain("rate limit");
  });

  test("session status restored to active after compaction error", async () => {
    const threshold = DEFAULT_CONTEXT_WINDOW - OUTPUT_TOKEN_MAX;
    const session = await insertSession(testDb);

    await insertMessage(testDb, session.id, {
      role: "user",
      content: "Setup",
      createdAt: new Date(Date.now() - 5000),
    });
    await insertMessage(testDb, session.id, {
      role: "assistant",
      content: "Answer",
      tokensInput: threshold + 5000,
      tokensOutput: 100,
      createdAt: new Date(Date.now() - 4000),
    });

    const { callbacks } = trackingCallbacks();
    await runAgentLoop(session.id, "Next question", callbacks);

    const [sessionRow] = testDb.select().from(sessions).where(eq(sessions.id, session.id)).all();

    expect(sessionRow.status).toBe("active");
  });
});
