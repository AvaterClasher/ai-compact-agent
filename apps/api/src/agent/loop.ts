import type { TokenUsage } from "@repo/shared";
import {
  DEFAULT_CONTEXT_WINDOW,
  MAX_STEPS,
  MODEL_CONTEXT_WINDOWS,
  messageParts,
  messages,
  OUTPUT_TOKEN_MAX,
} from "@repo/shared";
import { streamText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { estimateTokens, isOverflow, processCompaction, prune } from "../compaction/index.js";
import { db } from "../db/client.js";
import { getDefaultModel, resolveModel } from "./model.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { agentTools } from "./tools/index.js";

interface StreamCallbacks {
  onToken: (delta: string) => void | Promise<void>;
  onToolCall: (toolCallId: string, toolName: string, input: unknown) => void | Promise<void>;
  onToolResult: (
    toolCallId: string,
    toolName: string,
    output: unknown,
    isError?: boolean,
  ) => void | Promise<void>;
  onReasoningDelta: (delta: string) => void | Promise<void>;
  onStepFinish: (usage: TokenUsage, toolResults?: unknown[]) => void | Promise<void>;
  onCompaction: () => void | Promise<void>;
  onDone: (messageId: string, usage: TokenUsage) => void | Promise<void>;
  onError: (error: Error) => void | Promise<void>;
}

type AssistantContentPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown };

type ToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: unknown;
};

type ConversationMessage =
  | { role: "user" | "system"; content: string }
  | { role: "assistant"; content: string | AssistantContentPart[] }
  | { role: "tool"; content: ToolResultPart[] };

async function loadConversation(sessionId: string): Promise<ConversationMessage[]> {
  const dbMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(messages.createdAt);

  const result: ConversationMessage[] = [];

  for (const msg of dbMessages) {
    if (msg.role === "user" || msg.role === "system") {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      // Fetch message parts to reconstruct structured content
      const parts = await db
        .select()
        .from(messageParts)
        .where(and(eq(messageParts.messageId, msg.id)))
        .orderBy(messageParts.createdAt);

      const toolCallParts = parts.filter((p) => p.type === "tool-call");
      const toolResultParts = parts.filter((p) => p.type === "tool-result");

      if (toolCallParts.length > 0) {
        // Build structured assistant content with text + tool calls
        const textParts = parts.filter((p) => p.type === "text");
        const assistantContent: AssistantContentPart[] = [
          ...textParts.map((p) => ({ type: "text" as const, text: p.content })),
          ...toolCallParts.map((p) => ({
            type: "tool-call" as const,
            toolCallId: p.toolCallId!,
            toolName: p.toolName!,
            input: JSON.parse(p.content),
          })),
        ];
        result.push({ role: "assistant", content: assistantContent });

        // Emit a following tool message with tool results
        if (toolResultParts.length > 0) {
          result.push({
            role: "tool",
            content: toolResultParts.map((p) => ({
              type: "tool-result" as const,
              toolCallId: p.toolCallId!,
              toolName: p.toolName!,
              output: JSON.parse(p.content),
            })),
          });
        }
      } else {
        // Plain text assistant message
        result.push({ role: "assistant", content: msg.content });
      }
    }
  }

  return result;
}

export async function runAgentLoop(
  sessionId: string,
  userContent: string,
  callbacks: StreamCallbacks,
  model = getDefaultModel(),
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

  // 3. Load initial conversation from DB
  let conversationMessages = await loadConversation(sessionId);

  // 3b. Pre-send overflow check — compact before first streamText if already over limit
  const contextWindow = MODEL_CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
  const lastAssistant = await db
    .select()
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.role, "assistant")))
    .orderBy(desc(messages.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (lastAssistant?.tokensInput) {
    // Primary: project from last assistant's stored input usage + new user tokens
    const projectedInput = lastAssistant.tokensInput + estimateTokens(userContent);
    const projectedUsage: TokenUsage = {
      input: projectedInput,
      output: lastAssistant.tokensOutput ?? 0,
      reasoning: 0,
      cacheRead: lastAssistant.tokensCacheRead ?? 0,
      cacheWrite: 0,
    };
    if (isOverflow(projectedUsage, model)) {
      console.log(`Pre-send overflow detected for session ${sessionId}, compacting...`);
      await processCompaction(db, sessionId, model);
      await callbacks.onCompaction();
      conversationMessages = await loadConversation(sessionId);
    }
  } else if (conversationMessages.length > 0) {
    // Fallback: estimate from all conversation message content
    let estimatedTokenTotal = 0;
    for (const msg of conversationMessages) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      estimatedTokenTotal += estimateTokens(content);
    }
    if (estimatedTokenTotal > contextWindow - OUTPUT_TOKEN_MAX) {
      console.log(`Pre-send overflow (estimated) for session ${sessionId}, compacting...`);
      await processCompaction(db, sessionId, model);
      await callbacks.onCompaction();
      conversationMessages = await loadConversation(sessionId);
    }
  }

  // 4. Manual step loop with mid-turn compaction
  let assistantMessageId = nanoid();
  let fullContent = "";
  let assistantMessageSaved = false;
  const totalUsage: TokenUsage = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      // Stream one step
      let stepContent = "";
      let stepHasToolCalls = false;
      const stepToolCalls: { toolCallId: string; toolName: string; args: unknown }[] = [];
      const stepToolResults: { toolCallId: string; toolName: string; result: unknown }[] = [];
      const stepUsage: TokenUsage = {
        input: 0,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      };

      const result = streamText({
        model: resolveModel(model),
        system: SYSTEM_PROMPT,
        // biome-ignore lint/suspicious/noExplicitAny: manual conversation messages match SDK runtime format
        messages: conversationMessages as any,
        tools: agentTools,
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta":
            stepContent += part.text;
            fullContent += part.text;
            callbacks.onToken(part.text);
            break;

          case "tool-call": {
            stepHasToolCalls = true;
            stepToolCalls.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
            });
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
            await callbacks.onToolCall(part.toolCallId, part.toolName, part.input);
            break;
          }

          case "tool-result": {
            stepToolResults.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.output,
            });
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
            await callbacks.onToolResult(part.toolCallId, part.toolName, part.output);
            break;
          }

          case "reasoning-delta": {
            if (part.text) {
              await callbacks.onReasoningDelta(part.text);
            }
            break;
          }

          case "finish": {
            if (part.totalUsage) {
              stepUsage.input = part.totalUsage.inputTokens ?? 0;
              stepUsage.output = part.totalUsage.outputTokens ?? 0;
              stepUsage.cacheRead = part.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0;
              stepUsage.cacheWrite = part.totalUsage.inputTokenDetails?.cacheWriteTokens ?? 0;
              stepUsage.reasoning = part.totalUsage.outputTokenDetails?.reasoningTokens ?? 0;
            }
            break;
          }
        }
      }

      // Update cumulative usage (input/cacheRead reflect the latest step's full context view)
      totalUsage.input = stepUsage.input;
      totalUsage.output += stepUsage.output;
      totalUsage.cacheRead = stepUsage.cacheRead;
      totalUsage.cacheWrite = stepUsage.cacheWrite;
      totalUsage.reasoning += stepUsage.reasoning;

      // Notify client of step usage
      await callbacks.onStepFinish(
        totalUsage,
        stepToolResults.map((tr) => tr.result),
      );

      // Update in-memory conversation for next step
      if (stepHasToolCalls) {
        const assistantContent: AssistantContentPart[] = [
          ...(stepContent ? [{ type: "text" as const, text: stepContent }] : []),
          ...stepToolCalls.map((tc) => ({
            type: "tool-call" as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.args,
          })),
        ];
        conversationMessages.push({ role: "assistant" as const, content: assistantContent });
        conversationMessages.push({
          role: "tool" as const,
          content: stepToolResults.map((tr) => ({
            type: "tool-result" as const,
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            output: tr.result,
          })),
        });
      } else {
        conversationMessages.push({ role: "assistant" as const, content: stepContent });
      }

      // Save/update assistant message in DB (so compaction can see it)
      if (!assistantMessageSaved) {
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
        assistantMessageSaved = true;
      } else {
        await db
          .update(messages)
          .set({
            content: fullContent,
            tokensInput: totalUsage.input,
            tokensOutput: totalUsage.output,
            tokensReasoning: totalUsage.reasoning,
            tokensCacheRead: totalUsage.cacheRead,
            tokensCacheWrite: totalUsage.cacheWrite,
          })
          .where(eq(messages.id, assistantMessageId));
      }

      // Check for mid-turn overflow → compact before next step
      if (isOverflow(totalUsage, model)) {
        console.log(`Mid-turn overflow at step ${step + 1}, compacting session ${sessionId}...`);
        await processCompaction(db, sessionId, model);
        await callbacks.onCompaction();

        // Reload conversation from DB (now just the summary)
        conversationMessages = await loadConversation(sessionId);

        // Reset assistant state for post-compaction steps
        assistantMessageId = nanoid();
        fullContent = "";
        assistantMessageSaved = false;

        // If no tool calls, agent was done — break even after compaction
        if (!stepHasToolCalls) break;
        continue;
      }

      // If no tool calls, agent produced a final text response — done
      if (!stepHasToolCalls) break;
    }

    // Save final text part (if not already handled by compaction reset)
    if (fullContent && assistantMessageSaved) {
      await db.insert(messageParts).values({
        id: nanoid(),
        messageId: assistantMessageId,
        type: "text",
        content: fullContent,
        tokenEstimate: estimateTokens(fullContent),
        createdAt: new Date(),
      });
    }

    await callbacks.onDone(assistantMessageId, totalUsage);
  } catch (error) {
    await callbacks.onError(error as Error);
  }
}
