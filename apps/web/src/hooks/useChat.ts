"use client";

import { useChat as useAIChat } from "@ai-sdk/react";
import type { TokenUsage } from "@repo/shared";
import { dbMessagesToUIMessages } from "@repo/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { createSessionTransport } from "@/lib/chat-transport";

export interface StreamingMeta {
  reasoningIsStreaming: boolean;
}

export function useChat(sessionId: string, onFirstMessage?: () => void) {
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const messageCountRef = useRef(0);
  const onFirstMessageRef = useRef(onFirstMessage);
  onFirstMessageRef.current = onFirstMessage;

  const transport = useMemo(() => createSessionTransport(sessionId), [sessionId]);

  const {
    messages,
    sendMessage: aiSendMessage,
    setMessages,
    status,
  } = useAIChat({
    id: sessionId,
    transport,
    onData: (dataPart) => {
      const part = dataPart as { type: string; data: unknown };
      if (part.type === "data-token-usage") {
        setTokenUsage(part.data as TokenUsage);
      }
      if (part.type === "data-done") {
        const { usage, messageId: _messageId } = part.data as {
          messageId: string;
          usage: TokenUsage;
        };
        setTokenUsage(usage);
        // Trigger title generation on first message
        if (messageCountRef.current === 1) {
          const firstUserMsg = messages.find((m) => m.role === "user");
          const textPart = firstUserMsg?.parts.find((p) => p.type === "text") as
            | { type: "text"; text: string }
            | undefined;
          if (textPart) {
            api.generateTitle(sessionId, textPart.text).catch(console.error);
          }
          setTimeout(() => onFirstMessageRef.current?.(), 3000);
        }
      }
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // Derive reasoning streaming state from message parts
  const streamingMeta = useMemo<StreamingMeta>(() => {
    if (!isStreaming) return { reasoningIsStreaming: false };
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== "assistant") return { reasoningIsStreaming: false };
    const lastPart = lastMsg.parts[lastMsg.parts.length - 1];
    return {
      reasoningIsStreaming:
        lastPart?.type === "reasoning" && (lastPart as { state?: string }).state === "streaming",
    };
  }, [isStreaming, messages]);

  // Load initial messages from DB and restore token usage
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await api.getMessages(sessionId);
        const uiMessages = dbMessagesToUIMessages(data);
        setMessages(uiMessages);
        messageCountRef.current = data.filter((m) => m.role === "user").length;

        // Restore token usage from last assistant message
        const assistantMsgs = data.filter((m) => m.role === "assistant");
        if (assistantMsgs.length > 0) {
          const last = assistantMsgs[assistantMsgs.length - 1];
          setTokenUsage({
            input: last.tokensInput,
            output: assistantMsgs.reduce((sum, m) => sum + m.tokensOutput, 0),
            reasoning: assistantMsgs.reduce((sum, m) => sum + m.tokensReasoning, 0),
            cacheRead: last.tokensCacheRead,
            cacheWrite: last.tokensCacheWrite,
          });
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [sessionId, setMessages]);

  const sendMessage = useCallback(
    (content: string) => {
      if (isStreaming) return;
      messageCountRef.current++;
      aiSendMessage({ text: content });
    },
    [isStreaming, aiSendMessage],
  );

  return {
    messages,
    isStreaming,
    isLoading,
    tokenUsage,
    streamingMeta,
    sendMessage,
  };
}
