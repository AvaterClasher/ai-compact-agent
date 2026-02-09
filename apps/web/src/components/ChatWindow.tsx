"use client";

import type { TokenUsage } from "@repo/shared";
import type { UIMessage } from "ai";
import type { StreamingMeta } from "@/hooks/useChat";
import { InputBar } from "./InputBar";
import { MessageList } from "./MessageList";

interface ChatWindowProps {
  messages: UIMessage[];
  isStreaming: boolean;
  isLoading: boolean;
  tokenUsage: TokenUsage;
  streamingMeta: StreamingMeta;
  model: string;
  onSendMessage: (content: string) => void;
}

export function ChatWindow({
  messages,
  isStreaming,
  isLoading,
  tokenUsage,
  streamingMeta,
  model,
  onSendMessage,
}: ChatWindowProps) {
  return (
    <main className="flex-1 flex flex-col bg-background relative">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        isStreaming={isStreaming}
        streamingMeta={streamingMeta}
      />
      <InputBar onSend={onSendMessage} disabled={isStreaming} usage={tokenUsage} model={model} />
    </main>
  );
}
