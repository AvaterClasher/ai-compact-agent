"use client";

import type { Session } from "@repo/shared";
import { MessageSquare, Plus } from "lucide-react";

interface SessionSidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onNewSession,
  onSelectSession,
}: SessionSidebarProps) {
  return (
    <aside className="w-64 border-r border-border bg-accent flex flex-col">
      <div className="p-3 border-b border-border">
        <button
          type="button"
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm"
        >
          <Plus className="w-4 h-4" />
          New Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.map((session) => (
          <button
            type="button"
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors mb-1 ${
              session.id === activeSessionId
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="truncate">{session.title}</span>
          </button>
        ))}

        {sessions.length === 0 && (
          <p className="text-center text-muted-foreground text-xs mt-8">No sessions yet</p>
        )}
      </div>
    </aside>
  );
}
