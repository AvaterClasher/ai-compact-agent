"use client";

import type { Session } from "@repo/shared";
import { MessageSquare, Pencil, Plus, Terminal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EndpointStatus, SandboxStatus } from "@/hooks/useEndpoint";
import { AgentSelector } from "./sidebar/AgentSelector";
import { EndpointConfig } from "./sidebar/EndpointConfig";
import { SidebarSection } from "./sidebar/SidebarSection";

interface SessionSidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  endpointUrl: string;
  endpointStatus: EndpointStatus;
  sandboxStatus: SandboxStatus;
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
  onDeleteSession,
  onRenameSession,
  endpointUrl,
  endpointStatus,
  sandboxStatus,
  onEndpointChange,
  onEndpointRefresh,
  selectedModel,
  onModelChange,
  availableModels,
}: SessionSidebarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Clear confirm state when clicking outside
  useEffect(() => {
    if (!confirmDeleteId) return;
    const handler = () => setConfirmDeleteId(null);
    const timer = setTimeout(() => document.addEventListener("click", handler, { once: true }), 0);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  const handleRenameSubmit = (id: string, value: string, originalTitle: string) => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== originalTitle) {
      onRenameSession(id, trimmed);
    }
    setEditingId(null);
  };

  return (
    <aside className="w-[260px] border-r border-border bg-card flex flex-col">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2 px-2">
          <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Terminal className="w-3 h-3 text-primary" />
          </div>
          <span className="font-mono text-xs font-semibold tracking-wide text-foreground uppercase">
            Exo
          </span>
          <span className="ml-auto font-mono text-[9px] text-dim tracking-wide bg-secondary px-1.5 py-0.5 rounded">
            v0.1
          </span>
        </div>
      </div>

      {/* Endpoint */}
      <SidebarSection label="Endpoint">
        <EndpointConfig
          url={endpointUrl}
          status={endpointStatus}
          sandboxStatus={sandboxStatus}
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
            <button
              type="button"
              onClick={onNewSession}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-2 rounded-md border border-border bg-transparent text-foreground font-mono text-[11px] font-medium tracking-wide uppercase hover:bg-secondary transition-colors duration-150 cursor-pointer focus-ring"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
            {sessions.map((session, i) => {
              const isActive = session.id === activeSessionId;
              const isConfirmingDelete = confirmDeleteId === session.id;
              const isEditing = editingId === session.id;

              return (
                <button
                  type="button"
                  key={session.id}
                  className={`group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm transition-colors duration-150 mb-0.5 cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-foreground border border-primary/20"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
                  }`}
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => !isEditing && onSelectSession(session.id)}
                >
                  <div className="relative shrink-0">
                    <MessageSquare
                      className={`w-3.5 h-3.5 ${isActive ? "text-primary" : "text-dim group-hover:text-muted-foreground"}`}
                    />
                    {isActive && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-success" />
                    )}
                  </div>

                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      defaultValue={session.title}
                      className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground border-b border-primary/40 outline-none px-0 py-0"
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          handleRenameSubmit(session.id, e.currentTarget.value, session.title);
                        }
                        if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      onBlur={(e) => {
                        handleRenameSubmit(session.id, e.target.value, session.title);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate text-[13px] flex-1 min-w-0">{session.title}</span>
                  )}

                  {/* Action buttons */}
                  {!isEditing && (
                    <div className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity duration-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(session.id);
                        }}
                        className="p-1 rounded text-dim hover:text-foreground hover:bg-secondary"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {isConfirmingDelete ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                            setConfirmDeleteId(null);
                          }}
                          className="p-1 rounded text-destructive hover:bg-destructive/10"
                          title="Click to confirm delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(session.id);
                          }}
                          className="p-1 rounded text-dim hover:text-foreground hover:bg-secondary"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
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
