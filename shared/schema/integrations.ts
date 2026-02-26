import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const integrations = pgTable("integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  config: jsonb("config"),
  enabled: boolean("enabled").notNull().default(true),
  notifyAlerts: boolean("notify_alerts").notNull().default(true),
  notifySignals: boolean("notify_signals").notNull().default(true),
  notifyTrades: boolean("notify_trades").notNull().default(false),
  notifySystem: boolean("notify_system").notNull().default(false),
  autoTrade: boolean("auto_trade").notNull().default(false),
  paperTrade: boolean("paper_trade").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  createdAt: true,
});

export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
