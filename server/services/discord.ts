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

function getWebhookForInstrument(
  app: ConnectedApp,
  instrumentType: string,
): string | null {
  switch (instrumentType) {
    case "Options":
      return app.discordWebhookOptions || null;
    case "Shares":
      return app.discordWebhookShares || null;
    case "LETF":
      return app.discordWebhookLetf || null;
    default:
      return (
        app.discordWebhookOptions ||
        app.discordWebhookShares ||
        app.discordWebhookLetf ||
        null
      );
  }
}

export interface DiscordSendResult {
  sent: boolean;
  error: string | null;
}

function buildEntryDiscordEmbed(data: Record<string, any>): DiscordEmbed {
  const ticker = data.ticker || "UNKNOWN";
  const instrumentType = data.instrument_type || "Options";
  const direction = data.direction || "Long";
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const isLong = direction === "Long";
  const color = isLong ? GREEN : RED;

  const heading = `**🚨 ${ticker} Trade Alert**`;

  const fields: DiscordField[] = [
    { name: "🟢 Ticker", value: ticker, inline: true },
    { name: "💹 Entry Price", value: entryPrice ? fmtPrice(entryPrice) : "—", inline: true },
  ];

  if (instrumentType === "Options") {
    fields.push({ ...SPACER });
    if (data.expiration) {
      fields.push({ name: "✖ Expiration", value: data.expiration, inline: true });
    }
    if (data.strike) {
      const right = data.right?.toUpperCase() === "P" ? "PUT" : "CALL";
      fields.push({ name: "🪙 Strike", value: `${data.strike} ${right}`, inline: true });
    }
  }

  fields.push({ ...SPACER });

  const tradePlanParts: string[] = [];

  if (data.targets && typeof data.targets === "object") {
    const targetPrices = Object.entries(data.targets)
      .filter(([, val]) => (val as any)?.price)
      .map(([, val]) => {
        const price = Number((val as any).price);
        const pct = entryPrice ? (((price - entryPrice) / entryPrice) * 100).toFixed(1) : null;
        return pct ? `${fmtPrice(price)} (${Number(pct) >= 0 ? "+" : ""}${pct}%)` : fmtPrice(price);
      });
    if (targetPrices.length > 0) {
      tradePlanParts.push(`🎯 Targets: ${targetPrices.join(", ")}`);
    }
  }

  if (data.stop_loss != null) {
    const sl = Number(data.stop_loss);
    const pct = entryPrice ? (((sl - entryPrice) / entryPrice) * 100).toFixed(1) : null;
    const slText = pct ? `${fmtPrice(sl)} (${Number(pct) >= 0 ? "+" : ""}${pct}%)` : fmtPrice(sl);
    tradePlanParts.push(`🟠 Stop Loss: ${slText}`);
  }

  if (data.time_stop) {
    tradePlanParts.push(`🌐 Time Horizon: ${data.time_stop}`);
  }

  if (tradePlanParts.length > 0) {
    fields.push({
      name: "📝 Trade Plan",
      value: tradePlanParts.join("\n"),
      inline: false,
    });
  }

  if (data.targets && typeof data.targets === "object") {
    const tpLines: string[] = [];
    const entries = Object.entries(data.targets).filter(([, val]) => (val as any)?.price);
    entries.forEach(([key, val], i) => {
      const t = val as any;
      const price = Number(t.price);
      const pct = entryPrice ? (((price - entryPrice) / entryPrice) * 100).toFixed(1) : null;
      let line = `Take Profit (${i + 1}): At ${pct ? `${Number(pct) >= 0 ? "+" : ""}${pct}%` : fmtPrice(price)}`;
      if (t.raise_stop_loss?.price) {
        line += ` raise stop loss to ${fmtPrice(t.raise_stop_loss.price)}`;
      }
      tpLines.push(line);
    });
    if (tpLines.length > 0) {
      fields.push({
        name: "💰 Take Profit Plan",
        value: tpLines.join("\n"),
        inline: false,
      });
    }
  }

  return {
    description: heading,
    color,
    fields,
    footer: { text: DISCLAIMER },
    timestamp: new Date().toISOString(),
  };
}

export async function sendSignalDiscordAlert(
  signal: Signal,
  app: ConnectedApp | null,
): Promise<DiscordSendResult> {
  if (!app) {
    return { sent: false, error: "No connected app provided" };
  }
  if (!app.sendDiscordMessages) {
    return { sent: false, error: `Discord messages disabled for ${app.name}` };
  }

  const data = signal.data as Record<string, any>;
  const instrumentType = data.instrument_type || "Options";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);

  if (!webhookUrl) {
    console.log(`[Discord] No webhook configured for ${instrumentType} on app ${app.name}`);
    return { sent: false, error: `No webhook configured for ${instrumentType} on app ${app.name}` };
  }

  const embed = buildEntryDiscordEmbed(data);

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
  app: ConnectedApp | null,
  tradeResult: {
    orderId: number;
    status: string;
    symbol: string;
    side: string;
    quantity: number;
  },
): Promise<DiscordSendResult> {
  if (!app) {
    return { sent: false, error: "No connected app provided" };
  }
  if (!app.sendDiscordMessages) {
    return { sent: false, error: `Discord messages disabled for ${app.name}` };
  }

  const data = signal.data as Record<string, any>;
  const ticker = data.ticker || "UNKNOWN";
  const instrumentType = data.instrument_type || "Options";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);

  if (!webhookUrl) {
    return {
      sent: false,
      error: `No webhook configured for ${instrumentType}`,
    };
  }

  const fields: DiscordField[] = [
    { name: "📊 Symbol", value: tradeResult.symbol, inline: true },
    { name: "📈 Side", value: tradeResult.side.toUpperCase(), inline: true },
    {
      name: "📦 Quantity",
      value: tradeResult.quantity.toString(),
      inline: true,
    },
    { ...SPACER },
    {
      name: "🔑 IBKR Order ID",
      value: tradeResult.orderId.toString(),
      inline: true,
    },
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
    embedData: {
      ticker,
      orderId: tradeResult.orderId,
      side: tradeResult.side,
      status: tradeResult.status,
    },
    error,
    sourceAppId: app.id,
    sourceAppName: app.name,
  });

  return { sent, error };
}
