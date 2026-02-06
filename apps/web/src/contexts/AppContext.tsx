"use client";

import type { Session, UpdateSessionInput } from "@repo/shared";
import { createContext, useContext } from "react";

interface AppContextValue {
  sessions: Session[];
  createSession: (title?: string) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  updateSession: (id: string, input: UpdateSessionInput) => Promise<Session>;
  refreshSession: (id: string) => Promise<Session | null>;
  model: string;
  setModel: (model: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  value,
  children,
}: {
  value: AppContextValue;
  children: React.ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
