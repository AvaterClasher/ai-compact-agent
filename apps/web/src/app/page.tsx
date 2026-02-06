"use client";

import { ArrowRight, BookOpen, Terminal } from "lucide-react";
import { useRouter } from "next/navigation";
import { SessionSidebar } from "@/components/SessionSidebar";
import { useEndpoint } from "@/hooks/useEndpoint";
import { useModelSelector } from "@/hooks/useModelSelector";
import { useSessions } from "@/hooks/useSessions";

export default function Home() {
  const router = useRouter();
  const { sessions, createSession, deleteSession, updateSession } = useSessions();
  const { url, status, setUrl, refresh } = useEndpoint();
  const { model, setModel, availableModels } = useModelSelector(null);

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
        onDeleteSession={(id) => deleteSession(id)}
        onRenameSession={(id, title) => updateSession(id, { title })}
        endpointUrl={url}
        endpointStatus={status}
        onEndpointChange={setUrl}
        onEndpointRefresh={refresh}
        selectedModel={model}
        onModelChange={setModel}
        availableModels={availableModels}
      />
      <div className="flex-1 flex items-center justify-center relative">
        <div className="relative text-center animate-fade-in max-w-lg px-6">
          <p className="text-lg text-foreground leading-relaxed mb-2">
            This is an open-source{" "}
            <span className="inline-flex items-center gap-1.5 align-middle border border-border rounded px-2 py-0.5 bg-secondary text-sm font-medium">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              Salvador
            </span>{" "}
            Agent UI, built with{" "}
            <span className="inline-flex items-center gap-1 align-middle border border-border rounded px-2 py-0.5 bg-secondary text-sm font-medium">
              AI SDK
            </span>
          </p>
          <p className="text-muted-foreground text-sm mb-8">
            For the full experience, connect to a running Salvador API.
          </p>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              className="group inline-flex items-center gap-2 px-4 py-2.5 border border-border bg-transparent text-foreground text-xs font-mono font-medium tracking-wider uppercase rounded-md hover:bg-secondary transition-colors duration-150 cursor-pointer focus-ring"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Go to Docs
            </button>
            <button
              type="button"
              onClick={handleNewSession}
              className="group inline-flex items-center gap-2 px-4 py-2.5 border border-border bg-transparent text-foreground text-xs font-mono font-medium tracking-wider uppercase rounded-md hover:bg-secondary transition-colors duration-150 cursor-pointer focus-ring"
            >
              New Session
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          {/* Input bar at bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-6">
            {/* This will be handled by the main content area's input bar on the chat page */}
          </div>
        </div>

        {/* Bottom input */}
        <div className="absolute bottom-6 left-0 right-0 px-8">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-input px-4 py-3">
              <input
                type="text"
                placeholder="Ask anything"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                    const session = await createSession();
                    router.push(`/chat/${session.id}`);
                  }
                }}
              />
              <button
                type="button"
                onClick={handleNewSession}
                className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
