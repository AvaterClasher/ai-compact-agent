"use client";

import { DEFAULT_CONTEXT_WINDOW, MODEL_CONTEXT_WINDOWS, type TokenUsage } from "@repo/shared";
import { Cpu } from "lucide-react";
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { Shimmer } from "@/components/ai-elements/shimmer";

interface StatusIndicatorProps {
  usage: TokenUsage;
  isStreaming: boolean;
  model: string;
}

export function StatusIndicator({ usage, isStreaming, model }: StatusIndicatorProps) {
  const CONTEXT_WINDOW = MODEL_CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
  const usedTokens = usage.input + usage.output;

  const aiUsage = {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.input + usage.output,
    reasoningTokens: usage.reasoning,
    cachedInputTokens: usage.cacheRead,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: usage.cacheRead || undefined,
      cacheWriteTokens: usage.cacheWrite || undefined,
    },
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: usage.reasoning || undefined,
    },
  };

  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-b border-border font-mono text-[11px] text-muted-foreground">
      <Context usedTokens={usedTokens} maxTokens={CONTEXT_WINDOW} usage={aiUsage} modelId={model}>
        <ContextTrigger />
        <ContextContent>
          <ContextContentHeader />
          <ContextContentBody>
            <div className="space-y-1.5">
              <ContextInputUsage />
              <ContextOutputUsage />
              <ContextReasoningUsage />
              <ContextCacheUsage />
            </div>
          </ContextContentBody>
          <ContextContentFooter />
        </ContextContent>
      </Context>

      <div className="flex items-center gap-2">
        {isStreaming ? (
          <Shimmer as="span" className="text-xs font-medium tracking-wide">
            STREAMING
          </Shimmer>
        ) : (
          <>
            <Cpu className="w-3 h-3 text-dim" />
            <span className="text-dim tracking-wide">IDLE</span>
          </>
        )}
      </div>
    </div>
  );
}
