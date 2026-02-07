import { describe, expect, test } from "bun:test";
import { isOverflow } from "../../compaction/index.js";

describe("isOverflow", () => {
  test("returns false when well under limit", () => {
    expect(
      isOverflow({ input: 1000, output: 500, reasoning: 0, cacheRead: 0, cacheWrite: 0 }),
    ).toBe(false);
  });

  test("returns true when input + cacheRead + output exceeds threshold", () => {
    // Default threshold = 200_000 - 32_000 = 168_000
    expect(
      isOverflow({
        input: 100_000,
        output: 50_000,
        reasoning: 0,
        cacheRead: 20_000,
        cacheWrite: 0,
      }),
    ).toBe(true); // 170_000 > 168_000
  });

  test("returns false at exactly the boundary", () => {
    // 168_000 is NOT > 168_000 (strict >)
    expect(
      isOverflow({
        input: 100_000,
        output: 48_000,
        reasoning: 0,
        cacheRead: 20_000,
        cacheWrite: 0,
      }),
    ).toBe(false);
  });

  test("respects model-specific context window", () => {
    // gpt-4.1 has 1_047_576 context window → threshold = 1_047_576 - 32_000 = 1_015_576
    expect(
      isOverflow(
        { input: 50_000, output: 30_000, reasoning: 0, cacheRead: 10_000, cacheWrite: 0 },
        "gpt-4.1",
      ),
    ).toBe(false); // 90_000 < 1_015_576

    expect(
      isOverflow(
        { input: 500_000, output: 300_000, reasoning: 0, cacheRead: 250_000, cacheWrite: 0 },
        "gpt-4.1",
      ),
    ).toBe(true); // 1_050_000 > 1_015_576
  });

  test("falls back to default context window for unknown model", () => {
    // Unknown model → 200_000 - 32_000 = 168_000
    expect(
      isOverflow(
        { input: 100_000, output: 50_000, reasoning: 0, cacheRead: 20_000, cacheWrite: 0 },
        "unknown-model",
      ),
    ).toBe(true); // 170_000 > 168_000
  });

  test("uses default context window when no model provided", () => {
    // No model → 200_000 - 32_000 = 168_000
    expect(
      isOverflow({
        input: 100_000,
        output: 50_000,
        reasoning: 0,
        cacheRead: 20_000,
        cacheWrite: 0,
      }),
    ).toBe(true); // 170_000 > 168_000
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
