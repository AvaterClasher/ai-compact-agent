"use client";

import type { Message } from "@repo/shared";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ChatMessage } from "./ChatMessage";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  return (
    <Conversation className="flex-1">
      <ConversationContent className="max-w-4xl mx-auto px-6 py-6 gap-1">
        {messages.length === 0 ? (
          <ConversationEmptyState
            title="Start a conversation"
            description="Send a message to begin chatting with the agent."
          />
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {isStreaming && (
              <div className="flex items-center gap-2.5 py-3 px-4 animate-fade-in">
                <Shimmer as="span" className="font-mono text-xs tracking-wide">
                  processing
                </Shimmer>
              </div>
            )}
          </>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
