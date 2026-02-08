import type { UIMessage } from "ai";
import type { Message } from "./types/message.js";

/**
 * Convert DB messages (with parts) to AI SDK UIMessage format for useChat.
 *
 * Tool-call + tool-result pairs are folded into a single `dynamic-tool` part
 * on the assistant message. Standalone `tool` role messages are filtered out
 * since their data already lives in the assistant's message parts.
 */
export function dbMessagesToUIMessages(messages: Message[]): UIMessage[] {
  return messages
    .filter((m) => m.role !== "tool")
    .map((msg) => {
      if (msg.role === "user" || msg.role === "system") {
        return {
          id: msg.id,
          role: msg.role,
          parts: [{ type: "text" as const, text: msg.content }],
        };
      }

      // Assistant message — build parts from MessagePart[]
      const parts: UIMessage["parts"] = [];
      const msgParts = msg.parts ?? [];

      for (const part of msgParts) {
        switch (part.type) {
          case "reasoning":
            parts.push({ type: "reasoning" as const, text: part.content });
            break;

          case "tool-call": {
            const result = msgParts.find(
              (p) => p.type === "tool-result" && p.toolCallId === part.toolCallId,
            );
            if (result) {
              // Check if the result is an error
              let isError = false;
              try {
                const output = JSON.parse(result.content);
                if (
                  output?.error ||
                  (typeof output === "object" && output !== null && "error" in output)
                ) {
                  isError = true;
                }
              } catch {
                // not JSON, treat as success
              }

              if (isError) {
                parts.push({
                  type: "dynamic-tool" as const,
                  toolName: part.toolName ?? "",
                  toolCallId: part.toolCallId ?? "",
                  state: "output-error" as const,
                  input: safeJsonParse(part.content),
                  errorText: extractErrorText(result.content) ?? "Tool execution failed",
                });
              } else {
                parts.push({
                  type: "dynamic-tool" as const,
                  toolName: part.toolName ?? "",
                  toolCallId: part.toolCallId ?? "",
                  state: "output-available" as const,
                  input: safeJsonParse(part.content),
                  output: safeJsonParse(result.content),
                });
              }
            } else {
              parts.push({
                type: "dynamic-tool" as const,
                toolName: part.toolName ?? "",
                toolCallId: part.toolCallId ?? "",
                state: "input-available" as const,
                input: safeJsonParse(part.content),
              });
            }
            break;
          }

          case "tool-result":
            // Handled above as part of tool-call matching
            break;

          case "text":
            parts.push({ type: "text" as const, text: part.content });
            break;

          case "compaction":
            // Show compaction summaries as text
            parts.push({ type: "text" as const, text: part.content });
            break;
        }
      }

      // Fallback: if no parts but has content string
      if (parts.length === 0 && msg.content) {
        parts.push({ type: "text" as const, text: msg.content });
      }

      return {
        id: msg.id,
        role: "assistant" as const,
        parts,
      };
    });
}

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function extractErrorText(content: string): string | null {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed?.error === "string") return parsed.error;
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      return String(parsed.error);
    }
  } catch {
    // not JSON
  }
  return null;
}
