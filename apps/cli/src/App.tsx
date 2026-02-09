import { useKeyboard, useRenderer } from "@opentui/react";
import { useState } from "react";
import { ChatView } from "./components/ChatView.js";
import { SessionPicker } from "./components/SessionPicker.js";
import { StatusBar } from "./components/StatusBar.js";
import { useSession } from "./hooks/useSession.js";

export function App() {
  const renderer = useRenderer();
  const [view, setView] = useState<"picker" | "chat">("picker");
  const {
    session,
    sessions,
    selectSession,
    createSession,
    deleteSession,
    updateSession,
    refreshSession,
    tokenUsage,
  } = useSession();

  useKeyboard((key) => {
    if (key.name === "escape") {
      if (view === "chat") {
        setView("picker");
      } else {
        renderer.destroy();
      }
    }
    if (key.ctrl && key.name === "n") {
      createSession().then(() => setView("chat"));
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box border borderStyle="rounded" borderColor="#3b82f6" padding={1}>
        <text fg="#3b82f6">
          <strong>Exo</strong>
        </text>
        <text fg="#a1a1aa"> - Context-Compacting Agent</text>
      </box>

      <box flexGrow={1}>
        {view === "picker" ? (
          <SessionPicker
            sessions={sessions}
            onSelect={(id) => {
              selectSession(id);
              setView("chat");
            }}
            onNew={async () => {
              await createSession();
              setView("chat");
            }}
            onDelete={async (id) => {
              await deleteSession(id);
            }}
            onRename={async (id, title) => {
              await updateSession(id, title);
            }}
          />
        ) : session ? (
          <ChatView sessionId={session.id} onTitleGenerated={() => refreshSession(session.id)} />
        ) : null}
      </box>

      <StatusBar usage={tokenUsage} sessionTitle={session?.title} />
    </box>
  );
}
