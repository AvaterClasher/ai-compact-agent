import { AgentAPIClient } from "@repo/shared/api-client";

const defaultUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export let api = new AgentAPIClient(defaultUrl);

export function setApiEndpoint(url: string) {
  api = new AgentAPIClient(url);
}
