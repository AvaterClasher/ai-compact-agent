import { Database } from "bun:sqlite";
import {
  compactionsRelations,
  messagePartsRelations,
  messagesRelations,
  sessionsRelations,
} from "@repo/shared";
import * as schema from "@repo/shared/db";
import { drizzle } from "drizzle-orm/bun-sqlite";

const dbPath = process.env.DATABASE_PATH || "./data/agent.db";
const dockerDb = process.env.DOCKER_DB !== "false";

if (dockerDb) {
  // Ensure the Docker volume service is running before writing to the DB
  const check = Bun.spawnSync(["docker", "compose", "ps", "-q", "db"]);
  if (!check.stdout.toString().trim()) {
    const start = Bun.spawnSync(["docker", "compose", "up", "-d", "db"]);
    if (start.exitCode !== 0) {
      console.error("Failed to start Docker DB volume service:", start.stderr.toString());
    }
  }
}

// Ensure the data directory exists
const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
if (dir) {
  await Bun.write(Bun.file(`${dir}/.keep`), "");
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
