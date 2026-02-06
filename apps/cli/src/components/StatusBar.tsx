import type { TokenUsage } from "@repo/shared";

interface StatusBarProps {
  usage: TokenUsage;
  sessionTitle?: string;
}

export function StatusBar({ usage, sessionTitle }: StatusBarProps) {
  const totalTokens = usage.input + usage.output;

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      border
      borderColor="#27272a"
      paddingLeft={1}
      paddingRight={1}
    >
      <text fg="#a1a1aa">{sessionTitle || "No session"} | Ctrl+N: New | ESC: Back/Quit</text>
      {totalTokens > 0 && (
        <text fg="#a1a1aa">
          Tokens: {usage.input.toLocaleString()} in / {usage.output.toLocaleString()} out
          {usage.cacheRead > 0 ? ` / ${usage.cacheRead.toLocaleString()} cached` : ""}
        </text>
      )}
    </box>
  );
}
