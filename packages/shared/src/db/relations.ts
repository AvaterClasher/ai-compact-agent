import { relations } from "drizzle-orm";
import { sessions, messages, messageParts, compactions } from "./schema.js";

export const sessionsRelations = relations(sessions, ({ many }) => ({
  messages: many(messages),
  compactions: many(compactions),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
  parts: many(messageParts),
}));

export const messagePartsRelations = relations(messageParts, ({ one }) => ({
  message: one(messages, {
    fields: [messageParts.messageId],
    references: [messages.id],
  }),
}));

export const compactionsRelations = relations(compactions, ({ one }) => ({
  session: one(sessions, {
    fields: [compactions.sessionId],
    references: [sessions.id],
  }),
}));
