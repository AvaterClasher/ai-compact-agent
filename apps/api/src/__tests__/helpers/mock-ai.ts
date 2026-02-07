import type { TokenUsage } from "@repo/shared";

/**
 * Create a mock fullStream async iterable that yields predetermined parts.
 */
export function createMockStream(parts: Array<{ type: string; [key: string]: unknown }>) {
  async function* generate() {
    for (const part of parts) {
      yield part;
    }
  }

  return {
    fullStream: generate(),
  };
}

/**
 * Build typical AI text response parts for testing.
 */
export function buildTextResponse(text: string, usage: Partial<TokenUsage> = {}) {
  const chunks = text.match(/.{1,10}/g) || [text];
  const parts: Array<{ type: string; [key: string]: unknown }> = chunks.map((chunk) => ({
    type: "text-delta",
    text: chunk,
  }));

  parts.push({
    type: "finish",
    totalUsage: {
      inputTokens: usage.input ?? 100,
      outputTokens: usage.output ?? 50,
      inputTokenDetails: {
        cacheReadTokens: usage.cacheRead ?? 0,
        cacheWriteTokens: usage.cacheWrite ?? 0,
      },
      outputTokenDetails: {
        reasoningTokens: usage.reasoning ?? 0,
      },
    },
  });

  return parts;
}

/**
 * Build a tool call + result + text response sequence.
 */
export function buildToolCallResponse(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
  finalText = "Done.",
) {
  return [
    {
      type: "tool-call",
      toolName,
      toolCallId: "test_call_1",
      input,
    },
    {
      type: "tool-result",
      toolName,
      toolCallId: "test_call_1",
      output,
    },
    ...buildTextResponse(finalText),
  ];
}

/**
 * Build a tool-call-only response (no follow-up text).
 * Useful for simulating multi-step loops where the agent continues after tool results.
 */
export function buildToolCallOnlyResponse(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
  usage: Partial<TokenUsage> = {},
) {
  return [
    {
      type: "tool-call",
      toolName,
      toolCallId: `test_call_${toolName}`,
      input,
    },
    {
      type: "tool-result",
      toolName,
      toolCallId: `test_call_${toolName}`,
      output,
    },
    {
      type: "finish",
      totalUsage: {
        inputTokens: usage.input ?? 100,
        outputTokens: usage.output ?? 50,
        inputTokenDetails: {
          cacheReadTokens: usage.cacheRead ?? 0,
          cacheWriteTokens: usage.cacheWrite ?? 0,
        },
        outputTokenDetails: {
          reasoningTokens: usage.reasoning ?? 0,
        },
      },
    },
  ];
}
