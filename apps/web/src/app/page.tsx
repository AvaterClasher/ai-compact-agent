"use client";

import { ArrowRight, Terminal } from "lucide-react";
import { useRouter } from "next/navigation";
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
      <div className="flex-1 flex items-center justify-center relative">
        <div className="relative text-center animate-fade-in">
          {/* Logo mark */}
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 border border-border bg-gray-100 rounded-lg">
            <Terminal className="w-7 h-7 text-foreground" />
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-2">Salvador</h1>
          <p className="text-muted-foreground text-sm tracking-normal mb-8">
            context-compacting coding agent
          </p>

          <button
            type="button"
            onClick={handleNewSession}
            className="group inline-flex items-center gap-2.5 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-[#0060df] transition-colors duration-150 cursor-pointer focus-ring"
          >
            New Session
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* Version tag */}
          <div className="mt-12 font-mono text-[11px] tracking-wider uppercase text-muted-foreground">
            v0.1.0 / multi-provider
          </div>
        </div>
      </div>
    </>
  );
}
