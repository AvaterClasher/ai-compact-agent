"use client";

import { usePathname, useRouter } from "next/navigation";
import { SessionSidebar } from "@/components/SessionSidebar";
import { AppProvider } from "@/contexts/AppContext";
import { useEndpoint } from "@/hooks/useEndpoint";
import { useModelSelector } from "@/hooks/useModelSelector";
import { useSessions } from "@/hooks/useSessions";

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sessionId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;

  const { sessions, createSession, deleteSession, updateSession, refreshSession } = useSessions();
  const { url, status, sandboxStatus, setUrl, refresh } = useEndpoint();
  const { model, setModel, availableModels } = useModelSelector(sessionId ?? null);

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

  return (
    <AppProvider
      value={{
        sessions,
        createSession,
        deleteSession,
        updateSession,
        refreshSession,
        model,
        setModel,
      }}
    >
      <SessionSidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onNewSession={handleNewSession}
        onSelectSession={(id) => router.push(`/chat/${id}`)}
        onDeleteSession={handleDeleteSession}
        onRenameSession={(id, title) => updateSession(id, { title })}
        endpointUrl={url}
        endpointStatus={status}
        sandboxStatus={sandboxStatus}
        onEndpointChange={setUrl}
        onEndpointRefresh={refresh}
        selectedModel={model}
        onModelChange={setModel}
        availableModels={availableModels}
      />
      {children}
    </AppProvider>
  );
}
