import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "@repo/shared/db";
import {
  sessionsRelations,
  messagesRelations,
  messagePartsRelations,
  compactionsRelations,
} from "@repo/shared";

const dbPath = process.env.DATABASE_PATH || "./data/agent.db";

// Ensure the data directory exists
const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
if (dir) {
  await Bun.write(Bun.file(dir + "/.keep"), "");
}

const sqlite = new Database(dbPath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, {
  schema: {
    ...schema,
    sessionsRelations,
    messagesRelations,
    messagePartsRelations,
    compactionsRelations,
  },
});

export type DB = typeof db;
