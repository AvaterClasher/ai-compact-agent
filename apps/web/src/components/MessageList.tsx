"use client";

import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import type { StreamingMeta } from "@/hooks/useChat";
import { ChatMessage } from "./ChatMessage";

interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingMeta: StreamingMeta;
}

export function MessageList({ messages, isLoading, isStreaming, streamingMeta }: MessageListProps) {
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === "assistant");

  return (
    <Conversation className="flex-1">
      <ConversationContent className="max-w-4xl mx-auto px-6 py-6 gap-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <ConversationEmptyState
            title="Start a conversation"
            description="Send a message to begin chatting with the agent."
          />
        ) : (
          messages.map((msg, i) => {
            const isLastAssistant = i === lastAssistantIndex;

            return (
              <div key={msg.id}>
                <ChatMessage
                  message={msg}
                  isStreaming={isLastAssistant && isStreaming ? true : undefined}
                  streamingMeta={isLastAssistant && isStreaming ? streamingMeta : undefined}
                />
              </div>
            );
          })
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
