// Compaction thresholds — configurable via env vars for demo/testing
export const PRUNE_MINIMUM = Number(process.env.PRUNE_MINIMUM) || 20_000;
export const PRUNE_PROTECT = Number(process.env.PRUNE_PROTECT) || 40_000;
export const OUTPUT_TOKEN_MAX = Number(process.env.OUTPUT_TOKEN_MAX) || 32_000;

// Agent defaults
export const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
export const MAX_STEPS = 25;

// Available models
export const AVAILABLE_MODELS = [
  // Anthropic
  "claude-opus-4-6",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
  // OpenAI - GPT
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  // OpenAI - Reasoning
  "o3",
  "o3-mini",
  "o4-mini",
] as const;

// Context window sizes per model
// Set CONTEXT_WINDOW_OVERRIDE to override all models (useful for demo)
const CONTEXT_WINDOW_OVERRIDE = Number(process.env.CONTEXT_WINDOW_OVERRIDE) || 0;

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = CONTEXT_WINDOW_OVERRIDE
  ? Object.fromEntries(AVAILABLE_MODELS.map((m) => [m, CONTEXT_WINDOW_OVERRIDE]))
  : {
      "claude-opus-4-6": 200_000,
      "claude-sonnet-4-5-20250929": 200_000,
      "claude-haiku-4-5-20251001": 200_000,
      "gpt-4.1": 1_047_576,
      "gpt-4.1-mini": 1_047_576,
      "gpt-4.1-nano": 1_047_576,
      o3: 200_000,
      "o3-mini": 200_000,
      "o4-mini": 200_000,
    };

export const DEFAULT_CONTEXT_WINDOW = CONTEXT_WINDOW_OVERRIDE || 200_000;

// API defaults
export const API_PORT = 5001;
export const API_BASE_URL = `http://localhost:${API_PORT}`;
