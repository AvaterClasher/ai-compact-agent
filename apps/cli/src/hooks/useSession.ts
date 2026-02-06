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

  return { session, sessions, selectSession, createSession, tokenUsage, setTokenUsage };
}
