"use client";

import type { Message, TokenUsage } from "@repo/shared";
import { InputBar } from "./InputBar";
import { MessageList } from "./MessageList";
import { StatusIndicator } from "./StatusIndicator";

interface ChatWindowProps {
  messages: Message[];
  isStreaming: boolean;
  tokenUsage: TokenUsage;
  onSendMessage: (content: string) => void;
}

export function ChatWindow({ messages, isStreaming, tokenUsage, onSendMessage }: ChatWindowProps) {
  return (
    <main className="flex-1 flex flex-col">
      <StatusIndicator usage={tokenUsage} isStreaming={isStreaming} />
      <MessageList messages={messages} isStreaming={isStreaming} />
      <InputBar onSend={onSendMessage} disabled={isStreaming} />
    </main>
  );
}
