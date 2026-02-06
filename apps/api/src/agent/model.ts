import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Resolve a model string to the appropriate AI SDK provider instance.
 *
 * - Strings starting with "gpt-" or "o" (o1, o3, o4-mini, etc.) → OpenAI
 * - Everything else → Anthropic (default)
 */
export function resolveModel(model: string): LanguageModel {
  if (model.startsWith("gpt-") || /^o\d/.test(model)) {
    return openai(model);
  }
  return anthropic(model);
}
