import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  condition: text("condition").notNull(),
  targetPrice: real("target_price").notNull(),
  currentPrice: real("current_price"),
  status: text("status").notNull().default("active"),
  priority: text("priority").notNull().default("medium"),
  triggered: boolean("triggered").notNull().default(false),
  triggeredAt: timestamp("triggered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  createdAt: true,
  triggeredAt: true,
  triggered: true,
  currentPrice: true,
});

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
