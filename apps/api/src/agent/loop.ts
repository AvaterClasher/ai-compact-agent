import type { TokenUsage } from "@repo/shared";
import { DEFAULT_MODEL, MAX_STEPS, messageParts, messages } from "@repo/shared";
import { stepCountIs, streamText } from "ai";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { estimateTokens, isOverflow, processCompaction, prune } from "../compaction/index.js";
import { db } from "../db/client.js";
import { resolveModel } from "./model.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { agentTools } from "./tools/index.js";

interface StreamCallbacks {
  onToken: (delta: string) => void;
  onStepFinish: (usage: TokenUsage, toolResults?: unknown[]) => void;
  onDone: (messageId: string, usage: TokenUsage) => void;
  onError: (error: Error) => void;
}

export async function runAgentLoop(
  sessionId: string,
  userContent: string,
  callbacks: StreamCallbacks,
  model = DEFAULT_MODEL,
) {
  // 1. Run prune before processing
  const prunedTokens = await prune(db, sessionId);
  if (prunedTokens > 0) {
    console.log(`Pruned ${prunedTokens} tokens from session ${sessionId}`);
  }

  // 2. Save user message to DB
  const userMessageId = nanoid();
  await db.insert(messages).values({
    id: userMessageId,
    sessionId,
    role: "user",
    content: userContent,
    createdAt: new Date(),
  });

  await db.insert(messageParts).values({
    id: nanoid(),
    messageId: userMessageId,
    type: "text",
    content: userContent,
    tokenEstimate: estimateTokens(userContent),
    createdAt: new Date(),
  });

  // 3. Load message history from DB
  const dbMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(messages.createdAt);

  const coreMessages = dbMessages.map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
  }));

  // 4. Stream response
  const assistantMessageId = nanoid();
  let fullContent = "";
  const totalUsage: TokenUsage = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };

  try {
    const result = streamText({
      model: resolveModel(model),
      system: SYSTEM_PROMPT,
      messages: coreMessages,
      tools: agentTools,
      stopWhen: stepCountIs(MAX_STEPS),
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          fullContent += part.text;
          callbacks.onToken(part.text);
          break;

        case "tool-call": {
          // Save tool call as message part
          const inputStr = JSON.stringify(part.input);
          await db.insert(messageParts).values({
            id: nanoid(),
            messageId: assistantMessageId,
            type: "tool-call",
            toolName: part.toolName,
            toolCallId: part.toolCallId,
            content: inputStr,
            tokenEstimate: estimateTokens(inputStr),
            createdAt: new Date(),
          });
          break;
        }

        case "tool-result": {
          // Save tool result as message part
          const resultContent = JSON.stringify(part.output);
          await db.insert(messageParts).values({
            id: nanoid(),
            messageId: assistantMessageId,
            type: "tool-result",
            toolName: part.toolName,
            toolCallId: part.toolCallId,
            content: resultContent,
            tokenEstimate: estimateTokens(resultContent),
            createdAt: new Date(),
          });

          callbacks.onStepFinish(totalUsage, [part.output]);
          break;
        }

        case "finish": {
          if (part.totalUsage) {
            totalUsage.input = part.totalUsage.inputTokens ?? 0;
            totalUsage.output = part.totalUsage.outputTokens ?? 0;
            totalUsage.cacheRead = part.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0;
            totalUsage.cacheWrite = part.totalUsage.inputTokenDetails?.cacheWriteTokens ?? 0;
            totalUsage.reasoning = part.totalUsage.outputTokenDetails?.reasoningTokens ?? 0;
          }
          break;
        }
      }
    }

    // 5. Save assistant message to DB
    await db.insert(messages).values({
      id: assistantMessageId,
      sessionId,
      role: "assistant",
      content: fullContent,
      tokensInput: totalUsage.input,
      tokensOutput: totalUsage.output,
      tokensReasoning: totalUsage.reasoning,
      tokensCacheRead: totalUsage.cacheRead,
      tokensCacheWrite: totalUsage.cacheWrite,
      cost: 0,
      createdAt: new Date(),
    });

    // Save text part
    if (fullContent) {
      await db.insert(messageParts).values({
        id: nanoid(),
        messageId: assistantMessageId,
        type: "text",
        content: fullContent,
        tokenEstimate: estimateTokens(fullContent),
        createdAt: new Date(),
      });
    }

    callbacks.onDone(assistantMessageId, totalUsage);

    // 6. Check for overflow after response
    if (isOverflow(totalUsage)) {
      console.log(`Context overflow detected for session ${sessionId}, compacting...`);
      await processCompaction(db, sessionId, model);
    }
  } catch (error) {
    callbacks.onError(error as Error);
  }
}
