import { DefaultChatTransport } from "ai";

const defaultUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

/**
 * Create a chat transport for a specific session.
 * Sends only `{ content }` to `/api/stream/:sessionId` — the server
 * loads conversation history from DB so we don't need to send messages.
 */
export function createSessionTransport(sessionId: string, apiBaseUrl = defaultUrl) {
  return new DefaultChatTransport({
    api: `${apiBaseUrl}/api/stream/${sessionId}`,
    prepareSendMessagesRequest: ({ messages }) => {
      const lastMessage = messages[messages.length - 1];
      const textPart = lastMessage?.parts.find(
        (p): p is Extract<(typeof lastMessage.parts)[number], { type: "text" }> =>
          p.type === "text",
      );
      return {
        body: { content: textPart?.text ?? "" },
      };
    },
  });
}
