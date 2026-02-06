import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { messagesRouter } from "./routes/messages.js";
import { sessionsRouter } from "./routes/sessions.js";
import { streamRouter } from "./routes/stream.js";

// Run migrations on startup
import "./db/migrate.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

// API routes
app.route("/api/sessions", sessionsRouter);
app.route("/api/messages", messagesRouter);
app.route("/api/stream", streamRouter);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT) || 3001;

console.log(`API server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
