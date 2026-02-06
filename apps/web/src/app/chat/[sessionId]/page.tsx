"use client";

import { useParams, useRouter } from "next/navigation";
import { ChatWindow } from "@/components/ChatWindow";
import { SessionSidebar } from "@/components/SessionSidebar";
import { useChat } from "@/hooks/useChat";
import { useSessions } from "@/hooks/useSessions";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const { sessions, createSession } = useSessions();
  const { messages, isStreaming, sendMessage, tokenUsage } = useChat(sessionId);

  const handleNewSession = async () => {
    const session = await createSession();
    router.push(`/chat/${session.id}`);
  };

  return (
    <>
      <SessionSidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onNewSession={handleNewSession}
        onSelectSession={(id) => router.push(`/chat/${id}`)}
      />
      <ChatWindow
        messages={messages}
        isStreaming={isStreaming}
        tokenUsage={tokenUsage}
        onSendMessage={sendMessage}
      />
    </>
  );
}
