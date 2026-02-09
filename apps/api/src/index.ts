// Instrumentation MUST be imported first before any other module

import { healthResponseSchema, modelsResponseSchema } from "@repo/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";
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
app.get(
  "/api/health",
  describeRoute({
    tags: ["System"],
    summary: "Health check",
    responses: {
      200: {
        description: "Server health status and sandbox info",
        content: {
          "application/json": {
            schema: resolver(healthResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    const sandbox = getSandboxStatus();
    return c.json({ status: "ok", sandbox });
  },
);

// Available models (filtered by configured API keys)
app.get(
  "/api/models",
  describeRoute({
    tags: ["System"],
    summary: "List available models",
    responses: {
      200: {
        description: "Available models and default model",
        content: {
          "application/json": {
            schema: resolver(modelsResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json({ models: getAvailableModels(), default: getDefaultModel() });
  },
);

// OpenAPI JSON spec
app.get(
  "/api/doc",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "Exo API",
        version: "1.0.0",
        description: "Context-compacting coding agent API",
      },
      servers: [{ url: "http://localhost:5001" }],
      tags: [
        { name: "Sessions", description: "Session management" },
        { name: "Messages", description: "Message history" },
        { name: "Streaming", description: "Real-time message streaming" },
        { name: "System", description: "Health and configuration" },
      ],
    },
  }),
);

// Swagger UI
app.get("/api/reference", (c) => {
  return c.html(`<!DOCTYPE html>
<html>
  <head>
    <title>Exo API Reference</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: "/api/doc", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`);
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
