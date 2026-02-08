import { useChat as useAIChat } from "@ai-sdk/react";
import type { TokenUsage } from "@repo/shared";
import { dbMessagesToUIMessages } from "@repo/shared";
import { AgentAPIClient } from "@repo/shared/api-client";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const api = new AgentAPIClient();

function createSessionTransport(sessionId: string) {
  return new DefaultChatTransport({
    api: `http://localhost:5001/api/stream/${sessionId}`,
    prepareSendMessagesRequest: ({ messages }) => {
      const lastMessage = messages[messages.length - 1];
      const textPart = lastMessage?.parts.find(
        (p): p is Extract<(typeof lastMessage.parts)[number], { type: "text" }> =>
          p.type === "text",
      );
      return {
        body: { content: textPart?.text ?? "" },
      };
    },
  });
}

export function useAgent(sessionId: string, onFirstMessage?: () => void) {
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
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
        const { usage } = part.data as { messageId: string; usage: TokenUsage };
        setTokenUsage(usage);
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

  // Load existing messages
  useEffect(() => {
    api
      .getMessages(sessionId)
      .then((data) => {
        const uiMessages = dbMessagesToUIMessages(data);
        setMessages(uiMessages);
        messageCountRef.current = data.filter((m) => m.role === "user").length;
      })
      .catch(console.error);
  }, [sessionId, setMessages]);

  const sendMessage = useCallback(
    (content: string) => {
      if (isStreaming) return;
      messageCountRef.current++;
      aiSendMessage({ text: content });
    },
    [isStreaming, aiSendMessage],
  );

  return { messages, isStreaming, tokenUsage, sendMessage };
}
