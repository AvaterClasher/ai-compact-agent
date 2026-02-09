import {
  createSessionSchema,
  deleteSuccessResponseSchema,
  errorResponseSchema,
  generateTitleResponseSchema,
  sessionResponseSchema,
  sessions,
  updateSessionSchema,
} from "@repo/shared";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDefaultModel } from "../agent/model.js";
import { generateSessionTitle } from "../agent/title.js";
import { db } from "../db/client.js";
import { cleanupContainer } from "../docker/sandbox-pool.js";

export const sessionsRouter = new Hono();

// GET /api/sessions - List all sessions
sessionsRouter.get(
  "/",
  describeRoute({
    tags: ["Sessions"],
    summary: "List all sessions",
    responses: {
      200: {
        description: "Array of sessions ordered by most recently updated",
        content: {
          "application/json": {
            schema: resolver(z.array(sessionResponseSchema)),
          },
        },
      },
    },
  }),
  async (c) => {
    const result = await db.select().from(sessions).orderBy(desc(sessions.updatedAt));
    return c.json(result);
  },
);

// POST /api/sessions - Create a new session
sessionsRouter.post(
  "/",
  describeRoute({
    tags: ["Sessions"],
    summary: "Create a new session",
    requestBody: {
      content: {
        "application/json": {
          schema: resolver(createSessionSchema) as never,
        },
      },
    },
    responses: {
      201: {
        description: "Created session",
        content: {
          "application/json": {
            schema: resolver(sessionResponseSchema),
          },
        },
      },
      400: {
        description: "Validation error",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
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
  },
);

// GET /api/sessions/:id - Get session details
sessionsRouter.get(
  "/:id",
  describeRoute({
    tags: ["Sessions"],
    summary: "Get session details",
    responses: {
      200: {
        description: "Session details",
        content: {
          "application/json": {
            schema: resolver(sessionResponseSchema),
          },
        },
      },
      404: {
        description: "Session not found",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json(session);
  },
);

// PATCH /api/sessions/:id - Update session
sessionsRouter.patch(
  "/:id",
  describeRoute({
    tags: ["Sessions"],
    summary: "Update session",
    requestBody: {
      content: {
        "application/json": {
          schema: resolver(updateSessionSchema) as never,
        },
      },
    },
    responses: {
      200: {
        description: "Updated session",
        content: {
          "application/json": {
            schema: resolver(sessionResponseSchema),
          },
        },
      },
      400: {
        description: "Validation error",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      404: {
        description: "Session not found",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
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
  },
);

// POST /api/sessions/:id/generate-title - Generate title from first message
sessionsRouter.post(
  "/:id/generate-title",
  describeRoute({
    tags: ["Sessions"],
    summary: "Generate title from first message",
    requestBody: {
      content: {
        "application/json": {
          schema: resolver(z.object({ message: z.string() })) as never,
        },
      },
    },
    responses: {
      200: {
        description: "Title generation accepted or skipped",
        content: {
          "application/json": {
            schema: resolver(generateTitleResponseSchema),
          },
        },
      },
      400: {
        description: "Missing message",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      404: {
        description: "Session not found",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
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
  },
);

// DELETE /api/sessions/:id - Delete session
sessionsRouter.delete(
  "/:id",
  describeRoute({
    tags: ["Sessions"],
    summary: "Delete session",
    responses: {
      200: {
        description: "Session deleted",
        content: {
          "application/json": {
            schema: resolver(deleteSuccessResponseSchema),
          },
        },
      },
      404: {
        description: "Session not found",
        content: {
          "application/json": {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const id = c.req.param("id");

    const [existing] = await db.select().from(sessions).where(eq(sessions.id, id));

    if (!existing) {
      return c.json({ error: "Session not found" }, 404);
    }

    await db.delete(sessions).where(eq(sessions.id, id));

    // Clean up Docker sandbox container if one exists
    cleanupContainer(id).catch(() => {});

    return c.json({ success: true });
  },
);
