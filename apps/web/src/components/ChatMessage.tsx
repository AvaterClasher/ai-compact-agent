"use client";

import type { Message as SalvadorMessage } from "@repo/shared";
import { Bot, Info } from "lucide-react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

interface ChatMessageProps {
  message: SalvadorMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="py-2 animate-fade-in">
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-md bg-secondary border border-border">
          <Info className="w-3.5 h-3.5 text-dim mt-0.5 shrink-0" />
          <div className="text-[13px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
            {message.content || <span className="text-dim italic">empty</span>}
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="py-2 animate-slide-right">
        <Message from="user">
          <MessageContent>{message.content}</MessageContent>
        </Message>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="py-2 animate-slide-left">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-md bg-card border border-border flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-3 h-3 text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <Message from="assistant">
            <MessageContent>
              {message.content ? (
                <MessageResponse>{message.content}</MessageResponse>
              ) : (
                <span className="inline-block w-1.5 h-4 bg-primary animate-cursor-blink" />
              )}
            </MessageContent>
          </Message>
        </div>
      </div>
    </div>
  );
}
