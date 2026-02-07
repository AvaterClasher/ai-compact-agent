import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { AVAILABLE_MODELS } from "@repo/shared";
import type { LanguageModel } from "ai";
import { wrapAISDKModel } from "axiom/ai";

export function isOpenAIModel(model: string): boolean {
  return model.startsWith("gpt-") || /^o\d/.test(model);
}

/**
 * Resolve a model string to the appropriate AI SDK provider instance.
 * Wrapped with Axiom tracing for automatic prompt/completion/token observability.
 *
 * - Strings starting with "gpt-" or "o" (o1, o3, o4-mini, etc.) → OpenAI
 * - Everything else → Anthropic (default)
 */
export function resolveModel(model: string): LanguageModel {
  if (isOpenAIModel(model)) {
    return wrapAISDKModel(openai(model));
  }
  return wrapAISDKModel(anthropic(model));
}

/** Return the default model based on which API keys are configured. */
export function getDefaultModel(): string {
  if (process.env.ANTHROPIC_API_KEY) return "claude-sonnet-4-5-20250929";
  return "gpt-4.1-nano";
}

/** Filter AVAILABLE_MODELS to only those with a configured API key. */
export function getAvailableModels(): string[] {
  return AVAILABLE_MODELS.filter((m) => {
    if (isOpenAIModel(m)) return !!process.env.OPENAI_API_KEY;
    return !!process.env.ANTHROPIC_API_KEY;
  });
}
