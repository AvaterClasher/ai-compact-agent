import type { Session, TokenUsage } from "@repo/shared";
import { AgentAPIClient } from "@repo/shared/api-client";
import { useCallback, useEffect, useState } from "react";

const api = new AgentAPIClient();

export function useSession() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });

  useEffect(() => {
    api.listSessions().then(setSessions).catch(console.error);
  }, []);

  const selectSession = useCallback(
    (id: string) => {
      const found = sessions.find((s) => s.id === id);
      if (found) setSession(found);
    },
    [sessions],
  );

  const createSession = useCallback(async () => {
    const newSession = await api.createSession();
    setSessions((prev) => [newSession, ...prev]);
    setSession(newSession);
    return newSession;
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (session?.id === id) {
        setSession(null);
      }
    },
    [session],
  );

  const updateSession = useCallback(
    async (id: string, title: string) => {
      const updated = await api.updateSession(id, { title });
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      if (session?.id === id) {
        setSession(updated);
      }
      return updated;
    },
    [session],
  );

  const refreshSession = useCallback(
    async (id: string) => {
      try {
        const refreshed = await api.getSession(id);
        setSessions((prev) => prev.map((s) => (s.id === id ? refreshed : s)));
        if (session?.id === id) {
          setSession(refreshed);
        }
      } catch {
        // ignore
      }
    },
    [session],
  );

  return {
    session,
    sessions,
    selectSession,
    createSession,
    deleteSession,
    updateSession,
    refreshSession,
    tokenUsage,
    setTokenUsage,
  };
}
