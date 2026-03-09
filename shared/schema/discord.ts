import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
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

export const discordTemplates = pgTable("discord_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id").notNull(),
  instrumentType: text("instrument_type").notNull(),
  messageType: text("message_type").notNull(),
  label: text("label").notNull().default(""),
  content: text("content").notNull().default(""),
  embedJson: jsonb("embed_json").notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique().on(table.appId, table.instrumentType, table.messageType),
]);

export const insertDiscordTemplateSchema = createInsertSchema(discordTemplates).omit({
  id: true,
  updatedAt: true,
});

export type DiscordTemplate = typeof discordTemplates.$inferSelect;
export type InsertDiscordTemplate = z.infer<typeof insertDiscordTemplateSchema>;
