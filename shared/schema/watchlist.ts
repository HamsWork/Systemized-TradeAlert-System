import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, timestamp } from "drizzle-orm/pg-core";

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
