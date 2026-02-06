import { sql } from "drizzle-orm";
import { db } from "./client.js";

// Simple migration: create tables if they don't exist
// For production, use drizzle-kit generate + migrate

const migrations = [
  sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Session',
    model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'compacting', 'archived')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  sql`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_reasoning INTEGER NOT NULL DEFAULT 0,
    tokens_cache_read INTEGER NOT NULL DEFAULT 0,
    tokens_cache_write INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  sql`CREATE TABLE IF NOT EXISTS message_parts (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('text', 'tool-call', 'tool-result', 'compaction')),
    tool_name TEXT,
    tool_call_id TEXT,
    content TEXT NOT NULL,
    token_estimate INTEGER NOT NULL DEFAULT 0,
    pruned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  sql`CREATE TABLE IF NOT EXISTS compactions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    tokens_before INTEGER NOT NULL,
    tokens_after INTEGER NOT NULL,
    message_count_before INTEGER NOT NULL,
    auto INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  sql`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`,
  sql`CREATE INDEX IF NOT EXISTS idx_message_parts_message ON message_parts(message_id)`,
  sql`CREATE INDEX IF NOT EXISTS idx_compactions_session ON compactions(session_id)`,
];

console.log("Running migrations...");
for (const migration of migrations) {
  db.run(migration);
}
console.log("Migrations complete.");
