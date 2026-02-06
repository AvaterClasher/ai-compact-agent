"use client";

import { CornerDownLeft } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface InputBarProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setValue("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  const hasContent = value.trim().length > 0;

  return (
    <div className="border-t border-border bg-background px-6 py-4">
      <div className="max-w-4xl mx-auto">
        <div
          className={`flex items-end gap-3 rounded-lg border transition-colors duration-200 bg-gray-100 px-4 py-3 ${
            hasContent ? "border-primary/40" : "border-border"
          }`}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Enter a message..."
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-40 leading-relaxed"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || !hasContent}
            className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-md font-mono text-[11px] font-medium tracking-wide transition-colors duration-150 ${
              hasContent && !disabled
                ? "bg-primary text-primary-foreground hover:bg-[#0060df] cursor-pointer focus-ring"
                : "bg-gray-200 text-dim cursor-not-allowed"
            }`}
          >
            <CornerDownLeft className="w-3 h-3" />
            Send
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="font-mono text-[10px] text-dim tracking-wide">
            shift+enter for newline
          </span>
          {disabled && (
            <span className="font-mono text-[10px] text-primary tracking-wide">streaming...</span>
          )}
        </div>
      </div>
    </div>
  );
}
