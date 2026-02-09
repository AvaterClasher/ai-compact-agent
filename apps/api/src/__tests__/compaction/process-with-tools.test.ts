import { beforeEach, describe, expect, mock, test } from "bun:test";
import { compactions } from "@repo/shared";
import { eq } from "drizzle-orm";
import { insertMessage, insertMessagePart, insertSession } from "../helpers/factories.js";
import { createTestDB, type TestDB } from "../helpers/test-db.js";

// Capture the prompt passed to generateText
let capturedPrompt = "";
mock.module("ai", () => ({
  generateText: async (opts: { prompt: string }) => {
    capturedPrompt = opts.prompt;
    return { text: "Summary with tool context." };
  },
}));

mock.module("@ai-sdk/anthropic", () => ({
  anthropic: () => ({}),
}));

const { processCompaction } = await import("../../compaction/index.js");

describe("processCompaction with tool context", () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDB();
    capturedPrompt = "";
  });

  test("includes tool-call annotations in summarization prompt", async () => {
    const session = await insertSession(db);
    const assistantMsg = await insertMessage(db, session.id, {
      role: "assistant",
      content: "Let me read the file.",
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "tool-call",
      toolName: "readFile",
      toolCallId: "call_1",
      content: JSON.stringify({ path: "/src/index.ts" }),
      tokenEstimate: 10,
    });

    await processCompaction(db, session.id);

    expect(capturedPrompt).toContain("[Tool Call: readFile]");
    expect(capturedPrompt).toContain("/src/index.ts");
  });

  test("includes tool-result annotations in summarization prompt", async () => {
    const session = await insertSession(db);
    const assistantMsg = await insertMessage(db, session.id, {
      role: "assistant",
      content: "Here is the file content.",
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "tool-call",
      toolName: "readFile",
      toolCallId: "call_1",
      content: JSON.stringify({ path: "/src/index.ts" }),
      tokenEstimate: 10,
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "tool-result",
      toolName: "readFile",
      toolCallId: "call_1",
      content: JSON.stringify({ content: "export default function main() {}" }),
      tokenEstimate: 15,
    });

    await processCompaction(db, session.id);

    expect(capturedPrompt).toContain("[Tool Result: readFile]");
    expect(capturedPrompt).toContain("export default function main()");
  });

  test("includes pruned placeholder content in summarization prompt", async () => {
    const session = await insertSession(db);
    const assistantMsg = await insertMessage(db, session.id, {
      role: "assistant",
      content: "Read the file.",
    });
    await insertMessagePart(db, assistantMsg.id, {
      type: "tool-result",
      toolName: "readFile",
      toolCallId: "call_1",
      content: JSON.stringify("[content pruned to save context]"),
      tokenEstimate: 5,
      pruned: true,
    });

    await processCompaction(db, session.id);

    expect(capturedPrompt).toContain("[content pruned to save context]");
  });

  test("tokensBefore includes both message tokens and part tokens", async () => {
    const session = await insertSession(db);
    const msg = await insertMessage(db, session.id, {
      content: "x".repeat(400), // estimateTokens = 100
    });
    await insertMessagePart(db, msg.id, {
      type: "tool-result",
      toolName: "shell",
      toolCallId: "call_1",
      content: "y".repeat(200), // tokenEstimate = 80 below, but content length / 4 = 50
      tokenEstimate: 80,
    });

    await processCompaction(db, session.id);

    const [record] = db
      .select()
      .from(compactions)
      .where(eq(compactions.sessionId, session.id))
      .all();

    // tokensBefore = estimateTokens("x" * 400) + part.tokenEstimate
    // = 100 + 80 = 180
    expect(record.tokensBefore).toBe(180);
  });

  test("prefers tokenEstimate over estimateTokens fallback for parts", async () => {
    const session = await insertSession(db);
    const msg = await insertMessage(db, session.id, {
      content: "Hello",
    });

    // Part with explicit tokenEstimate — should use this value, not content length / 4
    await insertMessagePart(db, msg.id, {
      type: "tool-result",
      toolName: "readFile",
      toolCallId: "call_1",
      content: "a".repeat(100), // content-based would be 25
      tokenEstimate: 999,
    });

    // Part with tokenEstimate = 0 — should fall back to estimateTokens
    await insertMessagePart(db, msg.id, {
      type: "tool-call",
      toolName: "readFile",
      toolCallId: "call_1",
      content: "b".repeat(40), // content-based = 10
      tokenEstimate: 0,
    });

    await processCompaction(db, session.id);

    const [record] = db
      .select()
      .from(compactions)
      .where(eq(compactions.sessionId, session.id))
      .all();

    // messageTokens = estimateTokens("Hello") = ceil(5/4) = 2
    // partTokens = 999 (preferred) + 10 (fallback since tokenEstimate=0) = 1009
    // total = 2 + 1009 = 1011
    expect(record.tokensBefore).toBe(1011);
  });
});
