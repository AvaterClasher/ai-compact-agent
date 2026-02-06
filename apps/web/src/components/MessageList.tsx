"use client";

import type { Message } from "@repo/shared";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ChatMessage } from "./ChatMessage";

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Conversation className="flex-1">
      <ConversationContent className="max-w-4xl mx-auto px-6 py-6 gap-1">
        {messages.length === 0 ? (
          <ConversationEmptyState
            title="Start a conversation"
            description="Send a message to begin chatting with the agent."
          />
        ) : (
          messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
