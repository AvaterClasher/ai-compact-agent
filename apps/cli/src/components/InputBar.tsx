import { useState, useCallback } from "react";

interface InputBarProps {
  onSubmit: (content: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSubmit, disabled }: InputBarProps) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }, [value, disabled, onSubmit]);

  return (
    <box
      border
      borderStyle="rounded"
      borderColor={disabled ? "#27272a" : "#3b82f6"}
      paddingLeft={1}
      paddingRight={1}
    >
      <text fg="#a1a1aa">{"> "}</text>
      <input
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="Type a message..."
        focused={!disabled}
        textColor="#fafafa"
        placeholderColor="#52525b"
        width={80}
      />
    </box>
  );
}
