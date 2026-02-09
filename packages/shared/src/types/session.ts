export type SessionStatus = "active" | "compacting" | "archived";

export interface Session {
  id: string;
  title: string;
  model: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreateSessionInput {
  title?: string;
  model?: string;
}

export interface UpdateSessionInput {
  title?: string;
  model?: string;
  status?: SessionStatus;
}
