"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SessionSidebar } from "@/components/SessionSidebar";
import { useSessions } from "@/hooks/useSessions";

export default function Home() {
  const router = useRouter();
  const { sessions, createSession } = useSessions();

  const handleNewSession = async () => {
    const session = await createSession();
    router.push(`/chat/${session.id}`);
  };

  return (
    <>
      <SessionSidebar
        sessions={sessions}
        activeSessionId={null}
        onNewSession={handleNewSession}
        onSelectSession={(id) => router.push(`/chat/${id}`)}
      />
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Salvador</h2>
          <p className="mb-4">Context-compacting coding agent</p>
          <button
            onClick={handleNewSession}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            New Session
          </button>
        </div>
      </div>
    </>
  );
}
