import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";
import { getLETFUnderlying, getLETFLeverage } from "../constants/letf";
import { getCurrentInstrumentPrice } from "./trade-monitor";

/**
 * Price terminology (see server/docs/PRICE_TERMINOLOGY.md):
 * - currentTrackingPrice: price used for target/SL comparison (underlying when underlying_price_based, else instrument).
 * - currentInstrumentPrice: actual instrument price (option premium, LETF share, or stock) for P&L and display.
 */

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
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

function fmtPnl(p: number): string {
  const sign = p >= 0 ? "+" : "";
  return `${sign}$${Number(p).toFixed(2)}`;
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

export async function sendDirectWebhook(
  webhookUrl: string,
  payload: { content?: string; embeds: any[] },
): Promise<{ sent: boolean; error: string | null }> {
  let sent = false;
  let error: string | null = null;
  try {
    sent = await sendWebhook(
      webhookUrl,
      payload.content || "",
      payload.embeds || [],
    );
    if (!sent) error = "Webhook request failed";
  } catch (err: any) {
    error = err.message;
  }
  return { sent, error };
}

export async function sendRawDiscordEmbed(
  signal: Signal,
  app: ConnectedApp,
  payload: { content?: string; embeds: any[] },
  messageType: string,
): Promise<{ sent: boolean; error: string | null }> {
  const data = (signal.data || {}) as Record<string, any>;
  const instrumentType = data.instrument_type || "Shares";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);
  if (!webhookUrl)
    return { sent: false, error: `No webhook for ${instrumentType}` };

  let sent = false;
  let error: string | null = null;
  try {
    sent = await sendWebhook(
      webhookUrl,
      payload.content || "",
      payload.embeds || [],
    );
    if (!sent) error = "Webhook request failed";
  } catch (err: any) {
    error = err.message;
  }

  const ticker = data.ticker || data.symbol || "UNKNOWN";
  await storage
    .createDiscordMessage({
      signalId: signal.id,
      webhookUrl,
      channelType: "signal",
      instrumentType,
      status: sent ? "sent" : "error",
      messageType: `${messageType}_custom`,
      embedData: { ticker, custom: true },
      error,
      sourceAppId: app.id,
      sourceAppName: app.name,
    })
    .catch(() => {});

  return { sent, error };
}

function getContentForInstrument(
  app: ConnectedApp,
  instrumentType: string,
): string {
  const raw = (() => {
    switch (instrumentType) {
      case "Options":
        return app.discordContentOptions;
      case "Shares":
        return app.discordContentShares;
      case "LETF":
        return app.discordContentLetf;
      case "LETF Option":
        return app.discordContentLetfOption;
      case "Crypto":
        return app.discordContentCrypto;
      default:
        return "";
    }
  })();
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed || "";
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
    case "LETF Option":
      return app.discordWebhookLetfOption || null;
    case "Crypto":
      return app.discordWebhookCrypto || null;
    default:
      return (
        app.discordWebhookOptions ||
        app.discordWebhookShares ||
        app.discordWebhookLetf ||
        app.discordWebhookLetfOption ||
        app.discordWebhookCrypto ||
        null
      );
  }
}

function resolveWebhookUrl(
  signal: Signal,
  app: ConnectedApp | null,
  instrumentType: string,
): string | null {
  const data = (signal.data || {}) as Record<string, any>;
  if (
    data.discord_webhook_url &&
    typeof data.discord_webhook_url === "string"
  ) {
    return data.discord_webhook_url;
  }
  if (!app) return null;
  return getWebhookForInstrument(app, instrumentType);
}

function fmtPct(base: number | null, target: number): string {
  if (!base || base === 0) return "?";
  return `${(((target - base) / base) * 100).toFixed(1)}%`;
}

/**
 * Profit % for Discord: Options/LETF Option = instrument return (current - entry)/entry.
 * Shares/LETF/Crypto = directional: Long/Call → (current - entry)/entry, Short/Put → (entry - current)/entry.
 */
function profitPctFromInstrument(
  entry: number,
  current: number,
  instrumentType: string,
  direction: string,
): number {
  const isOption =
    instrumentType === "Options" || instrumentType === "LETF Option";
  if (isOption)
    return ((current - entry) / entry) * 100; // option P&L: we're long the option, profit when option price rises
  const isBullish = direction === "Call" || direction === "Long";
  return isBullish
    ? ((current - entry) / entry) * 100
    : ((entry - current) / entry) * 100;
}

function getUnderlying(data: Record<string, any>, ticker: string): string {
  return data.underlying_symbol || getLETFUnderlying(ticker) || ticker;
}

/** Entry price of the instrument (option price for options, else entry_price). Used for profit % in Discord. */
function getInstrumentEntryPrice(
  data: Record<string, any>,
  instrumentType: string,
): number | null {
  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    const optionPrice =
      data.entry_option_price != null ? Number(data.entry_option_price) : null;
    const entryPrice =
      data.entry_price != null ? Number(data.entry_price) : null;
    return optionPrice ?? entryPrice ?? null;
  }
  return data.entry_price != null ? Number(data.entry_price) : null;
}

function buildOptionsFields(
  data: Record<string, any>,
  ticker: string,
  direction: string,
  optionPrice: number | null,
  stockPrice: number | null,
): DiscordField[] {
  const right = direction === "Put" ? "PUT" : "CALL";
  const isStockBased = data.trade_plan_type === "stock_price_based";
  const displayOptionPrice =
    data.entry_option_price != null
      ? Number(data.entry_option_price)
      : optionPrice;
  const refPrice = isStockBased
    ? stockPrice || optionPrice
    : optionPrice || stockPrice;
  const fields: DiscordField[] = [
    { ...SPACER },
    { name: "🟢 Ticker", value: ticker, inline: true },
    {
      name: "📊 Stock Price",
      value: stockPrice ? fmtPrice(stockPrice) : "—",
      inline: true,
    },
    { ...SPACER },
    { name: "❌ Expiration", value: data.expiration || "—", inline: true },
    {
      name: "✍️ Strike",
      value: `${data.strike || "—"} ${right}`,
      inline: true,
    },
    {
      name: "💵 Option Price",
      value: displayOptionPrice ? fmtPrice(displayOptionPrice) : "—",
      inline: true,
    },
    { ...SPACER },
  ];

  const tradePlanParts: string[] = [];
  if (data.targets && typeof data.targets === "object") {
    const targetEntries = Object.entries(data.targets).filter(
      ([, val]) => (val as any)?.price,
    );
    const targetPrices = targetEntries.map(([, val], i) => {
      const price = Number((val as any).price);
      if (isStockBased) return `${fmtPrice(price)}`;
      const pct = refPrice ? fmtPct(refPrice, price) : null;
      return pct ? `${fmtPrice(price)} (${pct})` : fmtPrice(price);
    });
    if (targetPrices.length > 0) {
      tradePlanParts.push(`🎯 Targets: ${targetPrices.join(", ")}`);
    }
  }

  if (data.stop_loss != null) {
    const sl = Number(data.stop_loss);
    const isBullish = direction === "Call";
    const allTargets = Object.entries(data.targets || {})
      .filter(([, val]) => (val as any)?.price)
      .sort(([, a], [, b]) =>
        isBullish
          ? Number((a as any).price) - Number((b as any).price)
          : Number((b as any).price) - Number((a as any).price),
      );
    let currentStop = sl;
    const addRsl = (rsl: number, slText: string, withPct: boolean): string => {
      const valid = isBullish ? rsl >= currentStop : rsl <= currentStop;
      if (!valid) return slText;
      currentStop = rsl;
      if (withPct) {
        const rslPct = refPrice ? fmtPct(refPrice, rsl) : null;
        return `${slText}, ${fmtPrice(rsl)}(${rslPct || "?"})`;
      }
      return `${slText}, ${fmtPrice(rsl)}`;
    };
    if (isStockBased) {
      let slText = `🛑 Stop Loss: ${fmtPrice(sl)}`;
      allTargets.forEach(([, val]) => {
        if (!(val as any).raise_stop_loss?.price) return;
        slText = addRsl(Number((val as any).raise_stop_loss?.price), slText, false);
      });
      tradePlanParts.push(slText);
    } else {
      const slPct = refPrice ? fmtPct(refPrice, sl) : null;
      let slText = `🛑 Stop Loss: ${fmtPrice(sl)}(${slPct || "?"})`;
      allTargets.forEach(([, val]) => {
        if (!(val as any).raise_stop_loss?.price) return;
        slText = addRsl(Number((val as any).raise_stop_loss?.price), slText, true);
      });
      tradePlanParts.push(slText);
    }
  }

  if (data.time_stop) {
    tradePlanParts.push(`🌐 Time Stop: ${data.time_stop}`);
  }

  if (tradePlanParts.length > 0) {
    fields.push({
      name: isStockBased
        ? "📝 Trade Plan (Based On Underlying Stock)"
        : "📝 Trade Plan",
      value: tradePlanParts.join("\n"),
      inline: false,
    });
  }

  if (data.targets && typeof data.targets === "object") {
    const tpLines: string[] = [];
    const entries = Object.entries(data.targets).filter(
      ([, val]) => (val as any)?.price,
    );
    const priceLabel = (p: number) =>
      isStockBased
        ? fmtPrice(p)
        : (refPrice ? fmtPct(refPrice, p) : null) || fmtPrice(p);
    let tpIndex = 0;
    entries.forEach(([, val]) => {
      const t = val as any;
      if (Number(t.take_off_percent) === 0) return;
      tpIndex++;
      const price = Number(t.price);
      let line = "";
      if (t.take_off_percent) {
        const takeOff = `${t.take_off_percent}%`;
        const positionLabel =
          tpIndex === 1 ? "of position" : "of remaining position";
        line = `Take Profit (${tpIndex}): At ${priceLabel(price)} take off ${takeOff} ${positionLabel}`;
        if (t.raise_stop_loss?.price) {
          const rslPrice = Number(t.raise_stop_loss.price);
          const isBreakEven = refPrice && Math.abs(rslPrice - refPrice) < 0.01;
          line += isBreakEven
            ? " and raise stop loss to break even."
            : ` and raise stop loss to ${fmtPrice(rslPrice)}.`;
        } else {
          line += ".";
        }
      } else {
        line = `Take Profit (${tpIndex}): At ${priceLabel(price)}`;
        if (t.raise_stop_loss?.price) {
          const rslPrice = Number(t.raise_stop_loss.price);
          const isBreakEven = refPrice && Math.abs(rslPrice - refPrice) < 0.01;
          line += isBreakEven
            ? " raise stop loss to break even."
            : ` raise stop loss to ${fmtPrice(rslPrice)}.`;
        } else {
          line += ".";
        }
      }
      tpLines.push(line);
    });
    if (tpLines.length > 0) {
      fields.push({ ...SPACER });
      fields.push({
        name: "💰 Take Profit Plan",
        value: tpLines.join("\n"),
        inline: false,
      });
    }
  }

  return fields;
}

function buildLetfFields(
  data: Record<string, any>,
  ticker: string,
  direction: string,
  entryPrice: number | null,
  stockPrice: number | null,
): DiscordField[] {
  const underlying = getUnderlying(data, ticker);
  const isStockBased =
    data.trade_plan_type === "stock_price_based" ||
    data.underlying_price_based === true;
  const dirText = data.direction
    ? data.direction === "Short"
      ? "BEAR"
      : "BULL"
    : "?";
  // Underlying/stock price at entry (for "Stock Price" and for % vs targets/stop)
  const stockPriceAtEntry =
    data.entry_underlying_price != null
      ? Number(data.entry_underlying_price)
      : (stockPrice ?? null);
  // LETF instrument entry price (for "Leveraged ETF Entry").
  // Prefer the stored entry_instrument_price on the signal; fall back to the original entry price.
  const letfEntryPrice =
    data.entry_instrument_price != null
      ? Number(data.entry_instrument_price)
      : entryPrice ?? 0;
  const stopPrice = data.stop_loss != null ? Number(data.stop_loss) : null;
  const entryForPct = stockPriceAtEntry ?? letfEntryPrice ?? 0;
  const stopPct =
    entryForPct > 0 && stopPrice != null
      ? (((stopPrice - entryForPct) / entryForPct) * 100).toFixed(1)
      : "?";

  const targetsStrParts: string[] = [];
  let tpPlanLines: string[] = [];
  if (data.targets && typeof data.targets === "object") {
    const entries = Object.entries(data.targets)
      .filter(([, val]) => (val as any)?.price)
      .map(([key, val]) => {
        const t = val as any;
        return {
          key,
          price: Number(t.price),
          takeOff: t.take_off_percent ?? 50,
          raiseStop: t.raise_stop_loss?.price
            ? Number(t.raise_stop_loss.price)
            : null,
        };
      })
      .sort((a, b) => a.price - b.price);

    const visibleEntries = entries.filter((t) => Number(t.takeOff) !== 0);
    entries.forEach((t) => {
      if (Number(t.takeOff) === 0) return;
      const pct = entryForPct > 0 ? fmtPct(entryForPct, t.price) : "?";
      targetsStrParts.push(
        isStockBased ? fmtPrice(t.price) : `${fmtPrice(t.price)} (${pct})`,
      );
      const tpIdx = targetsStrParts.length;
      const isBreakEven =
        t.raiseStop != null &&
        entryForPct > 0 &&
        Math.abs(t.raiseStop - entryForPct) < 0.02;
      const positionLabel =
        tpIdx === 1 ? "of position" : "of remaining position";
      const takeOffText =
        tpIdx === 1 ? `${t.takeOff}%` : `remaining ${t.takeOff}%`;
      const action = isBreakEven
        ? `take off ${takeOffText} ${positionLabel} and raise stop loss to break even.`
        : t.raiseStop != null
          ? `take off ${takeOffText} ${positionLabel} and raise stop loss to ${fmtPrice(t.raiseStop)}.`
          : `take off ${takeOffText} ${positionLabel}.`;
      const label =
        visibleEntries.length > 1 ? `Take Profit (${tpIdx})` : "Take Profit";
      const atLabel = isStockBased ? fmtPrice(t.price) : pct;
      tpPlanLines.push(`${label}: At ${atLabel} ${action}`);
    });
  }

  const targetsStr =
    targetsStrParts.length > 0 ? targetsStrParts.join(", ") : "—";
  const tradePlanValue =
    targetsStr !== "—" && stopPrice != null
      ? isStockBased
        ? `🎯 Targets: ${targetsStr}\n🛑 Stop Loss: ${fmtPrice(stopPrice)}`
        : `🎯 Targets: ${targetsStr}\n🛑 Stop Loss: ${fmtPrice(stopPrice)} (${stopPct}%)`
      : stopPrice != null
        ? isStockBased
          ? `🛑 Stop Loss: ${fmtPrice(stopPrice)}`
          : `🛑 Stop Loss: ${fmtPrice(stopPrice)} (${stopPct}%)`
        : "—";
  const tpPlanText = tpPlanLines.length > 0 ? tpPlanLines.join("\n") : "—";

  const dir = data.direction || "Long";
  const fields: DiscordField[] = [
    { ...SPACER },
    { name: "🟢 Ticker", value: underlying, inline: true },
    {
      name: "📊 Stock Price",
      value:
        stockPriceAtEntry != null
          ? `$ ${Number(stockPriceAtEntry).toFixed(2)}`
          : "—",
      inline: true,
    },
    { name: "📈 Direction", value: dir, inline: true },
    { ...SPACER },
    {
      name: "📹 LETF",
      value: `${ticker} (${leverage}x ${dirText})`,
      inline: true,
    },
    {
      name: "💰 LETF Entry",
      value:
        letfEntryPrice > 0
          ? `$ ${Number(letfEntryPrice).toFixed(2)}`
          : "Pending",
      inline: true,
    },
    {
      name: "🛑 Stop",
      value:
        stopPrice != null
          ? isStockBased
            ? fmtPrice(stopPrice)
            : `${fmtPrice(stopPrice)} (${stopPct}%)`
          : "—",
      inline: true,
    },
    { ...SPACER },
    {
      name: isStockBased
        ? "📝 Trade Plan (Based on Underlying Stock)"
        : "📝 Trade Plan",
      value: tradePlanValue,
      inline: false,
    },
    { ...SPACER },
    { name: "💰 Take Profit Plan", value: tpPlanText, inline: false },
  ];

  return fields;
}

function buildSharesFields(
  data: Record<string, any>,
  ticker: string,
  direction: string,
  entryPrice: number | null,
): DiscordField[] {
  const dir = data.direction || direction || "Long";
  const fields: DiscordField[] = [
    { ...SPACER },
    { name: "🟢 Ticker", value: ticker, inline: true },
    {
      name: "📊 Stock Price",
      value: entryPrice ? fmtPrice(entryPrice) : "—",
      inline: true,
    },
    { name: "📈 Direction", value: dir, inline: true },
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
    const allTargets = Object.entries(data.targets || {}).filter(
      ([, val]) => (val as any)?.price,
    );
    allTargets.forEach(([, val], i) => {
      if (!(val as any).raise_stop_loss?.price) return "";
      const rsl = Number((val as any).raise_stop_loss?.price);
      const rslPct = entryPrice ? fmtPct(entryPrice, rsl) : null;
      slText += `, ${fmtPrice(rsl)}(${rslPct || "?"})`;
    });
    tradePlanParts.push(slText);
  }

  if (data.time_stop) {
    tradePlanParts.push(`🌐 Time Stop: ${data.time_stop}`);
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
    const entries = Object.entries(data.targets).filter(
      ([, val]) => (val as any)?.price,
    );
    let sharesTpIndex = 0;
    entries.forEach(([, val]) => {
      const t = val as any;
      if (Number(t.take_off_percent) === 0) return;
      sharesTpIndex++;
      const price = Number(t.price);
      const pct = entryPrice ? fmtPct(entryPrice, price) : null;
      const takeOff = t.take_off_percent ? `${t.take_off_percent}%` : "100%";
      const positionLabel =
        sharesTpIndex === 1 ? "of position" : "of remaining position";
      let line = `Take Profit (${sharesTpIndex}): At ${pct || fmtPrice(price)} take off ${takeOff} ${positionLabel}`;
      if (t.raise_stop_loss?.price) {
        const rslPrice = Number(t.raise_stop_loss.price);
        const isBreakEven =
          entryPrice && Math.abs(rslPrice - entryPrice) < 0.01;
        line += isBreakEven
          ? " and raise stop loss to break even."
          : ` and raise stop loss to ${fmtPrice(rslPrice)}.`;
      } else {
        line += ".";
      }
      tpLines.push(line);
    });
    if (tpLines.length > 0) {
      fields.push({ ...SPACER });
      fields.push({
        name: "💰 Take Profit Plan",
        value: tpLines.join("\n"),
        inline: false,
      });
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
  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    return buildOptionsFields(data, ticker, direction, entryPrice, stockPrice);
  }
  if (instrumentType === "LETF") {
    return buildLetfFields(data, ticker, direction, entryPrice, stockPrice);
  }
  return buildSharesFields(data, ticker, direction, entryPrice || stockPrice);
}

function appendAppName(heading: string, appName?: string): string {
  if (!appName) return heading;
  return heading.replace(/\*\*$/, ` - ${appName}**`);
}

/** Builds the signal alert (entry) embed. Used by preview and send. */
export function buildSignalAlertEmbed(
  data: Record<string, any>,
  ticker: string,
  appName?: string,
): DiscordEmbed {
  const direction = data.direction || "Long";
  const entryPrice = data.entry_price != null ? Number(data.entry_price) : null;
  const stockPrice =
    data.entry_underlying_price != null
      ? Number(data.entry_underlying_price)
      : null;
  const isBullish = direction === "Call" || direction === "Long";
  const instrumentType = data.instrument_type || "Shares";
  const underlying = getUnderlying(data, ticker);
  const heading = appendAppName(
    instrumentType === "LETF"
      ? `**\u{1F6A8} ${ticker} Shares Entry**`
      : instrumentType === "LETF Option"
        ? `**\u{1F6A8} ${ticker} Options Entry**`
        : instrumentType === "Crypto"
          ? `**\u{1F6A8} ${ticker} Crypto Alert**`
          : instrumentType === "Shares"
            ? `**\u{1F6A8} ${ticker} Shares Entry**`
            : `**\u{1F6A8} ${ticker} Options Entry**`,
    appName,
  );
  const fields = buildEmbedFields(
    instrumentType,
    data,
    ticker,
    direction,
    entryPrice,
    stockPrice,
  );
  return {
    description: heading,
    color: isBullish ? GREEN : RED,
    fields,
    footer: { text: DISCLAIMER },
  };
}

/** Builds the target hit embed. Used by preview and send. Profit % is always based on instrument price. */
export function buildTargetHitEmbed(
  data: Record<string, any>,
  ticker: string,
  target: {
    key: string;
    price: number;
    tpNumber?: number;
    takeOffPercent?: number;
    raiseStopLoss?: number;
  },
): DiscordEmbed {
  const instrumentType = data.instrument_type || "Shares";
  const direction = data.direction || "Long";
  const isBullish = direction === "Call" || direction === "Long";
  const takeProfitArr =
    data.targets && typeof data.targets === "object"
      ? (Object.entries(data.targets) as [string, { price?: number; take_off_percent?: number; raise_stop_loss?: { price?: number } }][])
          .filter(([, v]) => v?.price != null && (v?.take_off_percent ?? 0) > 0)
          .sort(([, a], [, b]) =>
            isBullish
              ? Number(a.price) - Number(b.price)
              : Number(b.price) - Number(a.price),
          )
      : [];
  const currentIdx = takeProfitArr.findIndex(([k]) => k === target.key);
  const tpDisplay = target.tpNumber ?? (currentIdx >= 0 ? currentIdx + 1 : target.key.replace(/^tp/i, "") || 1);
  const takeOffPercent =
    target.takeOffPercent ??
    (currentIdx >= 0 && takeProfitArr[currentIdx]?.[1]?.take_off_percent != null
      ? Number(takeProfitArr[currentIdx][1].take_off_percent)
      : 50);
  const nextTarget = currentIdx >= 0 && currentIdx < takeProfitArr.length - 1 ? takeProfitArr[currentIdx + 1] : null;
  const remainingPercent = 100 - takeOffPercent;

  const entryInstrument = getInstrumentEntryPrice(data, instrumentType);
  const isStockBased = data.trade_plan_type === "stock_price_based";
  const isOption =
    instrumentType === "Options" || instrumentType === "LETF Option";
  const underlyingBased =
    data.underlying_price_based === true || (isOption && isStockBased);
  const currentInstrumentPrice =
    data.current_instrument_price != null
      ? Number(data.current_instrument_price)
      : null;
  const isInstrumentPriceBased =
    instrumentType === "Options" ||
    instrumentType === "LETF" ||
    instrumentType === "LETF Option";
  let pctProfit: string | null = null;
  if (entryInstrument != null && entryInstrument > 0) {
    const priceForPct = isInstrumentPriceBased
      ? currentInstrumentPrice
      : (currentInstrumentPrice ?? (!underlyingBased ? target.price : null));
    if (priceForPct != null) {
      const pct = profitPctFromInstrument(
        entryInstrument,
        priceForPct,
        instrumentType,
        direction,
      );
      pctProfit = pct.toFixed(1);
    }
  }
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const isCrypto = instrumentType === "Crypto";
  const isSharesSymbol =
    instrumentType === "LETF" || instrumentType === "Shares"
      ? "Shares"
      : "Options";
  const fields: DiscordField[] = [];
  fields.push({ ...SPACER });
  pushInstrumentFields(fields, instrumentType, data);

  const description = isLETF
    ? `**\u{1F3AF} ${ticker} ${isSharesSymbol} Take Profit ${tpDisplay} HIT**`
    : isCrypto
      ? `**\u{1F3AF} ${ticker} Crypto Take Profit ${tpDisplay} HIT**`
      : `**\u{1F3AF} ${ticker} ${isSharesSymbol} Take Profit ${tpDisplay} HIT**`;
  fields.push(
    {
      name: "\u2705 Entry",
      value: `${fmtPrice(entryInstrument)}`,
      inline: true,
    },
    {
      name: `\u{1F3AF} TP${tpDisplay} Hit`,
      value: `${fmtPrice(target.price)}`,
      inline: true,
    },
    {
      name: "\u{1F4B8} Profit",
      value: `${pctProfit != null ? `${pctProfit}%` : "\u2014"}`,
      inline: true,
    },

    { ...SPACER },
    {
      name: `\u{1F6A8} Status: TP${tpDisplay} Reached \u{1F6A8}`,
      value: "\u200b",
      inline: false,
    },
  );
  const positionMgmtLines = [
    `\u2705 Reduce position by ${takeOffPercent}% (lock in profit)`,
    ...(nextTarget
      ? [
          `\u{1F3AF} Let remaining ${remainingPercent}% ride to TP${Number(tpDisplay) + 1} (${fmtPrice(Number(nextTarget[1].price))})`,
        ]
      : []),
  ];
  const newStopLoss =
    target.raiseStopLoss ??
    (currentIdx >= 0 && takeProfitArr[currentIdx]?.[1]?.raise_stop_loss?.price != null
      ? Number(takeProfitArr[currentIdx][1].raise_stop_loss!.price)
      : null);
  const isBreakEven =
    newStopLoss != null &&
    entryInstrument != null &&
    Math.abs(newStopLoss - entryInstrument) < 0.01;
  const riskMgmtValue =
    newStopLoss != null
      ? isBreakEven
        ? `Raising stop loss to ${fmtPrice(newStopLoss)} (break even) on remaining position to secure gains while allowing room to run.`
        : `Raising stop loss to ${fmtPrice(newStopLoss)} on remaining position to secure gains while allowing room to run.`
      : "No stop adjustment on this target.";
  fields.push({
    name: "\u{1F50D} Position Management",
    value: positionMgmtLines.join("\n"),
    inline: false,
  });
  fields.push({ ...SPACER });
  fields.push({
    name: "\u{1F6E1}\uFE0F Risk Management",
    value: riskMgmtValue,
    inline: false,
  });
  return { description, color: GREEN, fields, footer: { text: DISCLAIMER } };
}

/** Builds the stop loss raised embed. Used by preview and send. Entry and profit based on instrument price. */
export function buildStopLossRaisedEmbed(
  data: Record<string, any>,
  ticker: string,
  targetKey: string,
  newStopLoss: number,
): DiscordEmbed {
  const instrumentType = data.instrument_type || "Shares";
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const isCrypto = instrumentType === "Crypto";
  const isSharesSymbol =
    instrumentType === "LETF" || instrumentType === "Shares"
      ? "Shares"
      : "Options";
  const description = isLETF
    ? `**\u{1F6E1}\uFE0F ${ticker} ${isSharesSymbol} Stop Loss Raised**`
    : isCrypto
      ? `**\u{1F6E1}\uFE0F ${ticker} Crypto Stop Loss Raised**`
      : `**\u{1F6E1}\uFE0F ${ticker} ${isSharesSymbol} Stop Loss Raised**`;
  const targetsArr =
    data.targets && typeof data.targets === "object"
      ? (Object.entries(data.targets) as [string, { price?: number }][])
          .filter(([, v]) => v?.price)
          .sort(([, a], [, b]) => Number(a.price) - Number(b.price))
      : [];
  const currentIdx = targetsArr.findIndex(([k]) => k === targetKey);
  const nextTarget =
    currentIdx >= 0 && currentIdx < targetsArr.length - 1
      ? targetsArr[currentIdx + 1]
      : null;

  const entryInstrument = getInstrumentEntryPrice(data, instrumentType);
  const underlyingPriceBased = data.underlying_price_based === true;
  const entryUnderlying =
    data.entry_underlying_price != null
      ? Number(data.entry_underlying_price)
      : null;
  const entryForStop =
    underlyingPriceBased && entryUnderlying != null
      ? entryUnderlying
      : entryInstrument;
  const isBreakEven =
    entryForStop != null && Math.abs(newStopLoss - entryForStop) < 0.01;
  const direction = data.direction || "Long";
  const isBullish = direction === "Call" || direction === "Long";
  let riskValue: string;
  if (isBreakEven) {
    riskValue = "0% (Risk-Free)";
  } else if (entryForStop != null && entryForStop > 0) {
    const riskPct =
      isBullish
        ? ((entryForStop - newStopLoss) / entryForStop) * 100
        : ((newStopLoss - entryForStop) / entryForStop) * 100;
    riskValue = `${riskPct.toFixed(1)}%`;
  } else {
    riskValue = "\u2014";
  }

  const newStopLabel = isBreakEven
    ? `${fmtPrice(newStopLoss)} (Break Even)`
    : fmtPrice(newStopLoss);
  const statusLabel = isBreakEven
    ? "\u{1F6A8} Status: Stop Loss Raised to Break Even \u{1F6A8}"
    : "\u{1F6A8} Status: Stop Loss Raised \u{1F6A8}";
  const riskMgmtLines = [
    isBreakEven
      ? `Stop loss raised to ${fmtPrice(newStopLoss)} (break even).\nTrade is now risk-free on remaining position.`
      : `Stop loss raised to ${fmtPrice(newStopLoss)} on remaining position.`,
  ];
  if (nextTarget) {
    riskMgmtLines.push(
      `\u{1F3AF} Next target: ${nextTarget[0].toUpperCase()} at ${fmtPrice(Number(nextTarget[1].price))}`,
    );
  }

  const fields: DiscordField[] = [];
  fields.push({ ...SPACER });
  pushInstrumentFields(fields, data.instrument_type || "Shares", data);
  fields.push(
    {
      name: "\u2705 Entry",
      value: `${fmtPrice(entryInstrument)}`,
      inline: true,
    },
    {
      name: "\u{1F6E1}\uFE0F New Stop",
      value: newStopLabel,
      inline: true,
    },
    { name: "\u{1F4B8} Risk", value: riskValue, inline: true },
    { ...SPACER },
    {
      name: statusLabel,
      value: "\u200b",
      inline: false,
    },
  );
  fields.push({
    name: "\u{1F6E1}\uFE0F Risk Management",
    value: riskMgmtLines.join("\n"),
    inline: false,
  });
  return { description, color: ORANGE, fields, footer: { text: DISCLAIMER } };
}

/** Builds the stop loss hit embed. Profit/result % is always based on instrument price. */
export function buildStopLossHitEmbed(
  data: Record<string, any>,
  ticker: string,
  stopLoss: number,
): DiscordEmbed {
  const instrumentType = data.instrument_type || "Shares";
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const isCrypto = instrumentType === "Crypto";
  const isOption =
    instrumentType === "Options" || instrumentType === "LETF Option";
  const isStockBased = data.trade_plan_type === "stock_price_based";
  const isSharesSymbol =
    instrumentType === "LETF" || instrumentType === "Shares"
      ? "Shares"
      : "Options";
  const description = isLETF
    ? `**\u{1F6D1} ${ticker} ${isSharesSymbol} Stop Loss Hit**`
    : isCrypto
      ? `**\u{1F6D1} ${ticker} Crypto Stop Loss Hit**`
      : `**\u{1F6D1} ${ticker} ${isSharesSymbol} Stop Loss Hit**`;
  const underlyingBased =
    data.underlying_price_based === true || (isOption && isStockBased);
  const direction = data.direction || "Long";
  const isBullish = direction === "Call" || direction === "Long";
  const entryInstrument = getInstrumentEntryPrice(data, instrumentType);
  const currentInstrumentPrice =
    data.current_instrument_price != null
      ? Number(data.current_instrument_price)
      : null;
  const stopLossHitPrice =
    data.stop_loss_hit_price != null
      ? Number(data.stop_loss_hit_price)
      : stopLoss;
  let stopLossHitPct: string | null = null;
  if (data.stop_loss_hit_pct != null) {
    stopLossHitPct = String(data.stop_loss_hit_pct);
  } else if (entryInstrument != null && entryInstrument > 0) {
    const priceForPct =
      currentInstrumentPrice ?? (!underlyingBased ? stopLossHitPrice : null);
    if (priceForPct != null) {
      const pct = profitPctFromInstrument(
        entryInstrument,
        priceForPct,
        instrumentType,
        direction,
      );
      stopLossHitPct = pct.toFixed(1);
    }
  }
  const fields: DiscordField[] = [];
  fields.push({ ...SPACER });
  pushInstrumentFields(fields, instrumentType, data);
  fields.push(
    {
      name: "\u2705 Entry",
      value: `${fmtPrice(entryInstrument)}`,
      inline: true,
    },
    {
      name: "\u{1F6D1} Stop Hit",
      value: stopLossHitPrice != null ? fmtPrice(stopLossHitPrice) : "\u2014",
      inline: true,
    },
    {
      name: "\u{1F4B8} Result",
      value: stopLossHitPct ? `${stopLossHitPct}%` : "\u2014",
      inline: true,
    },
    { ...SPACER },
    {
      name: "\u{1F6A8} Status: Stop Loss Hit \u{1F6A8}",
      value: "\u200b",
      inline: false,
    },
    {
      name: "\u{1F6E1}\uFE0F Discipline Matters",
      value: "Following the plan keeps you in the game for winning trades",
      inline: false,
    },
  );
  return {
    description,
    color: RED,
    fields,
    footer: { text: DISCLAIMER },
    timestamp: new Date().toISOString(),
  };
}

/** Builds the trade closed manually embed. Entry, exit, and profit % based on instrument price. */
export function buildTradeClosedEmbed(
  data: Record<string, any>,
  ticker: string,
): DiscordEmbed {
  const instrumentType = data.instrument_type || "Shares";
  const pnl = data.pnl != null ? Number(data.pnl) : null;
  const emoji = pnl != null && pnl > 0 ? "\u{1F4B0}" : "\u{1F4C9}";
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const isCrypto = instrumentType === "Crypto";

  const isSharesSymbol =
    instrumentType === "LETF" || instrumentType === "Shares"
      ? "Shares"
      : "Options";
  const description = isLETF
    ? `**${emoji} ${ticker} ${isSharesSymbol} Closed Manually**`
    : isCrypto
      ? `**${emoji} ${ticker} Crypto Closed Manually**`
      : `**${emoji} ${ticker} ${isSharesSymbol} Closed Manually**`;
  const direction = data.direction || "Long";
  const isBullish = direction === "Call" || direction === "Long";
  const entryInstrument = getInstrumentEntryPrice(data, instrumentType);
  const exitPrice = data.exit_price != null ? Number(data.exit_price) : null;
  let pnlPct: string | null =
    data.pnl_pct != null ? String(data.pnl_pct) : null;
  if (
    pnlPct == null &&
    entryInstrument != null &&
    entryInstrument > 0 &&
    exitPrice != null
  ) {
    const pct = profitPctFromInstrument(
      entryInstrument,
      exitPrice,
      instrumentType,
      direction,
    );
    pnlPct = pct.toFixed(1);
  }
  const rMultiple = data.r_multiple != null ? Number(data.r_multiple) : null;
  const fields: DiscordField[] = [];
  pushInstrumentFields(fields, instrumentType, data);
  fields.push(
    {
      name: "\u2705 Entry",
      value: `${fmtPrice(entryInstrument)}`,
      inline: true,
    },
    { name: "\u{1F3C1} Exit", value: `${fmtPrice(exitPrice)}`, inline: true },
    {
      name: "\u{1F4B8} Profit",
      value: pnlPct != null ? `${pnlPct}%` : "\u2014",
      inline: true,
    },
    { ...SPACER },
    {
      name: "\u{1F6A8} Status: Position Closed \u{1F6A8}",
      value: "\u200b",
      inline: false,
    },
  );
  if (pnl != null) {
    fields.push({
      name: "Total P&L",
      value: `${fmtPnl(pnl)} | R-Multiple: ${rMultiple != null ? rMultiple.toFixed(2) : "\u2014"}`,
      inline: false,
    });
  }
  return { description, color: GRAY, fields, footer: { text: DISCLAIMER } };
}

export interface DiscordSendResult {
  sent: boolean;
  error: string | null;
}

/** Target hit info passed from trade monitor */
export interface TargetHitInfo {
  key: string;
  price: number;
  takeOffPercent: number;
  raiseStopLoss?: number;
}

function getNextTargetKeyAndPrice(
  data: Record<string, any>,
  currentKey: string,
): { key: string; price: number } | null {
  if (!data.targets || typeof data.targets !== "object") return null;
  const entries = Object.entries(data.targets)
    .filter(([, val]) => (val as any)?.price)
    .map(([key, val]) => ({ key, price: Number((val as any).price) }))
    .sort((a, b) => a.price - b.price);
  const idx = entries.findIndex((e) => e.key === currentKey);
  if (idx < 0 || idx >= entries.length - 1) return null;
  return entries[idx + 1];
}

/**
 * Sends a Discord alert when a take-profit target is hit.
 * For LETF, uses the rich format (underlying → LETF, Position Management, Risk Management).
 */
export async function sendTargetHitDiscordAlert(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
  target: TargetHitInfo,
  currentTrackingPrice: number,
  currentInstrumentPrice: number | null,
  signalId: string,
): Promise<void> {
  const hasSignalWebhook = !!signalData.discord_webhook_url;
  if (!hasSignalWebhook && (!app || !app.sendDiscordMessages)) return;
  const instrumentType = signalData.instrument_type || "Shares";
  const signalForWebhook = { id: signalId, data: signalData } as unknown as Signal;
  const webhookUrl = resolveWebhookUrl(signalForWebhook, app, instrumentType);
  if (!webhookUrl) return;

  const ticker = signalData.ticker || "";
  const dataForEmbed = {
    ...signalData,
    current_tracking_price: currentTrackingPrice,
    current_instrument_price: currentInstrumentPrice ?? signalData.current_instrument_price,
  };
  const embed = buildTargetHitEmbed(dataForEmbed, ticker, target);
  const content = app
    ? getContentForInstrument(app, instrumentType)
    : "@everyone";
  const sent = await sendWebhook(webhookUrl, content, [embed]);

  await storage
    .createDiscordMessage({
      signalId,
      webhookUrl,
      channelType: "signal",
      instrumentType,
      status: sent ? "sent" : "error",
      messageType: "target_hit",
      embedData: {
        ticker,
        targetKey: target.key,
        currentPrice: currentTrackingPrice,
      },
      sourceAppId: app?.id ?? null,
      sourceAppName: app?.name ?? null,
    })
    .catch(() => {});
}

const ORANGE = 0xf59e0b;

function pushInstrumentFields(
  fields: DiscordField[],
  instrumentType: string,
  data: Record<string, any>,
): void {
  const entryPrice = data.entry_price != null ? Number(data.entry_price) : null;
  const entryInstrumentPrice = data.entry_instrument_price != null ? Number(data.entry_instrument_price) : null;
  const stockPrice =
    data.entry_underlying_price != null
      ? Number(data.entry_underlying_price)
      : null;
  const ticker = data.ticker || "";
  const direction = data.direction || "Long";

  if (instrumentType === "LETF") {
    const underlying = getUnderlying(data, ticker);
    const dir = direction === "Short" ? "BEAR" : "BULL";
    const leverage = getLETFLeverage(ticker);
    fields.push(
      {
        name: "\u{1F4B9} LETF",
        value:
          leverage && leverage > 0
            ? `${underlying} (${leverage}x ${dir})`
            : `${underlying} (${dir})`,
        inline: true,
      },
      {
        name: "\u{1F4B5} LETF Entry",
        value: entryInstrumentPrice != null ? fmtPrice(entryInstrumentPrice) : "Pending",
        inline: true,
      },
      {
        name: "\u{1F4CA} Stock Price",
        value: stockPrice != null ? fmtPrice(stockPrice) : "\u2014",
        inline: true,
      },
    );
  } else if (instrumentType === "Options" || instrumentType === "LETF Option") {
    const right = direction === "Put" ? "PUT" : "CALL";
    const displayOptionPrice =
      data.current_instrument_price != null
        ? Number(data.current_instrument_price)
        : data.entry_option_price != null
          ? Number(data.entry_option_price)
          : entryPrice;
    fields.push(
      {
        name: "\u274C Expiration",
        value: `${data.expiration ?? "\u2014"}`,
        inline: true,
      },
      {
        name: "\u270D\uFE0F Strike",
        value: `${data.strike ?? "\u2014"} ${right}`,
        inline: true,
      },
      {
        name: "\u{1F4B5} Option Price",
        value:
          displayOptionPrice != null ? fmtPrice(displayOptionPrice) : "\u2014",
        inline: true,
      },
    );
  }
}

/** Target info for stop-loss-raised: key (e.g. tp1) and new stop level. */
export interface StopLossRaisedTarget {
  key: string;
  raiseStopLoss: number;
}

/**
 * Sends a Discord alert when stop loss is raised (e.g. after a target hit).
 */
export async function sendStopLossRaisedDiscord(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
  target: StopLossRaisedTarget,
  currentTrackingPrice: number,
  currentInstrumentPrice: number | null,
  signalId: string,
): Promise<void> {
  const hasSignalWebhook = !!signalData.discord_webhook_url;
  if (!hasSignalWebhook && (!app || !app.sendDiscordMessages)) return;
  const instrumentType = signalData.instrument_type || "Shares";
  const signalForWebhook = { id: signalId, data: signalData } as unknown as Signal;
  const webhookUrl = resolveWebhookUrl(signalForWebhook, app, instrumentType);
  if (!webhookUrl) return;

  const ticker = signalData.ticker || "";
  const dataForEmbed = {
    ...signalData,
    current_instrument_price:
      currentInstrumentPrice ?? signalData.current_instrument_price,
  };
  const embed = buildStopLossRaisedEmbed(
    dataForEmbed,
    ticker,
    target.key,
    target.raiseStopLoss,
  );
  const content = app
    ? getContentForInstrument(app, instrumentType)
    : "@everyone";
  const sent = await sendWebhook(webhookUrl, content, [embed]);

  await storage
    .createDiscordMessage({
      signalId,
      webhookUrl,
      channelType: "signal",
      instrumentType,
      status: sent ? "sent" : "error",
      messageType: "stop_loss_raised",
      embedData: {
        ticker,
        targetKey: target.key,
        newStopLoss: target.raiseStopLoss,
        currentPrice: currentTrackingPrice,
      },
      sourceAppId: app?.id ?? null,
      sourceAppName: app?.name ?? null,
    })
    .catch(() => {});
}

/**
 * Sends a Discord alert when stop loss is hit.
 */
export async function sendStopLossHitDiscord(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
  currentTrackingPrice: number,
  currentInstrumentPrice: number | null,
  signalId: string,
): Promise<void> {
  const hasSignalWebhook = !!signalData.discord_webhook_url;
  if (!hasSignalWebhook && (!app || !app.sendDiscordMessages)) return;
  const instrumentType = signalData.instrument_type || "Shares";
  const signalForWebhook = { id: signalId, data: signalData } as unknown as Signal;
  const webhookUrl = resolveWebhookUrl(signalForWebhook, app, instrumentType);
  if (!webhookUrl) return;

  const ticker = signalData.ticker || "";
  const stopLoss =
    signalData.stop_loss != null ? Number(signalData.stop_loss) : 0;
  const dataForEmbed = {
    ...signalData,
    current_instrument_price:
      currentInstrumentPrice ?? signalData.current_instrument_price,
  };
  const embed = buildStopLossHitEmbed(dataForEmbed, ticker, stopLoss);
  const content = app
    ? getContentForInstrument(app, instrumentType)
    : "@everyone";
  const sent = await sendWebhook(webhookUrl, content, [embed]);

  await storage
    .createDiscordMessage({
      signalId,
      webhookUrl,
      channelType: "signal",
      instrumentType,
      status: sent ? "sent" : "error",
      messageType: "stop_loss_hit",
      embedData: { embeds: [embed] },
    })
    .catch(() => {});
}

const GRAY = 0x6b7280;

/**
 * Sends a Discord alert when a trade is closed manually (via close API).
 */
export async function sendTradeClosedManuallyDiscord(
  signal: Signal,
  app: ConnectedApp | null,
  ticker: string,
  data: Record<string, any>,
): Promise<void> {
  const signalData = (signal.data || {}) as Record<string, any>;
  const hasSignalWebhook = !!signalData.discord_webhook_url;
  if (!hasSignalWebhook && (!app || !app.sendDiscordMessages)) return;
  const instrumentType = data.instrument_type || "Shares";
  const webhookUrl = resolveWebhookUrl(signal, app, instrumentType);
  if (!webhookUrl) return;

  const embed = buildTradeClosedEmbed(data, ticker);
  const content = app
    ? getContentForInstrument(app, instrumentType)
    : "@everyone";
  const sent = await sendWebhook(webhookUrl, content, [embed]);

  await storage
    .createDiscordMessage({
      signalId: signal.id,
      webhookUrl,
      channelType: "signal",
      instrumentType,
      status: sent ? "sent" : "error",
      messageType: "trade_closed_manually",
      embedData: { ticker },
      sourceAppId: app?.id ?? null,
      sourceAppName: app?.name ?? null,
    })
    .catch(() => {});
}

export async function sendSignalDiscordAlert(
  signal: Signal,
  app: ConnectedApp | null,
  overrideWebhookUrl?: string | null,
): Promise<DiscordSendResult> {
  if (!app) {
    return { sent: false, error: "No connected app provided" };
  }
  const useOverride =
    overrideWebhookUrl && overrideWebhookUrl.trim().length > 0;
  if (!useOverride && !app.sendDiscordMessages) {
    return { sent: false, error: `Discord messages disabled for ${app.name}` };
  }

  const data = signal.data as Record<string, any>;
  const ticker = data.ticker || "UNKNOWN";
  const direction = data.direction || "Long";
  const instrumentType = data.instrument_type || "Options";

  let webhookUrl: string | null = null;
  if (useOverride) {
    webhookUrl = overrideWebhookUrl!.trim();
  } else if (data.discord_webhook_url) {
    webhookUrl = data.discord_webhook_url;
  } else {
    webhookUrl = getWebhookForInstrument(app, instrumentType);
  }

  if (!webhookUrl) {
    console.log(
      `[Discord] No webhook configured for ${instrumentType} on app ${app.name}`,
    );
    return {
      sent: false,
      error: `No webhook configured for ${instrumentType} on app ${app.name}`,
    };
  }

  if (!data.discord_webhook_url) {
    const updatedData = { ...data, discord_webhook_url: webhookUrl };
    await storage
      .updateSignal(signal.id, { data: updatedData })
      .catch(() => {});
  }

  const expendName = app.name === "Discord Scalper" ? "Scalp Trade" : app.name;

  const embed = buildSignalAlertEmbed(data, ticker, expendName);
  const content = getContentForInstrument(app, instrumentType);
  let sent = false;
  let error: string | null = null;
  try {
    sent = await sendWebhook(webhookUrl, content, [embed]);
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
  };

  const content = getContentForInstrument(app, instrumentType);
  let sent = false;
  let error: string | null = null;
  try {
    sent = await sendWebhook(webhookUrl, content, [embed]);
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
