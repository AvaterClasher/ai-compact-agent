import { useKeyboard } from "@opentui/react";
import type { Session } from "@repo/shared";
import { useState } from "react";

type Mode = "select" | "actions" | "confirm-delete" | "rename";

interface SessionPickerProps {
  sessions: Session[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function SessionPicker({
  sessions,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: SessionPickerProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [targetSession, setTargetSession] = useState<Session | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useKeyboard((key) => {
    if (mode === "confirm-delete" && targetSession) {
      if (key.name === "y") {
        onDelete(targetSession.id);
        setTargetSession(null);
        setMode("select");
      } else {
        setMode("actions");
      }
    }
  });

  if (mode === "confirm-delete" && targetSession) {
    return (
      <box flexDirection="column" padding={1}>
        <text fg="#ef4444">
          <strong>Delete &quot;{targetSession.title}&quot;? (y/n)</strong>
        </text>
      </box>
    );
  }

  if (mode === "rename" && targetSession) {
    return (
      <box flexDirection="column" padding={1}>
        <text fg="#fafafa">
          <strong>Rename session:</strong>
        </text>
        <box marginTop={1}>
          <input
            value={renameValue}
            onChange={setRenameValue}
            onSubmit={() => {
              const trimmed = renameValue.trim();
              if (trimmed && trimmed !== targetSession.title) {
                onRename(targetSession.id, trimmed);
              }
              setTargetSession(null);
              setMode("select");
            }}
            focused
            placeholder="Enter new title..."
          />
        </box>
        <text fg="#a1a1aa"> Press Enter to save, Escape to cancel</text>
      </box>
    );
  }

  if (mode === "actions" && targetSession) {
    const actionOptions = [
      { name: "Open", description: "Open this session", value: "open" },
      { name: "Rename", description: "Change session title", value: "rename" },
      { name: "Delete", description: "Delete this session", value: "delete" },
      { name: "Back", description: "Return to session list", value: "back" },
    ];

    return (
      <box flexDirection="column" padding={1}>
        <text fg="#fafafa">
          <strong>Session: {targetSession.title}</strong>
        </text>
        <select
          options={actionOptions}
          onSelect={(_i, opt) => {
            if (!opt) return;
            switch (opt.value) {
              case "open":
                onSelect(targetSession.id);
                setTargetSession(null);
                setMode("select");
                break;
              case "rename":
                setRenameValue(targetSession.title);
                setMode("rename");
                break;
              case "delete":
                setMode("confirm-delete");
                break;
              case "back":
                setTargetSession(null);
                setMode("select");
                break;
            }
          }}
          focused
        />
      </box>
    );
  }

  // Default: session list
  const options = [
    { name: "+ New Session", description: "Create a new agent session", value: "__new__" },
    ...sessions.map((s) => ({
      name: s.title,
      description: new Date(s.createdAt).toLocaleDateString(),
      value: s.id,
    })),
  ];

  return (
    <box flexDirection="column" padding={1}>
      <text fg="#fafafa">
        <strong>Select a session:</strong>
      </text>
      <select
        options={options}
        onSelect={(_index, option) => {
          if (!option) return;
          if (option.value === "__new__") {
            onNew();
          } else {
            const found = sessions.find((s) => s.id === String(option.value));
            if (found) {
              setTargetSession(found);
              setMode("actions");
            }
          }
        }}
        focused
      />
    </box>
  );
}
