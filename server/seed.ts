import { db } from "./db";
import { alerts, signals, activityLog, connectedApps, systemSettings, integrations, ibkrOrders, ibkrPositions } from "@shared/schema";
import { sql } from "drizzle-orm";
import crypto from "crypto";

function generateApiKey(): string {
  return `ts_${crypto.randomBytes(24).toString("hex")}`;
}

export async function seedDatabase() {
  const existingAlerts = await db.select().from(alerts);
  const existingSettings = await db.select().from(systemSettings);
  const existingIntegrations = await db.select().from(integrations);
  const existingApps = await db.select().from(connectedApps);
  const existingSignals = await db.select().from(signals);
  const existingIbkrOrders = await db.select().from(ibkrOrders);

  const needsAlertSeed = existingAlerts.length === 0;
  const needsSettingsSeed = existingSettings.length === 0;
  const needsIntegrationsSeed = existingIntegrations.length === 0;
  const needsAppsSeed = existingApps.length === 0;
  const needsSignalsSeed = existingSignals.length === 0;
  const needsIbkrSeed = existingIbkrOrders.length === 0;
  const hasBuiltInApp = existingApps.some(a => a.slug === "tradesync-api");

  if (!needsAlertSeed && !needsSettingsSeed && !needsIntegrationsSeed && !needsAppsSeed && !needsSignalsSeed && !needsIbkrSeed && hasBuiltInApp) {
    return;
  }

  if (!hasBuiltInApp) await seedBuiltInApp();
  if (needsSettingsSeed) await seedSettings();
  if (needsIntegrationsSeed) await seedIntegrations();
  if (needsAppsSeed) await seedApps();
  if (needsIbkrSeed) await seedIbkrData();

  if (needsAlertSeed) {
    await db.insert(alerts).values([
      { name: "BTC Breakout Watch", symbol: "BTC", condition: "above", targetPrice: 72000, currentPrice: 68450.25, status: "active", priority: "high", triggered: false },
      { name: "ETH Support Level", symbol: "ETH", condition: "below", targetPrice: 3200, currentPrice: 3485.50, status: "active", priority: "medium", triggered: false },
      { name: "AAPL Earnings Play", symbol: "AAPL", condition: "above", targetPrice: 195, currentPrice: 189.72, status: "active", priority: "medium", triggered: false },
      { name: "NVDA Resistance Break", symbol: "NVDA", condition: "above", targetPrice: 950, currentPrice: 875.30, status: "active", priority: "high", triggered: false },
      { name: "SPY Correction Alert", symbol: "SPY", condition: "below", targetPrice: 480, currentPrice: 512.45, status: "paused", priority: "low", triggered: false },
    ]);

    await db.insert(activityLog).values([
      { type: "system", title: "System initialized", description: "TradeSync signal execution system started and connected to data feeds", symbol: null, metadata: null },
      { type: "alert_created", title: "Alert created: BTC Breakout Watch", description: "Price above $72,000 on BTC", symbol: "BTC", metadata: null },
      { type: "signal_ingested", title: "Signal from Situ Trader: Entry AAPL", description: "Common Trade Alert for AAPL", symbol: "AAPL", metadata: { sourceApp: "Situ Trader" } },
      { type: "signal_ingested", title: "Signal from Crowned Trader: Stop Loss TSLA", description: "Stop Loss Hit for TSLA", symbol: "TSLA", metadata: { sourceApp: "Crowned Trader" } },
      { type: "alert_created", title: "Alert created: ETH Support Level", description: "Price below $3,200 on ETH", symbol: "ETH", metadata: null },
    ]);
  }

  if (needsSignalsSeed) await seedSignals();
}

async function seedSignals() {
  await db.insert(signals).values([
    {
      data: { ticker: "AAPL", instrument_type: "Options", direction: "Long", strike: "190", expiration: "2026-03-20", entry_price: "189.50", stop_loss_1: "182.00", take_profit_1: "195.00", take_profit_2: "200.00", take_profit_3: "205.00", raise_stop_method: "Move to Entry at TP1", trade_plan: "Breakout above 188 resistance. Scale out at each TP. Full exit if daily close below SL.", notes: "Golden cross on daily chart. RSI at 55, room for upside." },
      status: "active",
      sourceAppName: "Situ Trader",
    },
    {
      data: { ticker: "TSLA", instrument_type: "Shares", direction: "Long", exit_price: "230.00", loss_amount: "950.00", notes: "Bearish divergence on RSI. Social sentiment turned negative." },
      status: "active",
      sourceAppName: "Crowned Trader",
    },
    {
      data: { ticker: "MSFT", instrument_type: "Shares", direction: "Long", entry_price: "415.20", stop_loss_1: "400.00", stop_loss_2: "390.00", take_profit_1: "430.00", take_profit_2: "445.00", take_profit_3: "450.00", raise_stop_method: "Trail by %", raise_stop_value: "3%", trade_plan: "Long shares on strong cloud revenue beat. Trailing stop strategy.", notes: "Strong cloud revenue growth. AI integration driving new revenue." },
      status: "active",
      sourceAppName: "Situ Trader",
    },
    {
      data: { ticker: "AMD", instrument_type: "Shares", direction: "Long", tp_level: "TP1", exit_price: "175.00", profit_amount: "460.00", notes: "First target hit on AMD position." },
      status: "active",
      sourceAppName: "Crowned Trader",
    },
    {
      data: { ticker: "NVDA", instrument_type: "Options", direction: "Long", strike: "900", expiration: "2026-04-17", entry_price: "875.30", stop_loss_1: "850.00", take_profit_1: "920.00", take_profit_2: "950.00", raise_stop_method: "Move to TP1 at TP2", trade_plan: "Momentum play on AI sector strength. Partial exits at each level.", notes: "ML model detected bullish pattern. Momentum aligning." },
      status: "active",
      sourceAppName: "Crowned Trader",
    },
    {
      data: { ticker: "TQQQ", instrument_type: "LETF", direction: "Long", entry_price: "58.50", stop_loss_1: "55.00", take_profit_1: "62.00", take_profit_2: "65.00", raise_stop_method: "Trail by $", raise_stop_value: "2.00", trade_plan: "Leveraged play on QQQ momentum. Quick in/out.", notes: "Bullish tech momentum, leveraged ETF play." },
      status: "active",
      sourceAppName: "Situ Trader",
    },
  ]);
}

async function seedBuiltInApp() {
  await db.insert(connectedApps).values({
    name: "TradeSync API",
    slug: "tradesync-api",
    description: "Built-in TradeSync API app for testing and manual signal ingestion",
    status: "active",
    isBuiltIn: true,
    apiKey: generateApiKey(),
    syncAlerts: true,
    syncSignals: true,
  });
}

async function seedApps() {
  await db.insert(connectedApps).values([
    {
      name: "Situ Trader",
      slug: "situ-trader",
      description: "Advanced algorithmic trading platform with real-time market analysis and automated execution strategies",
      status: "active",
      apiEndpoint: "https://api.situtrader.com/v1",
      apiKey: generateApiKey(),
      webhookUrl: "https://api.situtrader.com/webhooks/tradesync",
      syncAlerts: true,
      syncSignals: true,
    },
    {
      name: "Crowned Trader",
      slug: "crowned-trader",
      description: "Community-driven trading signals platform with social sentiment analysis and copy trading features",
      status: "active",
      apiEndpoint: "https://api.crownedtrader.io/v2",
      apiKey: generateApiKey(),
      webhookUrl: "https://api.crownedtrader.io/hooks/tradesync",
      syncAlerts: true,
      syncSignals: true,
    },
  ]);
}

async function seedSettings() {
  await db.insert(systemSettings).values([
    { key: "signal_system_enabled", value: "true", category: "signals", label: "Signal Engine", description: "Master switch for the signal analysis engine", type: "boolean" },
    { key: "signal_auto_create_alerts", value: "false", category: "signals", label: "Auto-Create Alerts", description: "Automatically create alerts from incoming signals", type: "boolean" },
    { key: "signal_confidence_threshold", value: "60", category: "signals", label: "Min Confidence Threshold", description: "Minimum confidence % to accept incoming signals", type: "number" },
    { key: "signal_technical_enabled", value: "true", category: "signals", label: "Technical Signals", description: "Accept technical analysis signals from apps", type: "boolean" },
    { key: "signal_sentiment_enabled", value: "true", category: "signals", label: "Sentiment Signals", description: "Accept social sentiment signals from apps", type: "boolean" },
    { key: "signal_fundamental_enabled", value: "true", category: "signals", label: "Fundamental Signals", description: "Accept fundamental analysis signals from apps", type: "boolean" },
    { key: "signal_algorithmic_enabled", value: "true", category: "signals", label: "Algorithmic Signals", description: "Accept ML/algorithmic signals from apps", type: "boolean" },
    { key: "system_logging_enabled", value: "true", category: "system", label: "Activity Logging", description: "Log all system events to the activity feed", type: "boolean" },
    { key: "system_dark_mode", value: "true", category: "system", label: "Dark Mode Default", description: "Default to dark mode on first visit", type: "boolean" },
    { key: "system_api_enabled", value: "true", category: "system", label: "API Access", description: "Allow external apps to push signals via API", type: "boolean" },
    { key: "system_webhook_enabled", value: "true", category: "system", label: "Webhook Delivery", description: "Send webhook notifications to connected apps", type: "boolean" },
    { key: "trade_execution_enabled", value: "false", category: "trading", label: "Trade Execution", description: "Master switch for executing trades through connected brokers", type: "boolean" },
    { key: "trade_paper_mode", value: "true", category: "trading", label: "Paper Trading Mode", description: "Execute trades in paper/simulation mode only", type: "boolean" },
    { key: "trade_max_position_size", value: "10000", category: "trading", label: "Max Position Size ($)", description: "Maximum position size per trade", type: "number" },
    { key: "trade_risk_limit", value: "2", category: "trading", label: "Risk Limit (%)", description: "Maximum risk per trade as % of portfolio", type: "number" },
    { key: "trade_auto_stop_loss", value: "true", category: "trading", label: "Auto Stop-Loss", description: "Automatically set stop-loss on new trades", type: "boolean" },
    { key: "trade_auto_take_profit", value: "false", category: "trading", label: "Auto Take-Profit", description: "Automatically set take-profit targets", type: "boolean" },
  ]);
}

async function seedIntegrations() {
  await db.insert(integrations).values([
    {
      type: "discord", name: "Trading Alerts Channel", status: "active",
      config: { webhookUrl: "https://discord.com/api/webhooks/xxxx/yyyy", channelName: "#trading-alerts", serverId: "123456789" },
      enabled: true, notifyAlerts: true, notifySignals: true, notifyTrades: false, notifySystem: false, autoTrade: false, paperTrade: false,
    },
    {
      type: "discord", name: "System Notifications", status: "active",
      config: { webhookUrl: "https://discord.com/api/webhooks/aaaa/bbbb", channelName: "#system-logs", serverId: "123456789" },
      enabled: true, notifyAlerts: false, notifySignals: false, notifyTrades: false, notifySystem: true, autoTrade: false, paperTrade: false,
    },
    {
      type: "ibkr", name: "IBKR Paper Account", status: "active",
      config: { accountId: "DU12345678", host: "127.0.0.1", port: 7497, clientId: 1, accountType: "paper" },
      enabled: true, notifyAlerts: false, notifySignals: false, notifyTrades: true, notifySystem: false, autoTrade: false, paperTrade: true,
    },
    {
      type: "ibkr", name: "IBKR Live Account", status: "inactive",
      config: { accountId: "U98765432", host: "127.0.0.1", port: 7496, clientId: 2, accountType: "live" },
      enabled: false, notifyAlerts: false, notifySignals: false, notifyTrades: true, notifySystem: false, autoTrade: false, paperTrade: false,
    },
  ]);
}

async function seedIbkrData() {
  const allIntegrations = await db.select().from(integrations);
  const ibkrAccounts = allIntegrations.filter(i => i.type === "ibkr");
  if (ibkrAccounts.length === 0) return;

  const allApps = await db.select().from(connectedApps);
  const paperAccount = ibkrAccounts.find(a => (a.config as any)?.accountType === "paper") || ibkrAccounts[0];
  const situTrader = allApps.find(a => a.slug === "situ-trader");
  const crownedTrader = allApps.find(a => a.slug === "crowned-trader");

  const now = new Date();
  const h = (hours: number) => new Date(now.getTime() - hours * 3600000);

  await db.insert(ibkrOrders).values([
    { integrationId: paperAccount.id, sourceAppId: situTrader?.id || null, sourceAppName: situTrader?.name || "Situ Trader", orderId: "ORD-2401001", symbol: "AAPL", side: "buy", orderType: "limit", quantity: 100, limitPrice: 178.50, filledQuantity: 100, avgFillPrice: 178.45, status: "filled", timeInForce: "DAY", commission: 1.00, submittedAt: h(48), filledAt: h(47.5) },
    { integrationId: paperAccount.id, sourceAppId: situTrader?.id || null, sourceAppName: situTrader?.name || "Situ Trader", orderId: "ORD-2401002", symbol: "TSLA", side: "buy", orderType: "market", quantity: 50, filledQuantity: 50, avgFillPrice: 248.30, status: "filled", timeInForce: "DAY", commission: 1.00, submittedAt: h(36), filledAt: h(36) },
    { integrationId: paperAccount.id, sourceAppId: crownedTrader?.id || null, sourceAppName: crownedTrader?.name || "Crowned Trader", orderId: "ORD-2401003", symbol: "NVDA", side: "buy", orderType: "limit", quantity: 75, limitPrice: 875.00, filledQuantity: 75, avgFillPrice: 874.50, status: "filled", timeInForce: "GTC", commission: 1.00, submittedAt: h(24), filledAt: h(23) },
    { integrationId: paperAccount.id, sourceAppId: crownedTrader?.id || null, sourceAppName: crownedTrader?.name || "Crowned Trader", orderId: "ORD-2401004", symbol: "MSFT", side: "sell", orderType: "limit", quantity: 30, limitPrice: 420.00, filledQuantity: 0, status: "pending", timeInForce: "GTC", submittedAt: h(12) },
    { integrationId: paperAccount.id, sourceAppId: situTrader?.id || null, sourceAppName: situTrader?.name || "Situ Trader", orderId: "ORD-2401005", symbol: "META", side: "buy", orderType: "stop_limit", quantity: 40, limitPrice: 510.00, stopPrice: 505.00, filledQuantity: 0, status: "submitted", timeInForce: "DAY", submittedAt: h(6) },
    { integrationId: paperAccount.id, sourceAppId: situTrader?.id || null, sourceAppName: situTrader?.name || "Situ Trader", orderId: "ORD-2401006", symbol: "AMZN", side: "sell", orderType: "market", quantity: 20, filledQuantity: 20, avgFillPrice: 185.20, status: "filled", timeInForce: "DAY", commission: 1.00, submittedAt: h(3), filledAt: h(3) },
    { integrationId: paperAccount.id, sourceAppId: crownedTrader?.id || null, sourceAppName: crownedTrader?.name || "Crowned Trader", orderId: "ORD-2401007", symbol: "SPY", side: "buy", orderType: "limit", quantity: 200, limitPrice: 502.50, filledQuantity: 0, status: "cancelled", timeInForce: "DAY", submittedAt: h(72), cancelledAt: h(71) },
    { integrationId: paperAccount.id, sourceAppId: situTrader?.id || null, sourceAppName: situTrader?.name || "Situ Trader", orderId: "ORD-2401008", symbol: "GOOGL", side: "buy", orderType: "market", quantity: 25, filledQuantity: 25, avgFillPrice: 172.80, status: "filled", timeInForce: "DAY", commission: 1.00, submittedAt: h(1), filledAt: h(1) },
  ]);

  await db.insert(ibkrPositions).values([
    { integrationId: paperAccount.id, sourceAppId: situTrader?.id || null, sourceAppName: situTrader?.name || "Situ Trader", symbol: "AAPL", quantity: 100, avgCost: 178.45, marketPrice: 182.30, marketValue: 18230, unrealizedPnl: 385.00, realizedPnl: 0, currency: "USD" },
    { integrationId: paperAccount.id, sourceAppId: situTrader?.id || null, sourceAppName: situTrader?.name || "Situ Trader", symbol: "TSLA", quantity: 50, avgCost: 248.30, marketPrice: 255.10, marketValue: 12755, unrealizedPnl: 340.00, realizedPnl: 0, currency: "USD" },
    { integrationId: paperAccount.id, sourceAppId: crownedTrader?.id || null, sourceAppName: crownedTrader?.name || "Crowned Trader", symbol: "NVDA", quantity: 75, avgCost: 874.50, marketPrice: 890.25, marketValue: 66768.75, unrealizedPnl: 1181.25, realizedPnl: 0, currency: "USD" },
    { integrationId: paperAccount.id, sourceAppId: situTrader?.id || null, sourceAppName: situTrader?.name || "Situ Trader", symbol: "GOOGL", quantity: 25, avgCost: 172.80, marketPrice: 174.50, marketValue: 4362.50, unrealizedPnl: 42.50, realizedPnl: 0, currency: "USD" },
  ]);
}
