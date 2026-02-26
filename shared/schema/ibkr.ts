import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const ibkrOrders = pgTable("ibkr_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull(),
  sourceAppId: varchar("source_app_id"),
  sourceAppName: text("source_app_name"),
  orderId: text("order_id").notNull(),
  symbol: text("symbol").notNull(),
  secType: text("sec_type").notNull().default("STK"),
  expiration: text("expiration"),
  strike: real("strike"),
  right: text("right"),
  side: text("side").notNull(),
  orderType: text("order_type").notNull(),
  quantity: real("quantity").notNull(),
  limitPrice: real("limit_price"),
  stopPrice: real("stop_price"),
  filledQuantity: real("filled_quantity").notNull().default(0),
  avgFillPrice: real("avg_fill_price"),
  status: text("status").notNull().default("submitted"),
  timeInForce: text("time_in_force").notNull().default("DAY"),
  commission: real("commission"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  filledAt: timestamp("filled_at"),
  cancelledAt: timestamp("cancelled_at"),
});

export const ibkrPositions = pgTable("ibkr_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull(),
  sourceAppId: varchar("source_app_id"),
  sourceAppName: text("source_app_name"),
  symbol: text("symbol").notNull(),
  secType: text("sec_type").notNull().default("STK"),
  expiration: text("expiration"),
  strike: real("strike"),
  right: text("right"),
  conId: integer("con_id"),
  quantity: real("quantity").notNull(),
  avgCost: real("avg_cost").notNull(),
  marketPrice: real("market_price"),
  marketValue: real("market_value"),
  unrealizedPnl: real("unrealized_pnl"),
  realizedPnl: real("realized_pnl"),
  currency: text("currency").notNull().default("USD"),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertIbkrOrderSchema = createInsertSchema(ibkrOrders).omit({
  id: true,
});

export const insertIbkrPositionSchema = createInsertSchema(ibkrPositions).omit({
  id: true,
});

export type IbkrOrder = typeof ibkrOrders.$inferSelect;
export type InsertIbkrOrder = z.infer<typeof insertIbkrOrderSchema>;
export type IbkrPosition = typeof ibkrPositions.$inferSelect;
export type InsertIbkrPosition = z.infer<typeof insertIbkrPositionSchema>;
