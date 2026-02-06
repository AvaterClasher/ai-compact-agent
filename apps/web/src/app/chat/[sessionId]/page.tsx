"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { SessionSidebar } from "@/components/SessionSidebar";
import { useChat } from "@/hooks/useChat";
import { useEndpoint } from "@/hooks/useEndpoint";
import { useModelSelector } from "@/hooks/useModelSelector";
import { useSessions } from "@/hooks/useSessions";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const { sessions, createSession, deleteSession, updateSession, refreshSession } = useSessions();
  const { messages, isStreaming, sendMessage, tokenUsage } = useChat(sessionId, () => {
    refreshSession(sessionId);
  });
  const { url, status, setUrl, refresh } = useEndpoint();
  const { model, setModel, availableModels } = useModelSelector(sessionId);

  // Sync model from session data when loaded
  const currentSession = sessions.find((s) => s.id === sessionId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync model from session
  useEffect(() => {
    if (currentSession?.model) {
      setModel(currentSession.model);
    }
  }, [currentSession?.model]);

  const handleNewSession = async () => {
    const session = await createSession();
    router.push(`/chat/${session.id}`);
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    if (id === sessionId) {
      const remaining = sessions.filter((s) => s.id !== id);
      router.push(remaining.length > 0 ? `/chat/${remaining[0].id}` : "/");
    }
  };

  const handleRenameSession = async (id: string, title: string) => {
    await updateSession(id, { title });
  };

  return (
    <>
      <SessionSidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onNewSession={handleNewSession}
        onSelectSession={(id) => router.push(`/chat/${id}`)}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        endpointUrl={url}
        endpointStatus={status}
        onEndpointChange={setUrl}
        onEndpointRefresh={refresh}
        selectedModel={model}
        onModelChange={setModel}
        availableModels={availableModels}
      />
      <ChatWindow
        messages={messages}
        isStreaming={isStreaming}
        tokenUsage={tokenUsage}
        model={model}
        onSendMessage={sendMessage}
      />
    </>
  );
}
