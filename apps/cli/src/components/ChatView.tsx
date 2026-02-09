import { useAgent } from "../hooks/useAgent.js";
import { InputBar } from "./InputBar.js";
import { MessageList } from "./MessageList.js";
import { Spinner } from "./Spinner.js";

interface ChatViewProps {
  sessionId: string;
  onTitleGenerated?: () => void;
}

export function ChatView({ sessionId, onTitleGenerated }: ChatViewProps) {
  const { messages, isStreaming, sendMessage } = useAgent(sessionId, onTitleGenerated);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <MessageList messages={messages} />

      {isStreaming && (
        <box paddingLeft={1}>
          <Spinner />
          <text fg="#a1a1aa"> Thinking...</text>
        </box>
      )}

      <InputBar onSubmit={sendMessage} disabled={isStreaming} />
    </box>
  );
}
