"use client";

import type { TokenUsage } from "@repo/shared";
import { DEFAULT_CONTEXT_WINDOW, MODEL_CONTEXT_WINDOWS } from "@repo/shared";
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
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

interface InputBarProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  usage: TokenUsage;
  model: string;
}

export function InputBar({ onSend, disabled, usage, model }: InputBarProps) {
  const usedTokens = usage.input + usage.output;
  const maxTokens = MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;

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
    <div className="border-t border-border bg-background px-6 py-4">
      <div className="max-w-4xl mx-auto">
        <PromptInput
          onSubmit={(message) => {
            const text = message.text.trim();
            if (text) onSend(text);
          }}
        >
          <PromptInputTextarea
            placeholder="Ask anything"
            disabled={disabled}
            className="min-h-10 text-sm"
          />
          <PromptInputFooter>
            <div className="flex items-center gap-2">
              {disabled && (
                <Shimmer as="span" className="font-mono text-[10px] tracking-wide">
                  streaming...
                </Shimmer>
              )}
              <Context
                usedTokens={usedTokens}
                maxTokens={maxTokens}
                usage={aiUsage}
                modelId={model}
              >
                <ContextTrigger className="h-6 px-2 text-[10px]" />
                <ContextContent side="top" align="start">
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
            </div>
            <PromptInputSubmit disabled={disabled} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
