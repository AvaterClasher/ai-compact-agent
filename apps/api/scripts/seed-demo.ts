/**
 * Seed a demo session with pre-filled conversation history.
 * Used to demonstrate compaction in a video — run with low thresholds:
 *
 *   CONTEXT_WINDOW_OVERRIDE=3000 OUTPUT_TOKEN_MAX=500 \
 *   PRUNE_MINIMUM=200 PRUNE_PROTECT=400 \
 *   bun run seed:demo
 */

import { db } from "../src/db/client.js";
// Triggers table creation
import "../src/db/migrate.js";

import { messageParts, messages, sessions } from "@repo/shared";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDefaultModel } from "../src/agent/model.js";

const SESSION_ID = "demo-compaction";
const estimate = (s: string) => Math.ceil(s.length / 4);

// Clean up any previous demo session
await db.delete(sessions).where(eq(sessions.id, SESSION_ID));

const now = Date.now();

// Create session
await db.insert(sessions).values({
  id: SESSION_ID,
  title: "Demo: Build a TODO API",
  model: getDefaultModel(),
  status: "active",
  createdAt: new Date(now),
  updatedAt: new Date(now),
});

// Helper to insert a user message
async function insertUser(content: string, offset: number) {
  const id = nanoid();
  await db.insert(messages).values({
    id,
    sessionId: SESSION_ID,
    role: "user",
    content,
    createdAt: new Date(now + offset),
  });
  await db.insert(messageParts).values({
    id: nanoid(),
    messageId: id,
    type: "text",
    content,
    tokenEstimate: estimate(content),
    createdAt: new Date(now + offset),
  });
  return id;
}

// Helper to insert an assistant message with optional tool parts
async function insertAssistant(
  textContent: string,
  offset: number,
  toolCalls?: { name: string; input: string; result: string }[],
) {
  const id = nanoid();
  await db.insert(messages).values({
    id,
    sessionId: SESSION_ID,
    role: "assistant",
    content: textContent,
    tokensInput: estimate(textContent) * 2, // simulate reported input tokens
    tokensOutput: estimate(textContent),
    createdAt: new Date(now + offset),
  });

  // Text part
  await db.insert(messageParts).values({
    id: nanoid(),
    messageId: id,
    type: "text",
    content: textContent,
    tokenEstimate: estimate(textContent),
    createdAt: new Date(now + offset),
  });

  // Tool parts
  if (toolCalls) {
    for (const tc of toolCalls) {
      const callId = nanoid();
      await db.insert(messageParts).values({
        id: nanoid(),
        messageId: id,
        type: "tool-call",
        toolName: tc.name,
        toolCallId: callId,
        content: tc.input,
        tokenEstimate: estimate(tc.input),
        createdAt: new Date(now + offset + 1),
      });
      await db.insert(messageParts).values({
        id: nanoid(),
        messageId: id,
        type: "tool-result",
        toolName: tc.name,
        toolCallId: callId,
        content: tc.result,
        tokenEstimate: estimate(tc.result),
        createdAt: new Date(now + offset + 2),
      });
    }
  }
}

// --- Turn 1: Create a TODO API ---
await insertUser(
  "Create a simple TODO API with Express. I need GET /todos and POST /todos endpoints.",
  1000,
);

await insertAssistant(
  `I'll create a TODO API with Express. Here's the implementation with GET and POST endpoints:

\`\`\`typescript
import express from "express";
const app = express();
app.use(express.json());

interface Todo { id: number; title: string; completed: boolean; }
let todos: Todo[] = [];
let nextId = 1;

app.get("/todos", (req, res) => {
  res.json(todos);
});

app.post("/todos", (req, res) => {
  const { title } = req.body;
  const todo: Todo = { id: nextId++, title, completed: false };
  todos.push(todo);
  res.status(201).json(todo);
});

app.listen(3000, () => console.log("Server running on port 3000"));
\`\`\`

This gives you a basic in-memory TODO API with auto-incrementing IDs.`,
  2000,
  [
    {
      name: "writeFile",
      input: JSON.stringify({ path: "/app/server.ts", content: "import express..." }),
      result: JSON.stringify({ success: true, path: "/app/server.ts", bytesWritten: 487 }),
    },
  ],
);

// --- Turn 2: Add validation ---
await insertUser(
  "Add input validation — title should be required and at least 3 characters.",
  3000,
);

await insertAssistant(
  `I've added validation to the POST endpoint. The title field is now required and must be at least 3 characters:

\`\`\`typescript
app.post("/todos", (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== "string" || title.trim().length < 3) {
    return res.status(400).json({
      error: "Title is required and must be at least 3 characters"
    });
  }
  const todo: Todo = { id: nextId++, title: title.trim(), completed: false };
  todos.push(todo);
  res.status(201).json(todo);
});
\`\`\`

Invalid requests now return a 400 with a descriptive error message.`,
  4000,
  [
    {
      name: "readFile",
      input: JSON.stringify({ path: "/app/server.ts" }),
      result: JSON.stringify({
        content: "import express from 'express';\nconst app = express();\n...",
      }),
    },
    {
      name: "writeFile",
      input: JSON.stringify({ path: "/app/server.ts", content: "import express... (updated)" }),
      result: JSON.stringify({ success: true, path: "/app/server.ts", bytesWritten: 612 }),
    },
  ],
);

// --- Turn 3: Add tests ---
await insertUser("Now write some tests for these endpoints using the built-in test runner.", 5000);

await insertAssistant(
  `I've created tests covering both endpoints and the validation logic:

\`\`\`typescript
import { describe, test, expect } from "bun:test";

describe("GET /todos", () => {
  test("returns empty array initially", async () => {
    const res = await fetch("http://localhost:3000/todos");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("POST /todos", () => {
  test("creates a todo with valid title", async () => {
    const res = await fetch("http://localhost:3000/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Buy groceries" }),
    });
    expect(res.status).toBe(201);
    const todo = await res.json();
    expect(todo.title).toBe("Buy groceries");
    expect(todo.completed).toBe(false);
  });

  test("rejects short titles", async () => {
    const res = await fetch("http://localhost:3000/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "ab" }),
    });
    expect(res.status).toBe(400);
  });
});
\`\`\`

Tests cover the happy path, empty state, and validation rejection.`,
  6000,
  [
    {
      name: "writeFile",
      input: JSON.stringify({ path: "/app/server.test.ts", content: "import { describe... }" }),
      result: JSON.stringify({ success: true, path: "/app/server.test.ts", bytesWritten: 834 }),
    },
    {
      name: "executeCode",
      input: JSON.stringify({ code: "bun test server.test.ts", language: "shell" }),
      result: JSON.stringify({ exitCode: 0, stdout: "3 pass, 0 fail", stderr: "" }),
    },
  ],
);

// --- Turn 4: Add PATCH endpoint ---
await insertUser("Add a PATCH /todos/:id endpoint to toggle the completed status.", 7000);

await insertAssistant(
  `Here's the PATCH endpoint to toggle completion:

\`\`\`typescript
app.patch("/todos/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const todo = todos.find(t => t.id === id);
  if (!todo) return res.status(404).json({ error: "Todo not found" });
  todo.completed = !todo.completed;
  res.json(todo);
});
\`\`\`

Now you can toggle any todo's completed status by sending PATCH to \`/todos/:id\`. It returns 404 if the ID doesn't exist.`,
  8000,
  [
    {
      name: "writeFile",
      input: JSON.stringify({ path: "/app/server.ts", content: "import express... (with PATCH)" }),
      result: JSON.stringify({ success: true, path: "/app/server.ts", bytesWritten: 891 }),
    },
  ],
);

console.log(`Seeded demo session "${SESSION_ID}" with 4 conversation turns.`);
console.log("To trigger compaction quickly, add these to your .env:");
console.log("");
console.log("  CONTEXT_WINDOW_OVERRIDE=3000");
console.log("  OUTPUT_TOKEN_MAX=500");
console.log("  PRUNE_MINIMUM=200");
console.log("  PRUNE_PROTECT=400");
console.log("");
console.log("Then start the API and send a message in the demo session.");
