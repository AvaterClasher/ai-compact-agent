import { API_BASE_URL } from "./constants.js";
import type { Message } from "./types/message.js";
import type { CreateSessionInput, Session, UpdateSessionInput } from "./types/session.js";

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

  async generateTitle(sessionId: string, message: string): Promise<void> {
    await this.fetch(`/api/sessions/${sessionId}/generate-title`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  async getModels(): Promise<{ models: string[]; default: string }> {
    return this.fetch("/api/models");
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    return this.fetch<Message[]>(`/api/messages/${sessionId}`);
  }
}
