"use client";

import type { Session } from "@repo/shared";
import { Hash, Plus, Terminal } from "lucide-react";

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
    <aside className="w-[260px] border-r border-border bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2 px-2 mb-3">
          <Terminal className="w-3.5 h-3.5 text-foreground" />
          <span className="font-mono text-xs font-semibold tracking-wide text-foreground uppercase">
            Salvador
          </span>
        </div>
        <button
          type="button"
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground font-sans text-xs font-medium hover:bg-[#0060df] transition-colors duration-150 cursor-pointer focus-ring"
        >
          <Plus className="w-3.5 h-3.5" />
          New Session
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <div className="px-2 py-1.5 mb-1">
          <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground font-medium">
            Sessions
          </span>
        </div>

        {sessions.map((session, i) => {
          const isActive = session.id === activeSessionId;
          return (
            <button
              type="button"
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm transition-colors duration-150 mb-0.5 cursor-pointer ${
                isActive
                  ? "bg-[rgba(0,112,243,0.1)] text-foreground border border-primary/20"
                  : "text-muted-foreground hover:bg-gray-200 hover:text-foreground border border-transparent"
              }`}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <Hash
                className={`w-3 h-3 shrink-0 ${isActive ? "text-primary" : "text-dim group-hover:text-muted-foreground"}`}
              />
              <span className="truncate text-[13px]">{session.title}</span>
            </button>
          );
        })}

        {sessions.length === 0 && (
          <div className="flex flex-col items-center mt-12 text-dim">
            <div className="w-8 h-8 border border-border rounded-lg flex items-center justify-center mb-3">
              <Hash className="w-3.5 h-3.5" />
            </div>
            <p className="font-mono text-[10px] tracking-wider uppercase">No sessions</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border">
        <span className="font-mono text-[10px] text-dim tracking-wider">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>
    </aside>
  );
}
