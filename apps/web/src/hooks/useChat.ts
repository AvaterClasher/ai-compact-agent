"use client";

import type { Message, TokenUsage } from "@repo/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
  const streamingContentRef = useRef("");

  // Load existing messages
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getMessages(sessionId);
        setMessages(data);
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    };
    load();
  }, [sessionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      // Optimistically add user message
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        sessionId,
        role: "user",
        content,
        tokensInput: 0,
        tokensOutput: 0,
        tokensReasoning: 0,
        tokensCacheRead: 0,
        tokensCacheWrite: 0,
        cost: 0,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Add placeholder assistant message
      const assistantMessage: Message = {
        id: `temp-assistant-${Date.now()}`,
        sessionId,
        role: "assistant",
        content: "",
        tokensInput: 0,
        tokensOutput: 0,
        tokensReasoning: 0,
        tokensCacheRead: 0,
        tokensCacheWrite: 0,
        cost: 0,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      setIsStreaming(true);
      streamingContentRef.current = "";

      try {
        for await (const event of api.streamMessage(sessionId, { content })) {
          switch (event.type) {
            case "token":
              streamingContentRef.current += event.data.delta;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: streamingContentRef.current,
                  };
                }
                return updated;
              });
              break;

            case "step-finish":
              setTokenUsage(event.data.usage);
              break;

            case "done":
              setTokenUsage(event.data.usage);
              // Update the assistant message with the real ID
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    id: event.data.messageId,
                  };
                }
                return updated;
              });
              break;

            case "error":
              console.error("Stream error:", event.data.message);
              break;
          }
        }
      } catch (error) {
        console.error("Stream failed:", error);
      } finally {
        setIsStreaming(false);
      }
    },
    [sessionId, isStreaming],
  );

  return { messages, isStreaming, tokenUsage, sendMessage };
}
