import { useState, useEffect, useCallback } from "react";
import type { Message, TokenUsage } from "@repo/shared";
import { AgentAPIClient } from "@repo/shared/api-client";

const api = new AgentAPIClient();

export function useAgent(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });

  // Load existing messages
  useEffect(() => {
    api.getMessages(sessionId).then(setMessages).catch(console.error);
  }, [sessionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      // Add user message
      const userMsg: Message = {
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
      setMessages((prev) => [...prev, userMsg]);

      // Add assistant placeholder
      const assistantMsg: Message = {
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
      setMessages((prev) => [...prev, assistantMsg]);

      setIsStreaming(true);
      let streamContent = "";

      try {
        for await (const event of api.streamMessage(sessionId, { content })) {
          switch (event.type) {
            case "token":
              streamContent += event.data.delta;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: streamContent };
                }
                return updated;
              });
              break;

            case "step-finish":
              setTokenUsage(event.data.usage);
              break;

            case "done":
              setTokenUsage(event.data.usage);
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
    [sessionId, isStreaming]
  );

  return { messages, isStreaming, tokenUsage, sendMessage };
}
