"use client";

import type { Session, UpdateSessionInput } from "@repo/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.listSessions();
      setSessions(data);
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createSession = useCallback(async (title?: string) => {
    const session = await api.createSession({ title });
    setSessions((prev) => [session, ...prev]);
    return session;
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    await api.deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateSession = useCallback(async (id: string, input: UpdateSessionInput) => {
    const updated = await api.updateSession(id, input);
    setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const refreshSession = useCallback(async (id: string) => {
    try {
      const session = await api.getSession(id);
      setSessions((prev) => prev.map((s) => (s.id === id ? session : s)));
      return session;
    } catch {
      return null;
    }
  }, []);

  return {
    sessions,
    loading,
    createSession,
    deleteSession,
    updateSession,
    refreshSession,
    refreshSessions: fetchSessions,
  };
}
