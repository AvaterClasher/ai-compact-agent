/**
 * Estimate token count from text content.
 * Uses the simple 4-chars-per-token heuristic (OpenCode strategy).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
