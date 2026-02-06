"use client";

import type { TokenUsage } from "@repo/shared";
import { Cpu } from "lucide-react";

interface StatusIndicatorProps {
  usage: TokenUsage;
  isStreaming: boolean;
}

function TokenPill({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary border border-border">
      <span className="text-dim">{label}</span>
      <span className="text-foreground font-medium tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

export function StatusIndicator({ usage, isStreaming }: StatusIndicatorProps) {
  const totalTokens = usage.input + usage.output;

  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-b border-border font-mono text-[11px] text-muted-foreground">
      <div className="flex items-center gap-2">
        {isStreaming ? (
          <>
            <div className="flex items-center justify-center w-4 h-4">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
            </div>
            <span className="text-primary font-medium tracking-wide">STREAMING</span>
          </>
        ) : (
          <>
            <Cpu className="w-3 h-3 text-dim" />
            <span className="text-dim tracking-wide">IDLE</span>
          </>
        )}
      </div>

      {totalTokens > 0 && (
        <div className="flex items-center gap-1.5">
          <TokenPill label="in" value={usage.input} />
          <TokenPill label="out" value={usage.output} />
          {usage.cacheRead > 0 && <TokenPill label="cache" value={usage.cacheRead} />}
        </div>
      )}
    </div>
  );
}
