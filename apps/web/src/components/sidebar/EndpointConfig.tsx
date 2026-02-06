"use client";

import { RotateCw } from "lucide-react";
import { useState } from "react";
import type { EndpointStatus } from "@/hooks/useEndpoint";

interface EndpointConfigProps {
  url: string;
  status: EndpointStatus;
  onUrlChange: (url: string) => void;
  onRefresh: () => void;
}

const statusColors: Record<EndpointStatus, string> = {
  connected: "bg-success",
  disconnected: "bg-destructive",
  checking: "bg-warning animate-pulse-dot",
};

export function EndpointConfig({ url, status, onUrlChange, onRefresh }: EndpointConfigProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);

  const handleBlur = () => {
    setEditing(false);
    if (draft.trim() && draft !== url) {
      onUrlChange(draft.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Escape") {
      setDraft(url);
      setEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-2">
      <div className="flex-1 flex items-center gap-2 min-w-0 bg-input border border-border rounded-md px-2.5 py-1.5">
        {editing ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-[11px] font-mono text-foreground focus:outline-none min-w-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(url);
              setEditing(true);
            }}
            className="flex-1 text-left text-[11px] font-mono text-muted-foreground truncate min-w-0 cursor-text"
          >
            {url.replace(/^https?:\/\//, "")}
          </button>
        )}
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusColors[status]}`} />
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <RotateCw className="w-3 h-3" />
      </button>
    </div>
  );
}
