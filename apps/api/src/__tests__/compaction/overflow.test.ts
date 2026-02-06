import { describe, expect, test } from "bun:test";
import { isOverflow } from "../../compaction/index.js";

describe("isOverflow", () => {
  test("returns false when well under limit", () => {
    expect(
      isOverflow({ input: 1000, output: 500, reasoning: 0, cacheRead: 0, cacheWrite: 0 }),
    ).toBe(false);
  });

  test("returns true when input + cacheRead + output exceeds threshold", () => {
    // Threshold = 200_000 - 32_000 = 168_000
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

  test("respects custom contextWindow parameter", () => {
    expect(
      isOverflow(
        { input: 50_000, output: 30_000, reasoning: 0, cacheRead: 10_000, cacheWrite: 0 },
        100_000,
      ),
    ).toBe(true); // 90_000 > 100_000 - 32_000 = 68_000
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
