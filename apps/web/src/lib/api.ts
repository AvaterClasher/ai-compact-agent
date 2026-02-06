import { AgentAPIClient } from "@repo/shared/api-client";

export const api = new AgentAPIClient(
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
);
