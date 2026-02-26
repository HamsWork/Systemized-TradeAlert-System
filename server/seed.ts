import { db } from "./db";
import { alerts, signals, watchlist, activityLog } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  const existingAlerts = await db.select().from(alerts);
  if (existingAlerts.length > 0) {
    return;
  }

  await db.insert(alerts).values([
    {
      name: "BTC Breakout Watch",
      symbol: "BTC",
      condition: "above",
      targetPrice: 72000,
      currentPrice: 68450.25,
      status: "active",
      priority: "high",
      triggered: false,
    },
    {
      name: "ETH Support Level",
      symbol: "ETH",
      condition: "below",
      targetPrice: 3200,
      currentPrice: 3485.50,
      status: "active",
      priority: "medium",
      triggered: false,
    },
    {
      name: "AAPL Earnings Play",
      symbol: "AAPL",
      condition: "above",
      targetPrice: 195,
      currentPrice: 189.72,
      status: "active",
      priority: "medium",
      triggered: false,
    },
    {
      name: "NVDA Resistance Break",
      symbol: "NVDA",
      condition: "above",
      targetPrice: 950,
      currentPrice: 875.30,
      status: "active",
      priority: "high",
      triggered: false,
    },
    {
      name: "SPY Correction Alert",
      symbol: "SPY",
      condition: "below",
      targetPrice: 480,
      currentPrice: 512.45,
      status: "paused",
      priority: "low",
      triggered: false,
    },
  ]);

  await db.insert(signals).values([
    {
      symbol: "AAPL",
      type: "technical",
      direction: "buy",
      confidence: 78,
      entryPrice: 189.50,
      targetPrice: 205.00,
      stopLoss: 182.00,
      status: "active",
      notes: "Golden cross on daily chart. RSI at 55, room for upside. Volume confirming the move.",
    },
    {
      symbol: "TSLA",
      type: "sentiment",
      direction: "sell",
      confidence: 65,
      entryPrice: 248.90,
      targetPrice: 220.00,
      stopLoss: 260.00,
      status: "active",
      notes: "Bearish divergence on RSI. Social sentiment turning negative after earnings guidance.",
    },
    {
      symbol: "MSFT",
      type: "fundamental",
      direction: "buy",
      confidence: 85,
      entryPrice: 415.20,
      targetPrice: 450.00,
      stopLoss: 400.00,
      status: "active",
      notes: "Strong cloud revenue growth. AI integration driving new revenue streams. Undervalued relative to peers.",
    },
    {
      symbol: "AMD",
      type: "algorithmic",
      direction: "buy",
      confidence: 72,
      entryPrice: 165.80,
      targetPrice: 190.00,
      stopLoss: 155.00,
      status: "active",
      notes: "ML model detected bullish pattern. Momentum indicators aligning on multiple timeframes.",
    },
  ]);

  await db.insert(watchlist).values([
    {
      symbol: "BTC",
      name: "Bitcoin",
      currentPrice: 68450.25,
      change24h: 1250.50,
      changePercent: 1.86,
      volume: "42.3B",
      marketCap: "1.34T",
      sector: "Crypto",
    },
    {
      symbol: "ETH",
      name: "Ethereum",
      currentPrice: 3485.50,
      change24h: -45.20,
      changePercent: -1.28,
      volume: "18.7B",
      marketCap: "418B",
      sector: "Crypto",
    },
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      currentPrice: 189.72,
      change24h: 2.15,
      changePercent: 1.15,
      volume: "52.1M",
      marketCap: "2.95T",
      sector: "Technology",
    },
    {
      symbol: "NVDA",
      name: "NVIDIA Corp.",
      currentPrice: 875.30,
      change24h: 18.45,
      changePercent: 2.15,
      volume: "38.9M",
      marketCap: "2.16T",
      sector: "Technology",
    },
    {
      symbol: "TSLA",
      name: "Tesla Inc.",
      currentPrice: 248.90,
      change24h: -5.30,
      changePercent: -2.08,
      volume: "89.2M",
      marketCap: "791B",
      sector: "Automotive",
    },
  ]);

  await db.insert(activityLog).values([
    {
      type: "system",
      title: "System initialized",
      description: "TradeSync alert system started and connected to data feeds",
      symbol: null,
      metadata: null,
    },
    {
      type: "alert_created",
      title: "Alert created: BTC Breakout Watch",
      description: "Price above $72,000 on BTC",
      symbol: "BTC",
      metadata: null,
    },
    {
      type: "signal_created",
      title: "BUY signal: AAPL",
      description: "Technical signal at $189.50 with 78% confidence",
      symbol: "AAPL",
      metadata: null,
    },
    {
      type: "watchlist_added",
      title: "Added NVDA to watchlist",
      description: "NVIDIA Corp. at $875.30",
      symbol: "NVDA",
      metadata: null,
    },
    {
      type: "signal_created",
      title: "SELL signal: TSLA",
      description: "Sentiment signal at $248.90 with 65% confidence",
      symbol: "TSLA",
      metadata: null,
    },
    {
      type: "alert_created",
      title: "Alert created: ETH Support Level",
      description: "Price below $3,200 on ETH",
      symbol: "ETH",
      metadata: null,
    },
  ]);
}
