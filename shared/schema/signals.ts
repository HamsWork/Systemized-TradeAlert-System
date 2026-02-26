import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const signalTypes = pgTable("signal_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  variables: jsonb("variables").notNull().default([]),
  titleTemplate: text("title_template").notNull().default(""),
  descriptionTemplate: text("description_template").notNull().default(""),
  color: text("color").notNull().default("#000000"),
  fieldsTemplate: jsonb("fields_template").notNull().default([]),
  footerTemplate: text("footer_template").notNull().default(""),
  showTitle: boolean("show_title").notNull().default(true),
  showDescription: boolean("show_description").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signalTypeId: varchar("signal_type_id").notNull(),
  data: jsonb("data").notNull().default({}),
  discordChannelId: varchar("discord_channel_id"),
  status: text("status").notNull().default("active"),
  sourceAppId: varchar("source_app_id"),
  sourceAppName: text("source_app_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSignalTypeSchema = createInsertSchema(signalTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  createdAt: true,
});

export type SignalType = typeof signalTypes.$inferSelect;
export type InsertSignalType = z.infer<typeof insertSignalTypeSchema>;
export type Signal = typeof signals.$inferSelect;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
