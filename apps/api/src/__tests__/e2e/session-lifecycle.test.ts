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

// Mock agent loop to simulate realistic behavior: save messages to DB + stream events
mock.module("../../agent/loop.js", () => ({
  runAgentLoop: async (
    sessionId: string,
    content: string,
    callbacks: {
      onToken: (delta: string) => Promise<void>;
      onStepFinish: (usage: unknown, toolResults?: unknown[]) => Promise<void>;
      onDone: (messageId: string, usage: unknown) => Promise<void>;
      onError: (error: Error) => Promise<void>;
    },
  ) => {
    // Save user message (like real loop does)
    const userMsgId = nanoid();
    testDb
      .insert(messages)
      .values({
        id: userMsgId,
        sessionId,
        role: "user",
        content,
        createdAt: new Date(),
      })
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

    // Stream tokens
    await callbacks.onToken("I can ");
    await callbacks.onToken("help with that.");

    // Save assistant message
    const assistantMsgId = nanoid();
    testDb
      .insert(messages)
      .values({
        id: assistantMsgId,
        sessionId,
        role: "assistant",
        content: "I can help with that.",
        tokensInput: 150,
        tokensOutput: 30,
        createdAt: new Date(),
      })
      .run();
    testDb
      .insert(messageParts)
      .values({
        id: nanoid(),
        messageId: assistantMsgId,
        type: "text",
        content: "I can help with that.",
        tokenEstimate: 6,
        createdAt: new Date(),
      })
      .run();

    await callbacks.onDone(assistantMsgId, {
      input: 150,
      output: 30,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  },
}));

const { default: appModule } = await import("../../index.js");
const app = {
  request: async (path: string, init?: RequestInit) =>
    appModule.fetch(new Request(`http://localhost${path}`, init), {}),
};

describe("E2E: session lifecycle", () => {
  beforeEach(() => {
    testDb = createTestDB();
  });

  test("create session -> send message -> stream response -> verify DB -> delete", async () => {
    // Step 1: Create session
    const createRes = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "E2E Test" }),
    });
    expect(createRes.status).toBe(201);
    const session = await createRes.json();
    expect(session.id).toBeTruthy();
    expect(session.title).toBe("E2E Test");

    // Step 2: Send message via stream endpoint
    const streamRes = await app.request(`/api/stream/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Help me write a function" }),
    });
    expect(streamRes.status).toBe(200);

    // Consume the stream
    const streamBody = await streamRes.text();
    expect(streamBody).toContain("event: token");
    expect(streamBody).toContain("event: done");

    // Step 3: Verify messages were persisted
    const messagesRes = await app.request(`/api/messages/${session.id}`);
    const messageList = (await messagesRes.json()) as Array<{
      role: string;
      content: string;
      parts: Array<{ type: string }>;
    }>;

    expect(messageList.length).toBe(2);

    const userMsg = messageList.find((m) => m.role === "user");
    expect(userMsg).toBeTruthy();
    expect(userMsg?.content).toBe("Help me write a function");

    const assistantMsg = messageList.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeTruthy();
    expect(assistantMsg?.content).toContain("help with that");

    // Step 4: Verify session still active
    const sessionRes = await app.request(`/api/sessions/${session.id}`);
    const updatedSession = await sessionRes.json();
    expect(updatedSession.status).toBe("active");

    // Step 5: Delete session and verify cascade
    const deleteRes = await app.request(`/api/sessions/${session.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    // Messages should be gone
    const afterDelete = await app.request(`/api/messages/${session.id}`);
    const afterDeleteMsgs = await afterDelete.json();
    expect(afterDeleteMsgs).toHaveLength(0);

    // Session should be gone
    const sessionGone = await app.request(`/api/sessions/${session.id}`);
    expect(sessionGone.status).toBe(404);
  });

  test("health check returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
