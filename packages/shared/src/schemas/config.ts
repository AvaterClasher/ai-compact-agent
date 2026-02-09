import { z } from "zod";

export const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DATABASE_PATH: z.string().default("./data/agent.db"),
  PORT: z.coerce.number().default(5001),

  // Docker DB volume: persist SQLite in a Docker-managed volume (default: true)
  DOCKER_DB: z.coerce.boolean().default(true),

  // OpenTelemetry + Axiom (optional - for distributed tracing)
  AXIOM_API_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().default("backend-traces"),
  AXIOM_OTLP_ENDPOINT: z.string().default("https://api.axiom.co/v1/traces"),
  OTEL_SERVICE_NAME: z.string().default("backend"),
});

export type EnvConfig = z.infer<typeof envSchema>;
