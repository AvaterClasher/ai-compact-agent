export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessagePartType = "text" | "tool-call" | "tool-result" | "reasoning" | "compaction";

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  cost: number;
  createdAt: number;
  parts?: MessagePart[];
}

export interface MessagePart {
  id: string;
  messageId: string;
  type: MessagePartType;
  toolName: string | null;
  toolCallId: string | null;
  content: string;
  tokenEstimate: number;
  pruned: boolean;
  createdAt: number;
}

export interface SendMessageInput {
  content: string;
}
