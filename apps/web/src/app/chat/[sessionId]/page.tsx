"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { useAppContext } from "@/contexts/AppContext";
import { useChat } from "@/hooks/useChat";

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const initialQuery = searchParams.get("q");
  const sentInitialRef = useRef(false);

  const { sessions, refreshSession, model, setModel } = useAppContext();
  const { messages, isStreaming, isLoading, sendMessage, tokenUsage, streamingMeta } = useChat(
    sessionId,
    () => {
      refreshSession(sessionId);
    },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on session change
  useEffect(() => {
    sentInitialRef.current = false;
  }, [sessionId]);

  // Auto-send the initial query from the index page (wait for load to avoid race condition)
  useEffect(() => {
    if (!isLoading && initialQuery && !sentInitialRef.current && messages.length === 0) {
      sentInitialRef.current = true;
      sendMessage(initialQuery);
    }
  }, [isLoading, initialQuery, sendMessage, messages.length]);

  // Sync model from session data when loaded
  const currentSession = sessions.find((s) => s.id === sessionId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync model from session
  useEffect(() => {
    if (currentSession?.model) {
      setModel(currentSession.model);
    }
  }, [currentSession?.model]);

  return (
    <ChatWindow
      messages={messages}
      isStreaming={isStreaming}
      isLoading={isLoading}
      tokenUsage={tokenUsage}
      streamingMeta={streamingMeta}
      model={model}
      onSendMessage={sendMessage}
    />
  );
}
