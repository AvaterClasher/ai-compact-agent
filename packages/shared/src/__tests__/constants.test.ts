import { describe, expect, test } from "bun:test";
import {
  API_PORT,
  DEFAULT_MODEL,
  MAX_STEPS,
  OUTPUT_TOKEN_MAX,
  PRUNE_MINIMUM,
  PRUNE_PROTECT,
} from "../constants.js";

describe("constants", () => {
  test("PRUNE_MINIMUM is 20000", () => expect(PRUNE_MINIMUM).toBe(20_000));
  test("PRUNE_PROTECT is 40000", () => expect(PRUNE_PROTECT).toBe(40_000));
  test("OUTPUT_TOKEN_MAX is 32000", () => expect(OUTPUT_TOKEN_MAX).toBe(32_000));
  test("MAX_STEPS is 25", () => expect(MAX_STEPS).toBe(25));
  test("DEFAULT_MODEL is claude-sonnet-4-5", () =>
    expect(DEFAULT_MODEL).toBe("claude-sonnet-4-5-20250929"));
  test("API_PORT is 3001", () => expect(API_PORT).toBe(3001));
});
