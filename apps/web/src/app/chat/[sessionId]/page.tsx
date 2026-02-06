"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { useAppContext } from "@/contexts/AppContext";
import { useChat } from "@/hooks/useChat";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const initialQuery = searchParams.get("q");
  const sentInitialRef = useRef(false);

  const { sessions, refreshSession, model, setModel } = useAppContext();
  const { messages, isStreaming, loaded, sendMessage, tokenUsage } = useChat(sessionId, () => {
    refreshSession(sessionId);
  });

  // Auto-send the initial query from the index page (wait for load to avoid race condition)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire once after initial load
  useEffect(() => {
    if (loaded && initialQuery && !sentInitialRef.current && messages.length === 0) {
      sentInitialRef.current = true;
      sendMessage(initialQuery);
      router.replace(`/chat/${sessionId}`, { scroll: false });
    }
  }, [loaded, initialQuery, messages.length]);

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
      tokenUsage={tokenUsage}
      model={model}
      onSendMessage={sendMessage}
    />
  );
}
