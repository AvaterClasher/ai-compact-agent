export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Compaction {
  id: string;
  sessionId: string;
  summary: string;
  tokensBefore: number;
  tokensAfter: number;
  messageCountBefore: number;
  auto: boolean;
  createdAt: number;
}

export type SSEEvent =
  | { type: "token"; data: { delta: string } }
  | { type: "tool-call"; data: { toolCallId: string; toolName: string; input: unknown } }
  | {
      type: "tool-result";
      data: { toolCallId: string; toolName: string; output: unknown; isError?: boolean };
    }
  | { type: "reasoning-delta"; data: { delta: string } }
  | { type: "step-finish"; data: { usage: TokenUsage; toolResults?: unknown[] } }
  | { type: "done"; data: { messageId: string; usage: TokenUsage } }
  | { type: "error"; data: { message: string } };
