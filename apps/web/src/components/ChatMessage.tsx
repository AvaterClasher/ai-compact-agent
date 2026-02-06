"use client";

import type { Message as SalvadorMessage } from "@repo/shared";
import { CopyIcon } from "lucide-react";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";

interface ChatMessageProps {
  message: SalvadorMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="py-1.5">
        <Message from="system">
          <MessageContent>
            <div className="text-xs text-muted-foreground italic">{message.content}</div>
          </MessageContent>
        </Message>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="py-3">
        <Message from="user">
          <MessageContent>
            <div className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
              {message.content}
            </div>
          </MessageContent>
        </Message>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="py-3">
      <Message from="assistant">
        <MessageContent>
          {message.content ? (
            <MessageResponse>{message.content}</MessageResponse>
          ) : (
            <Shimmer as="span" className="text-sm">
              Thinking...
            </Shimmer>
          )}
        </MessageContent>
        {message.content && (
          <MessageActions>
            <MessageAction
              tooltip="Copy"
              label="Copy message"
              onClick={() => navigator.clipboard.writeText(message.content)}
            >
              <CopyIcon className="size-3" />
            </MessageAction>
          </MessageActions>
        )}
      </Message>
    </div>
  );
}
