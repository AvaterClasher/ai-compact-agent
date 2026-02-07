import { compactions, messageParts, messages, sessions } from "@repo/shared";
import { nanoid } from "nanoid";
import type { TestDB } from "./test-db.js";

// -- Raw data builders (no DB insert) --

export function buildSession(overrides: Partial<typeof sessions.$inferInsert> = {}) {
  return {
    id: nanoid(),
    title: "Test Session",
    model: "claude-sonnet-4-20250514",
    status: "active" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function buildMessage(
  sessionId: string,
  overrides: Partial<typeof messages.$inferInsert> = {},
) {
  return {
    id: nanoid(),
    sessionId,
    role: "user" as const,
    content: "Hello, world!",
    tokensInput: 0,
    tokensOutput: 0,
    tokensReasoning: 0,
    tokensCacheRead: 0,
    tokensCacheWrite: 0,
    cost: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

export function buildMessagePart(
  messageId: string,
  overrides: Partial<typeof messageParts.$inferInsert> = {},
) {
  return {
    id: nanoid(),
    messageId,
    type: "text" as const,
    toolName: null,
    toolCallId: null,
    content: "Some content",
    tokenEstimate: 3,
    pruned: false,
    createdAt: new Date(),
    ...overrides,
  };
}

// -- DB-inserting helpers --

export async function insertSession(
  db: TestDB,
  overrides: Partial<typeof sessions.$inferInsert> = {},
) {
  const data = buildSession(overrides);
  db.insert(sessions).values(data).run();
  return data;
}

export async function insertMessage(
  db: TestDB,
  sessionId: string,
  overrides: Partial<typeof messages.$inferInsert> = {},
) {
  const data = buildMessage(sessionId, overrides);
  db.insert(messages).values(data).run();
  return data;
}

export async function insertMessagePart(
  db: TestDB,
  messageId: string,
  overrides: Partial<typeof messageParts.$inferInsert> = {},
) {
  const data = buildMessagePart(messageId, overrides);
  db.insert(messageParts).values(data).run();
  return data;
}

export async function insertCompaction(
  db: TestDB,
  sessionId: string,
  overrides: Partial<typeof compactions.$inferInsert> = {},
) {
  const data = {
    id: nanoid(),
    sessionId,
    summary: "Test summary",
    tokensBefore: 100,
    tokensAfter: 50,
    messageCountBefore: 5,
    auto: true,
    createdAt: new Date(),
    ...overrides,
  };
  db.insert(compactions).values(data).run();
  return data;
}

/**
 * Seed a complete conversation with N user/assistant turns,
 * each with tool-call and tool-result parts.
 */
export async function seedConversation(
  db: TestDB,
  opts: { turns?: number; contentSize?: number } = {},
) {
  const { turns = 3, contentSize = 100 } = opts;
  const session = await insertSession(db);
  const allMessages = [];

  for (let i = 0; i < turns; i++) {
    const content = "x".repeat(contentSize);
    const userMsg = await insertMessage(db, session.id, {
      role: "user",
      content,
      createdAt: new Date(Date.now() - (turns - i) * 2000),
    });
    await insertMessagePart(db, userMsg.id, {
      type: "text",
      content,
      tokenEstimate: Math.ceil(contentSize / 4),
      createdAt: new Date(Date.now() - (turns - i) * 2000),
    });

    const assistantMsg = await insertMessage(db, session.id, {
      role: "assistant",
      content: `Response ${i}`,
      createdAt: new Date(Date.now() - (turns - i) * 2000 + 1000),
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "tool-call",
      toolName: "readFile",
      toolCallId: `call_${i}`,
      content: JSON.stringify({ path: `/tmp/file_${i}.ts` }),
      tokenEstimate: 20,
      createdAt: new Date(Date.now() - (turns - i) * 2000 + 500),
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "tool-result",
      toolName: "readFile",
      toolCallId: `call_${i}`,
      content: JSON.stringify({ content: "x".repeat(contentSize) }),
      tokenEstimate: Math.ceil(contentSize / 4),
      createdAt: new Date(Date.now() - (turns - i) * 2000 + 600),
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "text",
      content: `Response ${i}`,
      tokenEstimate: Math.ceil(`Response ${i}`.length / 4),
      createdAt: new Date(Date.now() - (turns - i) * 2000 + 700),
    });

    allMessages.push(userMsg, assistantMsg);
  }

  return { session, messages: allMessages };
}

/**
 * Seed a conversation like seedConversation but sets realistic
 * tokensInput/tokensOutput on assistant messages.
 * Needed for pre-send overflow tests that read stored usage.
 */
export async function seedConversationWithUsage(
  db: TestDB,
  opts: {
    turns?: number;
    contentSize?: number;
    tokensInput?: number;
    tokensOutput?: number;
  } = {},
) {
  const { turns = 3, contentSize = 100, tokensInput = 1000, tokensOutput = 200 } = opts;
  const session = await insertSession(db);
  const allMessages = [];

  for (let i = 0; i < turns; i++) {
    const content = "x".repeat(contentSize);
    const userMsg = await insertMessage(db, session.id, {
      role: "user",
      content,
      createdAt: new Date(Date.now() - (turns - i) * 2000),
    });
    await insertMessagePart(db, userMsg.id, {
      type: "text",
      content,
      tokenEstimate: Math.ceil(contentSize / 4),
      createdAt: new Date(Date.now() - (turns - i) * 2000),
    });

    const assistantMsg = await insertMessage(db, session.id, {
      role: "assistant",
      content: `Response ${i}`,
      tokensInput,
      tokensOutput,
      createdAt: new Date(Date.now() - (turns - i) * 2000 + 1000),
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "tool-call",
      toolName: "readFile",
      toolCallId: `call_${i}`,
      content: JSON.stringify({ path: `/tmp/file_${i}.ts` }),
      tokenEstimate: 20,
      createdAt: new Date(Date.now() - (turns - i) * 2000 + 500),
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "tool-result",
      toolName: "readFile",
      toolCallId: `call_${i}`,
      content: JSON.stringify({ content: "x".repeat(contentSize) }),
      tokenEstimate: Math.ceil(contentSize / 4),
      createdAt: new Date(Date.now() - (turns - i) * 2000 + 600),
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "text",
      content: `Response ${i}`,
      tokenEstimate: Math.ceil(`Response ${i}`.length / 4),
      createdAt: new Date(Date.now() - (turns - i) * 2000 + 700),
    });

    allMessages.push(userMsg, assistantMsg);
  }

  return { session, messages: allMessages };
}
