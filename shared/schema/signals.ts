import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const signals = pgTable("signals", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  data: jsonb("data").notNull().default({}),
  discordChannelId: varchar("discord_channel_id"),
  status: text("status").notNull().default("pending"),
  sourceAppId: varchar("source_app_id"),
  sourceAppName: text("source_app_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  createdAt: true,
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
