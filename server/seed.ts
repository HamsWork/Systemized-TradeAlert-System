import { db } from "./db";
import { alerts, signals, activityLog, connectedApps, systemSettings, integrations } from "@shared/schema";
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

  const needsAlertSeed = existingAlerts.length === 0;
  const needsSettingsSeed = existingSettings.length === 0;
  const needsIntegrationsSeed = existingIntegrations.length === 0;
  const needsAppsSeed = existingApps.length === 0;

  if (!needsAlertSeed && !needsSettingsSeed && !needsIntegrationsSeed && !needsAppsSeed) {
    return;
  }

  if (!needsAlertSeed) {
    if (needsSettingsSeed) await seedSettings();
    if (needsIntegrationsSeed) await seedIntegrations();
    if (needsAppsSeed) await seedApps();
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
      sourceAppName: "Situ Trader",
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
      sourceAppName: "Crowned Trader",
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
      sourceAppName: "Situ Trader",
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
      sourceAppName: "Crowned Trader",
    },
  ]);

  await seedApps();
  await seedSettings();
  await seedIntegrations();

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
      type: "signal_ingested",
      title: "Signal from Situ Trader: BUY AAPL",
      description: "Technical signal at $189.50 with 78% confidence",
      symbol: "AAPL",
      metadata: { sourceApp: "Situ Trader" },
    },
    {
      type: "signal_ingested",
      title: "Signal from Crowned Trader: SELL TSLA",
      description: "Sentiment signal at $248.90 with 65% confidence",
      symbol: "TSLA",
      metadata: { sourceApp: "Crowned Trader" },
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
    { key: "alert_system_enabled", value: "true", category: "alerts", label: "Alert System", description: "Master switch for the alert monitoring system", type: "boolean" },
    { key: "alert_sound_enabled", value: "true", category: "alerts", label: "Alert Sounds", description: "Play audio notifications when alerts trigger", type: "boolean" },
    { key: "alert_email_enabled", value: "false", category: "alerts", label: "Email Notifications", description: "Send email when alerts trigger", type: "boolean" },
    { key: "alert_auto_pause", value: "true", category: "alerts", label: "Auto-Pause Triggered", description: "Automatically pause alerts after they trigger", type: "boolean" },
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
      type: "discord",
      name: "Trading Alerts Channel",
      status: "active",
      config: { webhookUrl: "https://discord.com/api/webhooks/xxxx/yyyy", channelName: "#trading-alerts", serverId: "123456789" },
      enabled: true,
      notifyAlerts: true,
      notifySignals: true,
      notifyTrades: false,
      notifySystem: false,
      autoTrade: false,
      paperTrade: false,
    },
    {
      type: "discord",
      name: "System Notifications",
      status: "active",
      config: { webhookUrl: "https://discord.com/api/webhooks/aaaa/bbbb", channelName: "#system-logs", serverId: "123456789" },
      enabled: true,
      notifyAlerts: false,
      notifySignals: false,
      notifyTrades: false,
      notifySystem: true,
      autoTrade: false,
      paperTrade: false,
    },
    {
      type: "ibkr",
      name: "IBKR Paper Account",
      status: "active",
      config: { accountId: "DU12345678", host: "127.0.0.1", port: 7497, clientId: 1, accountType: "paper" },
      enabled: true,
      notifyAlerts: false,
      notifySignals: false,
      notifyTrades: true,
      notifySystem: false,
      autoTrade: false,
      paperTrade: true,
    },
    {
      type: "ibkr",
      name: "IBKR Live Account",
      status: "inactive",
      config: { accountId: "U98765432", host: "127.0.0.1", port: 7496, clientId: 2, accountType: "live" },
      enabled: false,
      notifyAlerts: false,
      notifySignals: false,
      notifyTrades: true,
      notifySystem: false,
      autoTrade: false,
      paperTrade: false,
    },
  ]);
}
