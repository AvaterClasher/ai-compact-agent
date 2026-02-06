import { Database } from "bun:sqlite";
import {
  compactionsRelations,
  messagePartsRelations,
  messagesRelations,
  sessionsRelations,
} from "@repo/shared";
import * as schema from "@repo/shared/db";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";

/**
 * Creates an isolated in-memory SQLite database with all tables.
 * Each test gets its own DB instance -- no cleanup needed.
 */
export function createTestDB() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const testDb = drizzle(sqlite, {
    schema: {
      ...schema,
      sessionsRelations,
      messagesRelations,
      messagePartsRelations,
      compactionsRelations,
    },
  });

  // Replicate exact DDL from src/db/migrate.ts
  testDb.run(sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Session',
    model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'compacting', 'archived')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);

  testDb.run(sql`CREATE TABLE IF NOT EXISTS messages (
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
  )`);

  testDb.run(sql`CREATE TABLE IF NOT EXISTS message_parts (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('text', 'tool-call', 'tool-result', 'compaction')),
    tool_name TEXT,
    tool_call_id TEXT,
    content TEXT NOT NULL,
    token_estimate INTEGER NOT NULL DEFAULT 0,
    pruned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);

  testDb.run(sql`CREATE TABLE IF NOT EXISTS compactions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    tokens_before INTEGER NOT NULL,
    tokens_after INTEGER NOT NULL,
    message_count_before INTEGER NOT NULL,
    auto INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);

  testDb.run(sql`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`);
  testDb.run(
    sql`CREATE INDEX IF NOT EXISTS idx_message_parts_message ON message_parts(message_id)`,
  );
  testDb.run(sql`CREATE INDEX IF NOT EXISTS idx_compactions_session ON compactions(session_id)`);

  return testDb;
}

export type TestDB = ReturnType<typeof createTestDB>;
