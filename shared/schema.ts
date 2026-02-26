import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

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

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  type: text("type").notNull(),
  direction: text("direction").notNull(),
  confidence: integer("confidence").notNull(),
  entryPrice: real("entry_price").notNull(),
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  sourceAppId: varchar("source_app_id"),
  sourceAppName: text("source_app_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const watchlist = pgTable("watchlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  currentPrice: real("current_price").notNull(),
  change24h: real("change_24h").notNull().default(0),
  changePercent: real("change_percent").notNull().default(0),
  volume: text("volume"),
  marketCap: text("market_cap"),
  sector: text("sector"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  symbol: text("symbol"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const connectedApps = pgTable("connected_apps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  status: text("status").notNull().default("active"),
  apiEndpoint: text("api_endpoint"),
  apiKey: text("api_key"),
  webhookUrl: text("webhook_url"),
  syncAlerts: boolean("sync_alerts").notNull().default(true),
  syncSignals: boolean("sync_signals").notNull().default(true),
  discordWebhookShares: text("discord_webhook_shares"),
  discordWebhookOptions: text("discord_webhook_options"),
  discordWebhookLetf: text("discord_webhook_letf"),
  executeIbkrTrades: boolean("execute_ibkr_trades").notNull().default(false),
  sendDiscordMessages: boolean("send_discord_messages").notNull().default(false),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  type: text("type").notNull().default("boolean"),
});

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

export const ibkrOrders = pgTable("ibkr_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull(),
  sourceAppId: varchar("source_app_id"),
  sourceAppName: text("source_app_name"),
  orderId: text("order_id").notNull(),
  symbol: text("symbol").notNull(),
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

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
});

export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  createdAt: true,
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;

export const insertConnectedAppSchema = createInsertSchema(connectedApps).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true,
});

export type ConnectedApp = typeof connectedApps.$inferSelect;
export type InsertConnectedApp = z.infer<typeof insertConnectedAppSchema>;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  createdAt: true,
  triggeredAt: true,
  triggered: true,
  currentPrice: true,
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  createdAt: true,
});

export const insertActivitySchema = createInsertSchema(activityLog).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Signal = typeof signals.$inferSelect;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivitySchema>;
