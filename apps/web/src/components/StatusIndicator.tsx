"use client";

import type { TokenUsage } from "@repo/shared";
import { Activity } from "lucide-react";

interface StatusIndicatorProps {
  usage: TokenUsage;
  isStreaming: boolean;
}

export function StatusIndicator({ usage, isStreaming }: StatusIndicatorProps) {
  const totalTokens = usage.input + usage.output;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Activity className={`w-3 h-3 ${isStreaming ? "text-success animate-pulse" : ""}`} />
        <span>{isStreaming ? "Streaming..." : "Ready"}</span>
      </div>

      {totalTokens > 0 && (
        <div className="flex items-center gap-3">
          <span>In: {usage.input.toLocaleString()}</span>
          <span>Out: {usage.output.toLocaleString()}</span>
          {usage.cacheRead > 0 && <span>Cache: {usage.cacheRead.toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}
