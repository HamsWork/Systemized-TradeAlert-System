import type { Signal, ConnectedApp } from "@shared/schema";

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
  webhookUrl: string | null;
  instrumentType: string;
}

export async function sendSignalDiscordAlert(
  signal: Signal,
  app: ConnectedApp,
): Promise<DiscordSendResult> {
  const data = signal.data as Record<string, any>;
  const instrumentType = data.instrument_type || "Options";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);

  if (!webhookUrl) {
    console.log(`[Discord] No webhook configured for ${instrumentType} on app ${app.name}`);
    return { sent: false, webhookUrl: null, instrumentType };
  }

  const ticker = data.ticker || "UNKNOWN";
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

  const sent = await sendWebhook(webhookUrl, "@everyone", [embed]);
  return { sent, webhookUrl, instrumentType };
}

export async function sendTradeExecutedDiscordAlert(
  signal: Signal,
  app: ConnectedApp,
  tradeResult: { orderId: number; status: string; symbol: string; side: string; quantity: number },
): Promise<boolean> {
  const data = signal.data as Record<string, any>;
  const instrumentType = data.instrument_type || "Options";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);

  if (!webhookUrl) return false;

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

  return sendWebhook(webhookUrl, "", [embed]);
}
