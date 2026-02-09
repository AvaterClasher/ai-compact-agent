import { describe, expect, test } from "bun:test";
import { DEFAULT_CONTEXT_WINDOW, MODEL_CONTEXT_WINDOWS, OUTPUT_TOKEN_MAX } from "@repo/shared";
import { isOverflow } from "../../compaction/index.js";

// Derive thresholds from actual constants so tests work regardless of env overrides
const defaultThreshold = DEFAULT_CONTEXT_WINDOW - OUTPUT_TOKEN_MAX;
const gpt41Threshold =
  (MODEL_CONTEXT_WINDOWS["gpt-4.1"] || DEFAULT_CONTEXT_WINDOW) - OUTPUT_TOKEN_MAX;

describe("isOverflow", () => {
  test("returns false when well under limit", () => {
    expect(
      isOverflow({ input: 1000, output: 500, reasoning: 0, cacheRead: 0, cacheWrite: 0 }),
    ).toBe(false);
  });

  test("returns true when input + cacheRead + output exceeds threshold", () => {
    expect(
      isOverflow({
        input: defaultThreshold,
        output: 1,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      }),
    ).toBe(true);
  });

  test("returns false at exactly the boundary", () => {
    // threshold is NOT > threshold (strict >)
    expect(
      isOverflow({
        input: defaultThreshold,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      }),
    ).toBe(false);
  });

  test("respects model-specific context window", () => {
    expect(
      isOverflow(
        { input: gpt41Threshold - 1, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        "gpt-4.1",
      ),
    ).toBe(false);

    expect(
      isOverflow(
        { input: gpt41Threshold + 1, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        "gpt-4.1",
      ),
    ).toBe(true);
  });

  test("falls back to default context window for unknown model", () => {
    expect(
      isOverflow(
        { input: defaultThreshold + 1, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        "unknown-model",
      ),
    ).toBe(true);
  });

  test("uses default context window when no model provided", () => {
    expect(
      isOverflow({
        input: defaultThreshold + 1,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      }),
    ).toBe(true);
  });

  test("ignores reasoning and cacheWrite in calculation", () => {
    expect(
      isOverflow({
        input: 1000,
        output: 500,
        reasoning: 999_999,
        cacheRead: 0,
        cacheWrite: 999_999,
      }),
    ).toBe(false);
  });
});
