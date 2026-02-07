"use client";

import type { Message, MessagePart, TokenUsage } from "@repo/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface ToolCallEntry {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  isError?: boolean;
}

export interface StreamingMeta {
  reasoningIsStreaming: boolean;
}

export function useChat(sessionId: string, onFirstMessage?: () => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
  const [streamingMeta, setStreamingMeta] = useState<StreamingMeta>({
    reasoningIsStreaming: false,
  });

  const streamingContentRef = useRef("");
  const reasoningRef = useRef("");
  const toolCallsRef = useRef<Map<string, ToolCallEntry>>(new Map());
  const messageCountRef = useRef(0);

  // Build parts array from streaming refs
  const buildStreamingParts = useCallback((messageId: string): MessagePart[] => {
    const parts: MessagePart[] = [];

    if (reasoningRef.current) {
      parts.push({
        id: "streaming-reasoning",
        messageId,
        type: "reasoning",
        toolName: null,
        toolCallId: null,
        content: reasoningRef.current,
        tokenEstimate: 0,
        pruned: false,
        createdAt: Date.now(),
      });
    }

    for (const tc of toolCallsRef.current.values()) {
      parts.push({
        id: `streaming-tc-${tc.toolCallId}`,
        messageId,
        type: "tool-call",
        toolName: tc.toolName,
        toolCallId: tc.toolCallId,
        content: JSON.stringify(tc.input),
        tokenEstimate: 0,
        pruned: false,
        createdAt: Date.now(),
      });
      if (tc.output !== undefined) {
        parts.push({
          id: `streaming-tr-${tc.toolCallId}`,
          messageId,
          type: "tool-result",
          toolName: tc.toolName,
          toolCallId: tc.toolCallId,
          content: JSON.stringify(tc.output),
          tokenEstimate: 0,
          pruned: false,
          createdAt: Date.now(),
        });
      }
    }

    if (streamingContentRef.current) {
      parts.push({
        id: "streaming-text",
        messageId,
        type: "text",
        toolName: null,
        toolCallId: null,
        content: streamingContentRef.current,
        tokenEstimate: 0,
        pruned: false,
        createdAt: Date.now(),
      });
    }

    return parts;
  }, []);

  // Update the last assistant message with current streaming state
  const updateAssistantMessage = useCallback(() => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant") {
        const parts = buildStreamingParts(last.id);
        updated[updated.length - 1] = {
          ...last,
          content: streamingContentRef.current,
          parts: parts.length > 0 ? parts : undefined,
        };
      }
      return updated;
    });
  }, [buildStreamingParts]);

  // Load existing messages and restore token usage
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await api.getMessages(sessionId);
        setMessages(data);
        messageCountRef.current = data.filter((m) => m.role === "user").length;

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
  }, [sessionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      const isFirstMessage = messageCountRef.current === 0;
      messageCountRef.current++;

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
      reasoningRef.current = "";
      toolCallsRef.current = new Map();
      setStreamingMeta({ reasoningIsStreaming: false });

      try {
        for await (const event of api.streamMessage(sessionId, { content })) {
          switch (event.type) {
            case "reasoning-delta":
              reasoningRef.current += event.data.delta;
              setStreamingMeta({ reasoningIsStreaming: true });
              updateAssistantMessage();
              break;

            case "token":
              // First text token means reasoning is done
              if (reasoningRef.current) {
                setStreamingMeta({ reasoningIsStreaming: false });
              }
              streamingContentRef.current += event.data.delta;
              updateAssistantMessage();
              break;

            case "tool-call": {
              // First tool-call also means reasoning is done
              if (reasoningRef.current) {
                setStreamingMeta({ reasoningIsStreaming: false });
              }
              toolCallsRef.current.set(event.data.toolCallId, {
                toolCallId: event.data.toolCallId,
                toolName: event.data.toolName,
                input: event.data.input,
              });
              updateAssistantMessage();
              break;
            }

            case "tool-result": {
              const existing = toolCallsRef.current.get(event.data.toolCallId);
              if (existing) {
                existing.output = event.data.output;
                existing.isError = event.data.isError;
              }
              updateAssistantMessage();
              break;
            }

            case "step-finish":
              setTokenUsage(event.data.usage);
              break;

            case "compaction": {
              // Reload messages from API after compaction replaces history
              const refreshed = await api.getMessages(sessionId);
              setMessages(refreshed);
              // Reset streaming refs for continued streaming post-compaction
              streamingContentRef.current = "";
              reasoningRef.current = "";
              toolCallsRef.current = new Map();
              setStreamingMeta({ reasoningIsStreaming: false });
              // Re-add assistant placeholder for continued streaming
              const placeholder: Message = {
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
              setMessages((prev) => [...prev, placeholder]);
              break;
            }

            case "done":
              setTokenUsage(event.data.usage);
              setStreamingMeta({ reasoningIsStreaming: false });
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  const parts = buildStreamingParts(event.data.messageId);
                  updated[updated.length - 1] = {
                    ...last,
                    id: event.data.messageId,
                    parts: parts.length > 0 ? parts : undefined,
                  };
                }
                return updated;
              });
              if (isFirstMessage) {
                api.generateTitle(sessionId, content).catch(console.error);
                setTimeout(() => onFirstMessage?.(), 3000);
              }
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
        setStreamingMeta({ reasoningIsStreaming: false });
      }
    },
    [sessionId, isStreaming, onFirstMessage, updateAssistantMessage, buildStreamingParts],
  );

  return { messages, isStreaming, isLoading, tokenUsage, streamingMeta, sendMessage };
}
