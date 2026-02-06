import { createSessionSchema, sessions, updateSessionSchema } from "@repo/shared";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { getAvailableModels, getDefaultModel } from "../agent/model.js";
import { generateSessionTitle } from "../agent/title.js";
import { db } from "../db/client.js";

export const sessionsRouter = new Hono();

// GET /api/sessions - List all sessions
sessionsRouter.get("/", async (c) => {
  const result = await db.select().from(sessions).orderBy(desc(sessions.updatedAt));

  return c.json(result);
});

// POST /api/sessions - Create a new session
sessionsRouter.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const id = nanoid();
  const now = new Date();

  await db.insert(sessions).values({
    id,
    title: parsed.data.title || "New Session",
    model: parsed.data.model || getDefaultModel(),
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));

  return c.json(session, 201);
});

// GET /api/sessions/:id - Get session details
sessionsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json(session);
});

// PATCH /api/sessions/:id - Update session
sessionsRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const [existing] = await db.select().from(sessions).where(eq(sessions.id, id));

  if (!existing) {
    return c.json({ error: "Session not found" }, 404);
  }

  await db
    .update(sessions)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(sessions.id, id));

  const [updated] = await db.select().from(sessions).where(eq(sessions.id, id));

  return c.json(updated);
});

// POST /api/sessions/:id/generate-title - Generate title from first message
sessionsRouter.post("/:id/generate-title", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const message = body.message as string;

  if (!message || typeof message !== "string") {
    return c.json({ error: "message is required" }, 400);
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (session.title !== "New Session") {
    return c.json({ accepted: false, reason: "Title already set" });
  }

  // Fire-and-forget
  generateSessionTitle(id, message);

  return c.json({ accepted: true });
});

// DELETE /api/sessions/:id - Delete session
sessionsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const [existing] = await db.select().from(sessions).where(eq(sessions.id, id));

  if (!existing) {
    return c.json({ error: "Session not found" }, 404);
  }

  await db.delete(sessions).where(eq(sessions.id, id));

  return c.json({ success: true });
});
