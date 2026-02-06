import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Session"),
  model: text("model").notNull().default("claude-sonnet-4-5-20250929"),
  status: text("status", { enum: ["active", "compacting", "archived"] })
    .notNull()
    .default("active"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  tokensReasoning: integer("tokens_reasoning").notNull().default(0),
  tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
  tokensCacheWrite: integer("tokens_cache_write").notNull().default(0),
  cost: real("cost").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messageParts = sqliteTable("message_parts", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["text", "tool-call", "tool-result", "compaction"],
  }).notNull(),
  toolName: text("tool_name"),
  toolCallId: text("tool_call_id"),
  content: text("content").notNull(),
  tokenEstimate: integer("token_estimate").notNull().default(0),
  pruned: integer("pruned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const compactions = sqliteTable("compactions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  tokensBefore: integer("tokens_before").notNull(),
  tokensAfter: integer("tokens_after").notNull(),
  messageCountBefore: integer("message_count_before").notNull(),
  auto: integer("auto", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
