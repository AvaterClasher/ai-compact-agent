import { z } from "zod";

export const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DATABASE_PATH: z.string().default("./data/agent.db"),
  PORT: z.coerce.number().default(5001),
});

export type EnvConfig = z.infer<typeof envSchema>;
