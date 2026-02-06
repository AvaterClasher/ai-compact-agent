"use client";

import type { Session } from "@repo/shared";
import { MessageSquare, Plus, Terminal } from "lucide-react";
import type { EndpointStatus } from "@/hooks/useEndpoint";
import { AgentSelector } from "./sidebar/AgentSelector";
import { EndpointConfig } from "./sidebar/EndpointConfig";
import { SidebarSection } from "./sidebar/SidebarSection";

interface SessionSidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  endpointUrl: string;
  endpointStatus: EndpointStatus;
  onEndpointChange: (url: string) => void;
  onEndpointRefresh: () => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  availableModels: readonly string[];
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onNewSession,
  onSelectSession,
  endpointUrl,
  endpointStatus,
  onEndpointChange,
  onEndpointRefresh,
  selectedModel,
  onModelChange,
  availableModels,
}: SessionSidebarProps) {
  return (
    <aside className="w-[260px] border-r border-border bg-card flex flex-col">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2 px-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Terminal className="w-3 h-3 text-primary" />
          </div>
          <span className="font-mono text-xs font-semibold tracking-wide text-foreground uppercase">
            Salvador
          </span>
          <span className="ml-auto font-mono text-[9px] text-dim tracking-wide bg-secondary px-1.5 py-0.5 rounded">
            v0.1
          </span>
        </div>
        <button
          type="button"
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border bg-transparent text-foreground font-mono text-[11px] font-medium tracking-wide uppercase hover:bg-secondary transition-colors duration-150 cursor-pointer focus-ring"
        >
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      {/* Endpoint */}
      <SidebarSection label="Endpoint">
        <EndpointConfig
          url={endpointUrl}
          status={endpointStatus}
          onUrlChange={onEndpointChange}
          onRefresh={onEndpointRefresh}
        />
      </SidebarSection>

      {/* Agent */}
      <SidebarSection label="Agent">
        <AgentSelector
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          availableModels={availableModels}
        />
      </SidebarSection>

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto border-t border-border">
        <SidebarSection label="Sessions">
          <div className="px-0">
            {sessions.map((session, i) => {
              const isActive = session.id === activeSessionId;
              return (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm transition-colors duration-150 mb-0.5 cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-foreground border border-primary/20"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
                  }`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="relative shrink-0">
                    <MessageSquare
                      className={`w-3.5 h-3.5 ${isActive ? "text-primary" : "text-dim group-hover:text-muted-foreground"}`}
                    />
                    {isActive && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-success" />
                    )}
                  </div>
                  <span className="truncate text-[13px]">{session.title}</span>
                </button>
              );
            })}

            {sessions.length === 0 && (
              <div className="flex flex-col items-center mt-8 text-dim">
                <div className="w-10 h-10 border border-border rounded-lg flex items-center justify-center mb-3">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <p className="font-mono text-[11px] tracking-wide font-medium">No Session found</p>
                <p className="text-[10px] text-muted-foreground mt-1 text-center px-4">
                  No session records yet. Start a conversation to create one.
                </p>
              </div>
            )}
          </div>
        </SidebarSection>
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
