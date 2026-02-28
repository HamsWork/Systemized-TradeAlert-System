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

function fmtPct(base: number | null, target: number): string {
  if (!base || base === 0) return "?";
  return `${(((target - base) / base) * 100).toFixed(1)}%`;
}

function buildOptionsFields(
  data: Record<string, any>,
  ticker: string,
  direction: string,
  optionPrice: number | null,
  stockPrice: number | null,
): DiscordField[] {
  const right = direction === "Put" ? "PUT" : "CALL";
  const fields: DiscordField[] = [
    { name: "🟢 Ticker", value: ticker, inline: true },
    { name: "📊 Stock Price", value: stockPrice ? fmtPrice(stockPrice) : "—", inline: true },
    { ...SPACER },
    { name: "❌ Expiration", value: data.expiration || "—", inline: true },
    { name: "✍️ Strike", value: `${data.strike || "—"} ${right}`, inline: true },
    { name: "💵 Option Price", value: optionPrice ? fmtPrice(optionPrice) : "—", inline: true },
    { ...SPACER },
  ];

  const tradePlanParts: string[] = [];
  if (data.targets && typeof data.targets === "object") {
    const targetEntries = Object.entries(data.targets).filter(([, val]) => (val as any)?.price);
    const targetPrices = targetEntries.map(([, val]) => {
      const price = Number((val as any).price);
      const pct = optionPrice ? fmtPct(optionPrice, price) : null;
      return pct ? `${fmtPrice(price)} (${pct})` : fmtPrice(price);
    });
    if (targetPrices.length > 0) {
      tradePlanParts.push(`🎯 Targets: ${targetPrices.join(", ")}`);
    }
  }

  if (data.stop_loss != null) {
    const sl = Number(data.stop_loss);
    const slPct = optionPrice ? fmtPct(optionPrice, sl) : null;
    let slText = `🛑 Stop Loss: ${fmtPrice(sl)}(${slPct || "?"})`;
    const allTargets = Object.entries(data.targets || {}).filter(([, val]) => (val as any)?.price);
    allTargets.forEach(([, val], i) => {
      const rsl = Number((val as any).raise_stop_loss?.price);
      const rslPct = optionPrice ? fmtPct(optionPrice, rsl) : null;
      slText += ` → ${fmtPrice(rsl)}(${rslPct || "?"}) after TP${i + 1}`;
    });
    tradePlanParts.push(slText);
  }

  if (data.time_stop) {
    tradePlanParts.push(`🌐 Time Stop: ${data.time_stop}`);
  }

  if (tradePlanParts.length > 0) {
    fields.push({ name: "📝 Trade Plan", value: tradePlanParts.join("\n"), inline: false });
  }

  if (data.targets && typeof data.targets === "object") {
    const tpLines: string[] = [];
    const entries = Object.entries(data.targets).filter(([, val]) => (val as any)?.price);
    entries.forEach(([, val], i) => {
      const t = val as any;
      const price = Number(t.price);
      const pct = optionPrice ? fmtPct(optionPrice, price) : null;
      const takeOff = t.take_off_percent ? `${t.take_off_percent}%` : "100%";
      const positionLabel = i === 0 ? "of position" : "of remaining position";
      let line = `Take Profit (${i + 1}): At ${pct || fmtPrice(price)} take off ${takeOff} ${positionLabel}`;
      if (t.raise_stop_loss?.price) {
        const rslPrice = Number(t.raise_stop_loss.price);
        const isBreakEven = optionPrice && Math.abs(rslPrice - optionPrice) < 0.01;
        line += isBreakEven ? " and raise stop loss to break even." : ` and raise stop loss to ${fmtPrice(rslPrice)}.`;
      } else {
        line += ".";
      }
      tpLines.push(line);
    });
    if (tpLines.length > 0) {
      fields.push({ ...SPACER });
      fields.push({ name: "💰 Take Profit Plan", value: tpLines.join("\n"), inline: false });
    }
  }

  return fields;
}

function buildSharesFields(
  data: Record<string, any>,
  ticker: string,
  direction: string,
  entryPrice: number | null,
): DiscordField[] {
  const fields: DiscordField[] = [
    { name: "🟢 Ticker", value: ticker, inline: true },
    { name: "💹 Entry Price", value: entryPrice ? fmtPrice(entryPrice) : "—", inline: true },
    { ...SPACER },
  ];

  const tradePlanParts: string[] = [];
  if (data.targets && typeof data.targets === "object") {
    const targetPrices = Object.entries(data.targets)
      .filter(([, val]) => (val as any)?.price)
      .map(([, val]) => {
        const price = Number((val as any).price);
        const pct = entryPrice ? fmtPct(entryPrice, price) : null;
        return pct ? `${fmtPrice(price)} (${pct})` : fmtPrice(price);
      });
    if (targetPrices.length > 0) {
      tradePlanParts.push(`🎯 Targets: ${targetPrices.join(", ")}`);
    }
  }

  if (data.stop_loss != null) {
    const sl = Number(data.stop_loss);
    const slPct = entryPrice ? fmtPct(entryPrice, sl) : null;
    let slText = `🛑 Stop Loss: ${fmtPrice(sl)}(${slPct || "?"})`;
    const allTargets = Object.entries(data.targets || {}).filter(([, val]) => (val as any)?.price);
    allTargets.forEach(([, val], i) => {
      const rsl = Number((val as any).raise_stop_loss?.price);
      const rslPct = entryPrice ? fmtPct(entryPrice, rsl) : null;
      slText += ` → ${fmtPrice(rsl)}(${rslPct || "?"}) after TP${i + 1}`;
    });
    tradePlanParts.push(slText);
  }

  if (data.time_stop) {
    tradePlanParts.push(`🌐 Time Stop: ${data.time_stop}`);
  }

  if (tradePlanParts.length > 0) {
    fields.push({ name: "📝 Trade Plan", value: tradePlanParts.join("\n"), inline: false });
  }

  if (data.targets && typeof data.targets === "object") {
    const tpLines: string[] = [];
    const entries = Object.entries(data.targets).filter(([, val]) => (val as any)?.price);
    entries.forEach(([, val], i) => {
      const t = val as any;
      const price = Number(t.price);
      const pct = entryPrice ? fmtPct(entryPrice, price) : null;
      const takeOff = t.take_off_percent ? `${t.take_off_percent}%` : "100%";
      const positionLabel = i === 0 ? "of position" : "of remaining position";
      let line = `Take Profit (${i + 1}): At ${pct || fmtPrice(price)} take off ${takeOff} ${positionLabel}`;
      if (t.raise_stop_loss?.price) {
        const rslPrice = Number(t.raise_stop_loss.price);
        const isBreakEven = entryPrice && Math.abs(rslPrice - entryPrice) < 0.01;
        line += isBreakEven ? " and raise stop loss to break even." : ` and raise stop loss to ${fmtPrice(rslPrice)}.`;
      } else {
        line += ".";
      }
      tpLines.push(line);
    });
    if (tpLines.length > 0) {
      fields.push({ ...SPACER });
      fields.push({ name: "💰 Take Profit Plan", value: tpLines.join("\n"), inline: false });
    }
  }

  return fields;
}

function buildEmbedFields(
  instrumentType: string,
  data: Record<string, any>,
  ticker: string,
  direction: string,
  entryPrice: number | null,
  stockPrice: number | null,
): DiscordField[] {
  if (instrumentType === "Options") {
    return buildOptionsFields(data, ticker, direction, entryPrice, stockPrice);
  }
  return buildSharesFields(data, ticker, direction, entryPrice || stockPrice);
}

export interface DiscordSendResult {
  sent: boolean;
  error: string | null;
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
  const ticker = data.ticker || "UNKNOWN";
  const instrumentType = data.instrument_type || "Options";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);

  if (!webhookUrl) {
    console.log(
      `[Discord] No webhook configured for ${instrumentType} on app ${app.name}`,
    );
    return {
      sent: false,
      error: `No webhook configured for ${instrumentType} on app ${app.name}`,
    };
  }

  const direction = data.direction || "Long";
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const stockPrice = data.entry_underlying_price ? Number(data.entry_underlying_price) : null;
  const isBullish = direction === "Call" || direction === "Long";
  const color = isBullish ? GREEN : RED;

  const heading = `**🚨 ${ticker} Trade Alert**`;

  const fields: DiscordField[] = buildEmbedFields(instrumentType, data, ticker, direction, entryPrice, stockPrice);

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
