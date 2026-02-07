import { beforeEach, describe, expect, mock, test } from "bun:test";
import { insertSession } from "../helpers/factories.js";
import { createTestDB, type TestDB } from "../helpers/test-db.js";

// Use a proxy so all db method calls forward to the current testDb at call time
let testDb: TestDB;
const dbProxy = new Proxy(
  {},
  {
    get(_, prop) {
      return (testDb as never)[prop];
    },
  },
);

mock.module("../../db/client.js", () => ({ db: dbProxy }));
mock.module("../../db/migrate.js", () => ({}));
mock.module("../../docker/manager.js", () => ({
  ensureImage: async () => {},
  getSandboxStatus: () => ({ status: "ready", error: null }),
}));
mock.module("../../docker/sandbox-pool.js", () => ({
  cleanupContainer: async () => {},
  cleanupAllContainers: async () => {},
}));

const { default: appModule } = await import("../../index.js");
const app = {
  request: async (path: string, init?: RequestInit) =>
    appModule.fetch(new Request(`http://localhost${path}`, init), {}),
};

describe("sessions routes", () => {
  beforeEach(() => {
    testDb = createTestDB();
  });

  describe("GET /api/sessions", () => {
    test("returns empty array initially", async () => {
      const res = await app.request("/api/sessions");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    test("returns sessions ordered by updatedAt desc", async () => {
      await insertSession(testDb, {
        title: "Old",
        updatedAt: new Date("2024-01-01"),
      });
      await insertSession(testDb, {
        title: "New",
        updatedAt: new Date("2024-06-01"),
      });

      const res = await app.request("/api/sessions");
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].title).toBe("New");
      expect(body[1].title).toBe("Old");
    });
  });

  describe("POST /api/sessions", () => {
    test("creates session with defaults", async () => {
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe("New Session");
      expect(body.status).toBe("active");
      expect(body.id).toBeTruthy();
    });

    test("creates session with custom title", async () => {
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "My Project" }),
      });
      expect(res.status).toBe(201);
      expect((await res.json()).title).toBe("My Project");
    });

    test("returns 400 for invalid title (too long)", async () => {
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x".repeat(201) }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/sessions/:id", () => {
    test("returns session by ID", async () => {
      const session = await insertSession(testDb, { title: "Found" });
      const res = await app.request(`/api/sessions/${session.id}`);
      expect(res.status).toBe(200);
      expect((await res.json()).title).toBe("Found");
    });

    test("returns 404 for non-existent session", async () => {
      const res = await app.request("/api/sessions/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/sessions/:id", () => {
    test("updates session title", async () => {
      const session = await insertSession(testDb);
      const res = await app.request(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).title).toBe("Updated");
    });

    test("returns 404 for non-existent session", async () => {
      const res = await app.request("/api/sessions/nonexistent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      });
      expect(res.status).toBe(404);
    });

    test("returns 400 for invalid status", async () => {
      const session = await insertSession(testDb);
      const res = await app.request(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "invalid" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/sessions/:id", () => {
    test("deletes existing session", async () => {
      const session = await insertSession(testDb);
      const res = await app.request(`/api/sessions/${session.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);

      const getRes = await app.request(`/api/sessions/${session.id}`);
      expect(getRes.status).toBe(404);
    });

    test("returns 404 for non-existent session", async () => {
      const res = await app.request("/api/sessions/nonexistent", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});
