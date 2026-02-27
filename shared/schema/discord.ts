import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const discordMessages = pgTable("discord_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signalId: varchar("signal_id"),
  webhookUrl: text("webhook_url").notNull(),
  channelType: text("channel_type").notNull().default("signal"),
  instrumentType: text("instrument_type"),
  status: text("status").notNull().default("sent"),
  messageType: text("message_type").notNull().default("signal_alert"),
  embedData: jsonb("embed_data"),
  error: text("error"),
  sourceAppId: varchar("source_app_id"),
  sourceAppName: text("source_app_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDiscordMessageSchema = createInsertSchema(discordMessages).omit({
  id: true,
  createdAt: true,
});

export type DiscordMessage = typeof discordMessages.$inferSelect;
export type InsertDiscordMessage = z.infer<typeof insertDiscordMessageSchema>;
