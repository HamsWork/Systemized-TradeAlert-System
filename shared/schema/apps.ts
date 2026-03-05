import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const TRADESYNC_APP_SLUG = "tradesync-api";

export const connectedApps = pgTable("connected_apps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  status: text("status").notNull().default("active"),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  apiEndpoint: text("api_endpoint"),
  apiKey: text("api_key"),
  webhookUrl: text("webhook_url"),
  syncAlerts: boolean("sync_alerts").notNull().default(true),
  syncSignals: boolean("sync_signals").notNull().default(true),
  discordWebhookShares: text("discord_webhook_shares"),
  discordWebhookOptions: text("discord_webhook_options"),
  discordWebhookLetf: text("discord_webhook_letf"),
  discordWebhookLetfOption: text("discord_webhook_letf_option"),
  discordWebhookCrypto: text("discord_webhook_crypto"),
  discordContentShares: text("discord_content_shares"),
  discordContentOptions: text("discord_content_options"),
  discordContentLetf: text("discord_content_letf"),
  discordContentLetfOption: text("discord_content_letf_option"),
  discordContentCrypto: text("discord_content_crypto"),
  executeIbkrTrades: boolean("execute_ibkr_trades").notNull().default(false),
  ibkrClientId: text("ibkr_client_id"),
  ibkrHost: text("ibkr_host"),
  ibkrPort: text("ibkr_port"),
  sendDiscordMessages: boolean("send_discord_messages").notNull().default(false),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertConnectedAppSchema = createInsertSchema(connectedApps).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true,
});

export type ConnectedApp = typeof connectedApps.$inferSelect;
export type InsertConnectedApp = z.infer<typeof insertConnectedAppSchema>;
