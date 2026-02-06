"use client";

import type { Message, TokenUsage } from "@repo/shared";
import { InputBar } from "./InputBar";
import { MessageList } from "./MessageList";

interface ChatWindowProps {
  messages: Message[];
  isStreaming: boolean;
  tokenUsage: TokenUsage;
  model: string;
  onSendMessage: (content: string) => void;
}

export function ChatWindow({
  messages,
  isStreaming,
  tokenUsage,
  model,
  onSendMessage,
}: ChatWindowProps) {
  return (
    <main className="flex-1 flex flex-col bg-background relative">
      <MessageList messages={messages} />
      <InputBar onSend={onSendMessage} disabled={isStreaming} usage={tokenUsage} model={model} />
    </main>
  );
}
