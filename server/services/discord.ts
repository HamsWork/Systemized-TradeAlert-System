import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";

interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color: number;
  fields?: DiscordField[];
  footer?: { text: string };
  timestamp?: string;
}

const GREEN = 0x22c55e;
const RED = 0xef4444;
const BLUE = 0x3b82f6;
const SPACER: DiscordField = { name: "\u200b", value: "", inline: false };
const DISCLAIMER = "Disclaimer: Not financial advice. Trade at your own risk.";

function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "\u2014";
  return `$${Number(p).toFixed(2)}`;
}

async function sendWebhook(
  url: string,
  content: string,
  embeds: DiscordEmbed[],
  isRetry = false,
): Promise<boolean> {
  if (!url) {
    console.log("[Discord] Webhook URL not configured");
    return false;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds }),
    });

    if (res.status === 429 && !isRetry) {
      const body = await res.json().catch(() => ({}));
      const retryAfter = (body as { retry_after?: number }).retry_after ?? 1;
      console.log(`[Discord] Rate limited, retrying after ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return sendWebhook(url, content, embeds, true);
    }

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[Discord] Webhook failed: ${res.status} ${body}`);
      return false;
    }

    console.log(`[Discord] Webhook sent successfully`);
    return true;
  } catch (err: any) {
    console.warn(`[Discord] Webhook error: ${err.message}`);
    return false;
  }
}

function getWebhookForInstrument(app: ConnectedApp, instrumentType: string): string | null {
  switch (instrumentType) {
    case "Options":
      return app.discordWebhookOptions || null;
    case "Shares":
      return app.discordWebhookShares || null;
    case "LETF":
      return app.discordWebhookLetf || null;
    default:
      return app.discordWebhookOptions || app.discordWebhookShares || app.discordWebhookLetf || null;
  }
}

export interface DiscordSendResult {
  sent: boolean;
  error: string | null;
}

export async function sendSignalDiscordAlert(
  signal: Signal,
  app: ConnectedApp,
): Promise<DiscordSendResult> {
  const data = signal.data as Record<string, any>;
  const ticker = data.ticker || "UNKNOWN";
  const instrumentType = data.instrument_type || "Options";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);

  if (!webhookUrl) {
    console.log(`[Discord] No webhook configured for ${instrumentType} on app ${app.name}`);

    await storage.createDiscordMessage({
      signalId: signal.id,
      webhookUrl: "",
      channelType: "signal",
      instrumentType,
      status: "failed",
      messageType: "signal_alert",
      embedData: { ticker, direction: data.direction, instrumentType },
      error: `No webhook configured for ${instrumentType}`,
      sourceAppId: app.id,
      sourceAppName: app.name,
    });

    return { sent: false, error: `No webhook configured for ${instrumentType}` };
  }

  const direction = data.direction || "Long";
  const entryPrice = data.entry_price;

  const isLong = direction === "Long";
  const color = isLong ? GREEN : RED;
  const directionEmoji = isLong ? "🟢" : "🔴";
  const arrow = isLong ? "⬆️" : "⬇️";

  let heading = "";
  if (instrumentType === "Options") {
    heading = `**🚨 ${ticker} Options Alert**`;
  } else if (instrumentType === "LETF") {
    heading = `**🚨 ${ticker} → Swing Alert**`;
  } else {
    heading = `**🚨 ${ticker} Shares Alert**`;
  }

  const fields: DiscordField[] = [
    { name: `${directionEmoji} Ticker`, value: ticker, inline: true },
    { name: `${arrow} Direction`, value: direction, inline: true },
    { name: "📊 Type", value: instrumentType, inline: true },
    { ...SPACER },
  ];

  if (entryPrice) {
    fields.push({ name: "💰 Entry Price", value: fmtPrice(entryPrice), inline: true });
  }

  if (instrumentType === "Options" && data.expiration) {
    fields.push({ name: "📅 Expiration", value: data.expiration, inline: true });
    if (data.strike) {
      fields.push({ name: "🎯 Strike", value: fmtPrice(data.strike), inline: true });
    }
  }

  fields.push({ ...SPACER });

  const tradePlanParts: string[] = [];
  if (data.targets && typeof data.targets === "object") {
    for (const [key, val] of Object.entries(data.targets)) {
      const t = val as any;
      if (t && t.price) {
        let line = `🎯 ${key.toUpperCase()}: ${fmtPrice(t.price)}`;
        if (t.raise_stop_loss?.price) {
          line += ` (SL → ${fmtPrice(t.raise_stop_loss.price)})`;
        }
        tradePlanParts.push(line);
      }
    }
  }
  if (data.stop_loss != null) {
    tradePlanParts.push(`🛑 Stop Loss: ${fmtPrice(data.stop_loss)}`);
  }
  if (data.time_stop) {
    tradePlanParts.push(`⏱️ Time Stop: ${data.time_stop}`);
  }

  if (tradePlanParts.length > 0) {
    fields.push({
      name: "📝 Trade Plan",
      value: tradePlanParts.join("\n"),
      inline: false,
    });
  }

  fields.push({
    name: "📡 Source",
    value: app.name,
    inline: false,
  });

  const embed: DiscordEmbed = {
    description: heading,
    color,
    fields,
    footer: { text: DISCLAIMER },
    timestamp: new Date().toISOString(),
  };

  let sent = false;
  let error: string | null = null;
  try {
    sent = await sendWebhook(webhookUrl, "@everyone", [embed]);
    if (!sent) error = "Webhook request failed";
  } catch (err: any) {
    error = err.message;
  }

  await storage.createDiscordMessage({
    signalId: signal.id,
    webhookUrl,
    channelType: "signal",
    instrumentType,
    status: sent ? "sent" : "error",
    messageType: "signal_alert",
    embedData: { ticker, direction, instrumentType },
    error,
    sourceAppId: app.id,
    sourceAppName: app.name,
  });

  if (sent) {
    await storage.createActivity({
      type: "discord_sent",
      title: `Discord alert sent for ${ticker}`,
      description: `Signal alert sent to Discord via ${app.name}`,
      symbol: ticker,
      signalId: signal.id,
      metadata: { sourceApp: app.name, sourceAppId: app.id },
    });
  }

  return { sent, error };
}

export async function sendTradeExecutedDiscordAlert(
  signal: Signal,
  app: ConnectedApp,
  tradeResult: { orderId: number; status: string; symbol: string; side: string; quantity: number },
): Promise<DiscordSendResult> {
  const data = signal.data as Record<string, any>;
  const ticker = data.ticker || "UNKNOWN";
  const instrumentType = data.instrument_type || "Options";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);

  if (!webhookUrl) {
    await storage.createDiscordMessage({
      signalId: signal.id,
      webhookUrl: "",
      channelType: "signal",
      instrumentType,
      status: "failed",
      messageType: "trade_executed",
      embedData: { ticker, orderId: tradeResult.orderId, side: tradeResult.side, status: tradeResult.status },
      error: `No webhook configured for ${instrumentType}`,
      sourceAppId: app.id,
      sourceAppName: app.name,
    });
    return { sent: false, error: `No webhook configured for ${instrumentType}` };
  }

  const fields: DiscordField[] = [
    { name: "📊 Symbol", value: tradeResult.symbol, inline: true },
    { name: "📈 Side", value: tradeResult.side.toUpperCase(), inline: true },
    { name: "📦 Quantity", value: tradeResult.quantity.toString(), inline: true },
    { ...SPACER },
    { name: "🔑 IBKR Order ID", value: tradeResult.orderId.toString(), inline: true },
    { name: "📋 Status", value: tradeResult.status, inline: true },
  ];

  const embed: DiscordEmbed = {
    description: `**✅ Trade Executed: ${tradeResult.symbol}**`,
    color: BLUE,
    fields,
    footer: { text: DISCLAIMER },
    timestamp: new Date().toISOString(),
  };

  let sent = false;
  let error: string | null = null;
  try {
    sent = await sendWebhook(webhookUrl, "", [embed]);
    if (!sent) error = "Webhook request failed";
  } catch (err: any) {
    error = err.message;
  }

  await storage.createDiscordMessage({
    signalId: signal.id,
    webhookUrl,
    channelType: "signal",
    instrumentType,
    status: sent ? "sent" : "error",
    messageType: "trade_executed",
    embedData: { ticker, orderId: tradeResult.orderId, side: tradeResult.side, status: tradeResult.status },
    error,
    sourceAppId: app.id,
    sourceAppName: app.name,
  });

  return { sent, error };
}
