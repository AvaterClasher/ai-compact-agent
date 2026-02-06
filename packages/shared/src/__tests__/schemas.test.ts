import { describe, expect, test } from "bun:test";
import { envSchema } from "../schemas/config.js";
import { sendMessageSchema } from "../schemas/message.js";
import { createSessionSchema, updateSessionSchema } from "../schemas/session.js";

describe("createSessionSchema", () => {
  test("accepts empty object (all fields optional)", () => {
    expect(createSessionSchema.safeParse({}).success).toBe(true);
  });

  test("accepts valid title and model", () => {
    const result = createSessionSchema.safeParse({
      title: "My Session",
      model: "claude-sonnet-4-20250514",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty string title", () => {
    const result = createSessionSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  test("rejects title exceeding 200 chars", () => {
    const result = createSessionSchema.safeParse({ title: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  test("accepts title at exactly 200 chars", () => {
    const result = createSessionSchema.safeParse({ title: "x".repeat(200) });
    expect(result.success).toBe(true);
  });
});

describe("updateSessionSchema", () => {
  test("accepts valid status values", () => {
    for (const status of ["active", "compacting", "archived"] as const) {
      expect(updateSessionSchema.safeParse({ status }).success).toBe(true);
    }
  });

  test("rejects invalid status", () => {
    expect(updateSessionSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });

  test("accepts empty object", () => {
    expect(updateSessionSchema.safeParse({}).success).toBe(true);
  });
});

describe("sendMessageSchema", () => {
  test("accepts non-empty content", () => {
    expect(sendMessageSchema.safeParse({ content: "Hello" }).success).toBe(true);
  });

  test("rejects empty content", () => {
    expect(sendMessageSchema.safeParse({ content: "" }).success).toBe(false);
  });

  test("rejects missing content", () => {
    expect(sendMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("envSchema", () => {
  test("requires ANTHROPIC_API_KEY", () => {
    expect(envSchema.safeParse({}).success).toBe(false);
  });

  test("applies defaults for DATABASE_PATH and PORT", () => {
    const result = envSchema.parse({ ANTHROPIC_API_KEY: "sk-test-key" });
    expect(result.DATABASE_PATH).toBe("./data/agent.db");
    expect(result.PORT).toBe(3001);
  });

  test("coerces PORT from string to number", () => {
    const result = envSchema.parse({
      ANTHROPIC_API_KEY: "sk-test",
      PORT: "8080",
    });
    expect(result.PORT).toBe(8080);
  });
});
