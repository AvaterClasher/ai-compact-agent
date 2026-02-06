import type { Session, CreateSessionInput, UpdateSessionInput } from "./types/session.js";
import type { Message, SendMessageInput } from "./types/message.js";
import type { SSEEvent } from "./types/agent.js";
import { API_BASE_URL } from "./constants.js";

export class AgentAPIClient {
  private baseUrl: string;

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  async listSessions(): Promise<Session[]> {
    return this.fetch<Session[]>("/api/sessions");
  }

  async createSession(input?: CreateSessionInput): Promise<Session> {
    return this.fetch<Session>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(input || {}),
    });
  }

  async getSession(id: string): Promise<Session> {
    return this.fetch<Session>(`/api/sessions/${id}`);
  }

  async updateSession(id: string, input: UpdateSessionInput): Promise<Session> {
    return this.fetch<Session>(`/api/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async deleteSession(id: string): Promise<void> {
    await this.fetch(`/api/sessions/${id}`, { method: "DELETE" });
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    return this.fetch<Message[]>(`/api/messages/${sessionId}`);
  }

  /**
   * Send a message and receive streamed SSE events.
   * Returns an async generator of SSEEvent objects.
   */
  async *streamMessage(
    sessionId: string,
    input: SendMessageInput
  ): AsyncGenerator<SSEEvent> {
    const res = await fetch(`${this.baseUrl}/api/stream/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
    }

    if (!res.body) {
      throw new Error("No response body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      let currentData = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "" && currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData);
            yield { type: currentEvent, data } as SSEEvent;
          } catch {
            // Skip malformed events
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }
  }
}
