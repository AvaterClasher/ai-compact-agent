"use client";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";

interface InputBarProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
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
                <span className="font-mono text-[10px] text-primary tracking-wide">
                  streaming...
                </span>
              )}
            </div>
            <PromptInputSubmit disabled={disabled} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
