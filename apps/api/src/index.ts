// Instrumentation MUST be imported first before any other module

import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAvailableModels, getDefaultModel } from "./agent/model.js";
import { ensureImage, getSandboxStatus } from "./docker/manager.js";
import { cleanupAllContainers } from "./docker/sandbox-pool.js";
import { sdk } from "./instrumentation.js";
import { logger } from "./logger.js";
import { tracingMiddleware } from "./middleware/tracing.js";
import { messagesRouter } from "./routes/messages.js";
import { sessionsRouter } from "./routes/sessions.js";
import { streamRouter } from "./routes/stream.js";

// Run migrations on startup
import "./db/migrate.js";

const app = new Hono();

app.use("*", tracingMiddleware());
app.use("*", cors());

// API routes
app.route("/api/sessions", sessionsRouter);
app.route("/api/messages", messagesRouter);
app.route("/api/stream", streamRouter);

// Health check
app.get("/api/health", (c) => {
  const sandbox = getSandboxStatus();
  return c.json({ status: "ok", sandbox });
});

// Available models (filtered by configured API keys)
app.get("/api/models", (c) => {
  return c.json({ models: getAvailableModels(), default: getDefaultModel() });
});

const port = Number(process.env.PORT) || 5001;

logger.info("API server starting", { port });

// Ensure the sandbox Docker image exists (auto-builds on first run)
try {
  await ensureImage();
} catch (error) {
  logger.error("Failed to ensure sandbox Docker image. Tool execution will fail.", {
    error: (error as Error).message,
  });
}

// Graceful shutdown — flush pending spans and clean up containers
process.on("SIGTERM", async () => {
  await cleanupAllContainers();
  await sdk.shutdown();
  process.exit(0);
});

export default {
  port,
  fetch: app.fetch,
};
