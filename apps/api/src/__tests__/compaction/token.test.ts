import { describe, expect, test } from "bun:test";
import { estimateTokens } from "../../compaction/token.js";

describe("estimateTokens", () => {
  test("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("returns 1 for single character", () => {
    expect(estimateTokens("a")).toBe(1);
  });

  test("returns ceil(length / 4) for ASCII text", () => {
    expect(estimateTokens("abcd")).toBe(1); // 4/4 = 1
    expect(estimateTokens("abcde")).toBe(2); // 5/4 = 1.25 -> 2
    expect(estimateTokens("Hello, world!")).toBe(4); // 13/4 = 3.25 -> 4
  });

  test("handles large content", () => {
    const large = "x".repeat(10000);
    expect(estimateTokens(large)).toBe(2500);
  });
});
