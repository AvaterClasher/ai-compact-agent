"use client";

import type { Message } from "@repo/shared";
import { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastContent = messages[messages.length - 1]?.content;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastContent]);

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-muted-foreground text-sm">Start a conversation</p>
        </div>
      )}

      {messages.length > 0 && (
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-1">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {isStreaming && (
            <div className="flex items-center gap-2.5 py-3 px-4 text-muted-foreground animate-fade-in">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse-dot" />
                <span
                  className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse-dot"
                  style={{ animationDelay: "0.2s" }}
                />
                <span
                  className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse-dot"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
              <span className="font-mono text-xs text-muted-foreground tracking-wide">
                processing
              </span>
            </div>
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
