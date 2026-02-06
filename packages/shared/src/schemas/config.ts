import { z } from "zod";

export const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  DATABASE_PATH: z.string().default("./data/agent.db"),
  PORT: z.coerce.number().default(3001),
});

export type EnvConfig = z.infer<typeof envSchema>;
