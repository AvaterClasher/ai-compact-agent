// Compaction thresholds (OpenCode strategy)
export const PRUNE_MINIMUM = 20_000;
export const PRUNE_PROTECT = 40_000;
export const OUTPUT_TOKEN_MAX = 32_000;

// Agent defaults
export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const MAX_STEPS = 25;

// API defaults
export const API_PORT = 3001;
export const API_BASE_URL = `http://localhost:${API_PORT}`;
