import type { Session } from "@repo/shared";

interface SessionPickerProps {
  sessions: Session[];
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function SessionPicker({ sessions, onSelect, onNew }: SessionPickerProps) {
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
            onSelect(String(option.value));
          }
        }}
        focused
      />
    </box>
  );
}
