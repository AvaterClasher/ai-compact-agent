import type { Message } from "@repo/shared";

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <scrollbox flexGrow={1} focused>
      {messages.map((msg) => (
        <box key={msg.id} paddingLeft={1} paddingRight={1} marginBottom={1}>
          <text
            fg={msg.role === "user" ? "#3b82f6" : msg.role === "system" ? "#a1a1aa" : "#22c55e"}
          >
            <strong>
              {msg.role === "user" ? "You" : msg.role === "system" ? "System" : "Agent"}
            </strong>
          </text>
          <text fg="#fafafa"> {msg.content}</text>
        </box>
      ))}
    </scrollbox>
  );
}
