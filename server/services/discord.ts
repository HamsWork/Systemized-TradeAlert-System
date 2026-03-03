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

/** Known LETFs: ticker -> { underlying index, leverage multiplier } */
const LETF_LOOKUP: Record<string, { underlying: string; leverage: number }> = {
  TQQQ: { underlying: "QQQ", leverage: 3 },
  SQQQ: { underlying: "QQQ", leverage: -3 },
  UPRO: { underlying: "SPY", leverage: 3 },
  SPXU: { underlying: "SPY", leverage: -3 },
  SPXL: { underlying: "SPY", leverage: 3 },
  SPXS: { underlying: "SPY", leverage: -3 },
  UDOW: { underlying: "DIA", leverage: 3 },
  SDOW: { underlying: "DIA", leverage: -3 },
  TNA: { underlying: "IWM", leverage: 3 },
  TZA: { underlying: "IWM", leverage: -3 },
  LABU: { underlying: "XBI", leverage: 3 },
  LABD: { underlying: "XBI", leverage: -3 },
  HIBL: { underlying: "XHB", leverage: 3 },
  HIBS: { underlying: "XHB", leverage: -3 },
  SOXL: { underlying: "SOX", leverage: 3 },
  SOXS: { underlying: "SOX", leverage: -3 },
  TECL: { underlying: "XLK", leverage: 3 },
  TECS: { underlying: "XLK", leverage: -3 },
  FAS: { underlying: "XLF", leverage: 3 },
  FAZ: { underlying: "XLF", leverage: -3 },
  YINN: { underlying: "FXI", leverage: 3 },
  YANG: { underlying: "FXI", leverage: -3 },
  NUGT: { underlying: "GDX", leverage: 3 },
  DUST: { underlying: "GDX", leverage: -3 },
  JNUG: { underlying: "GDXJ", leverage: 3 },
  JDST: { underlying: "GDXJ", leverage: -3 },
};

function getLetfUnderlyingAndLeverage(letfTicker: string): { underlying: string; leverage: string } {
  const key = (letfTicker || "").toUpperCase().trim();
  const row = LETF_LOOKUP[key];
  if (row) {
    const lev = row.leverage < 0 ? `${row.leverage}` : `+${row.leverage}`;
    return { underlying: row.underlying, leverage: `${Math.abs(row.leverage)}` };
  }
  return { underlying: key || "?", leverage: "?" };
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
      value: optionPrice ? fmtPrice(optionPrice) : "—",
      inline: true,
    },
    { ...SPACER },
  ];

  const tradePlanParts: string[] = [];
  if (data.targets && typeof data.targets === "object") {
    const targetEntries = Object.entries(data.targets).filter(
      ([, val]) => (val as any)?.price,
    );
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
    const allTargets = Object.entries(data.targets || {}).filter(
      ([, val]) => (val as any)?.price,
    );
    allTargets.forEach(([, val]) => {
      if (!(val as any).raise_stop_loss?.price) return;
      const rsl = Number((val as any).raise_stop_loss?.price);
      const rslPct = optionPrice ? fmtPct(optionPrice, rsl) : null;
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
    entries.forEach(([, val], i) => {
      const t = val as any;
      const price = Number(t.price);
      const pct = optionPrice ? fmtPct(optionPrice, price) : null;
      const takeOff = t.take_off_percent ? `${t.take_off_percent}%` : "100%";
      const positionLabel = i === 0 ? "of position" : "of remaining position";
      let line = `Take Profit (${i + 1}): At ${pct || fmtPrice(price)} take off ${takeOff} ${positionLabel}`;
      if (t.raise_stop_loss?.price) {
        const rslPrice = Number(t.raise_stop_loss.price);
        const isBreakEven =
          optionPrice && Math.abs(rslPrice - optionPrice) < 0.01;
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

function buildLetfFields(
  data: Record<string, any>,
  ticker: string,
  direction: string,
  entryPrice: number | null,
  stockPrice: number | null,
): DiscordField[] {
  const { underlying, leverage } = getLetfUnderlyingAndLeverage(ticker);
  const dirText = data.direction ? (data.direction === "Short" ? "BEAR" : "BULL") : "?";
  // Underlying/stock price at entry (for "Stock Price" and for % vs targets/stop)
  const stockPriceAtEntry =
    data.entry_underlying_price != null
      ? Number(data.entry_underlying_price)
      : stockPrice ?? null;
  // LETF instrument entry price (for "Leveraged ETF Entry")
  const letfEntryPrice =
    data.entry_price != null ? Number(data.entry_price) : entryPrice ?? 0;
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
          raiseStop: t.raise_stop_loss?.price ? Number(t.raise_stop_loss.price) : null,
        };
      })
      .sort((a, b) => a.price - b.price);

    entries.forEach((t, i) => {
      const pct = entryForPct > 0 ? fmtPct(entryForPct, t.price) : "?";
      targetsStrParts.push(`${fmtPrice(t.price)} (${pct})`);
      const isBreakEven = t.raiseStop != null && entryForPct > 0 && Math.abs(t.raiseStop - entryForPct) < 0.02;
      const positionLabel = i === 0 ? "of position" : "of remaining position";
      const takeOffText = i === 0 ? `${t.takeOff}%` : `remaining ${t.takeOff}%`;
      const action = isBreakEven
        ? `take off ${takeOffText} ${positionLabel} and raise stop loss to break even.`
        : t.raiseStop != null
          ? `take off ${takeOffText} ${positionLabel} and raise stop loss to ${fmtPrice(t.raiseStop)}.`
          : `take off ${takeOffText} ${positionLabel}.`;
      const label = entries.length > 1 ? `Take Profit (${i + 1})` : "Take Profit";
      tpPlanLines.push(`${label}: At ${pct} ${action}`);
    });
  }

  const targetsStr = targetsStrParts.length > 0 ? targetsStrParts.join(", ") : "—";
  const tradePlanValue =
    targetsStr !== "—" && stopPrice != null
      ? `🎯 Targets: ${targetsStr}\n🛑 Stop Loss: ${fmtPrice(stopPrice)} (${stopPct}%)`
      : stopPrice != null
        ? `🛑 Stop Loss: ${fmtPrice(stopPrice)} (${stopPct}%)`
        : "—";
  const tpPlanText = tpPlanLines.length > 0 ? tpPlanLines.join("\n") : "—";

  const dir = data.direction || "Long";
  const fields: DiscordField[] = [
    { ... SPACER },
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
      value: stopPrice != null ? `${fmtPrice(stopPrice)} (${stopPct}%)` : "—",
      inline: true,
    },
    { ...SPACER },
    {
      name: "📝 Trade Plan",
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
    { ... SPACER },
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
      if (!(val as any).raise_stop_loss?.price) return '';
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
    entries.forEach(([, val], i) => {
      const t = val as any;
      const price = Number(t.price);
      const pct = entryPrice ? fmtPct(entryPrice, price) : null;
      const takeOff = t.take_off_percent ? `${t.take_off_percent}%` : "100%";
      const positionLabel = i === 0 ? "of position" : "of remaining position";
      let line = `Take Profit (${i + 1}): At ${pct || fmtPrice(price)} take off ${takeOff} ${positionLabel}`;
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
  if (instrumentType === "Options") {
    return buildOptionsFields(data, ticker, direction, entryPrice, stockPrice);
  }
  if (instrumentType === "LETF") {
    return buildLetfFields(data, ticker, direction, entryPrice, stockPrice);
  }
  return buildSharesFields(data, ticker, direction, entryPrice || stockPrice);
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
  signal: Signal,
  app: ConnectedApp | null,
  target: TargetHitInfo,
  currentPrice: number,
  ticker: string,
  data: Record<string, any>,
): Promise<void> {
  if (!app || !app.sendDiscordMessages) return;

  const instrumentType = data.instrument_type || "Shares";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);
  if (!webhookUrl) return;

  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const stockPrice = data.entry_underlying_price
    ? Number(data.entry_underlying_price)
    : null;
  const pctProfit =
    entryPrice && entryPrice > 0
      ? (((currentPrice - entryPrice) / entryPrice) * 100).toFixed(1)
      : null;
  const pnlText = pctProfit ? `+${pctProfit}%` : "\u2014";

  const isLETF = instrumentType === "LETF";
  const { underlying } = getLetfUnderlyingAndLeverage(ticker);
  const letfLabel = (data.letf_label as string) || `${ticker} (LETF)`;

  const fields: DiscordField[] = [];
  let description: string;
  const color = GREEN;

  pushInstrumentFields(fields, instrumentType, data);

  description =  isLETF 
    ? `**🎯 ${underlying} → ${ticker} Take Profit ${target.key.toUpperCase()} HIT**` 
    : `**🎯 ${ticker} Take Profit ${target.key.toUpperCase()} HIT**`;

  fields.push(
    { name: "\u2705 Entry", value: `${fmtPrice(entryPrice)}`, inline: true },
    { name: "\u{1F3AF} TP Hit", value: `${fmtPrice(target.price)}`, inline: true },
    { name: "\u{1F4B8} Profit", value: `${pctProfit ?? "\u2014"}`, inline: true },
    { ...SPACER },
    { name: `\u{1F6A8} Status: TP ${target.key.toUpperCase()} Reached \u{1F6A8}`, value: "\u200b", inline: false },
  );

  const targetsArr = data.targets as Array<{ key: string; price: number }> | undefined;
  fields.push({
    name: "\u{1F50D} Position Management",
    value: `\u2705 Reduce position by 50% (lock in profit)${targetsArr?.[1] ? `\n\u{1F3AF} Let remaining 50% ride to TP2 (${fmtPrice(targetsArr[1].price)})` : ""}`,
    inline: false,
  });

  fields.push({ ...SPACER });
  fields.push({
    name: "\u{1F6E1}\uFE0F Risk Management",
    value: `Raising stop loss to ${fmtPrice(entryPrice)} (break even) on remaining position to secure gains while allowing room to run.`,
    inline: false,
  });

  const embed: DiscordEmbed = {
    description,
    color,
    fields,
    footer: { text: DISCLAIMER },
  };

  const sent = await sendWebhook(webhookUrl, "", [embed]);

  await storage.createDiscordMessage({
    signalId: signal.id,
    webhookUrl,
    channelType: "signal",
    instrumentType,
    status: sent ? "sent" : "error",
    messageType: "target_hit",
    embedData: { ticker, targetKey: target.key, currentPrice },
    sourceAppId: app.id,
    sourceAppName: app.name,
  }).catch(() => {});
}

const ORANGE = 0xf59e0b;

function pushInstrumentFields(fields: DiscordField[], instrumentType: string, signal: Record<string, any>): void {
  const entryPriceVal = signal.entry_price ?? signal.entryPrice;
  if (instrumentType === "LETF") {
    const letfDisplayLabel = (signal.leverage && signal.letfDirection)
      ? `${signal.letfTicker} (${signal.leverage}x ${signal.letfDirection})`
      : signal.letfTicker ?? "";

    fields.push(
      {
        name: "\u{1F4B9} LETF",
        value: letfDisplayLabel,
        inline: true,
      },
      {
        name: "\u{1F4B5} LETF Entry",
        value: entryPriceVal != null ? `$ ${Number(entryPriceVal).toFixed(2)}` : "Pending",
        inline: true,
      },
      {
        name: "\u{1F4CA} Stock Price",
        value: `$ ${Number(signal.underlyingStockPrice ?? 0).toFixed(2)}`,
        inline: true,
      },
    );
  } else if (instrumentType === "Option") {
    fields.push(
      { name: "\u274C Expiration", value: `${signal.expiration ?? ""}`, inline: true },
      {
        name: "\u270D\uFE0F Strike",
        value: `${signal.strike ?? ""} ${signal.right ?? ""}`,
        inline: true,
      },
      {
        name: "\u{1F4B5} Option Price",
        value: `$ ${(signal.currentPrice ?? 0).toFixed(2)}`,
        inline: true,
      },
    );
  }
}

/**
 * Sends a Discord alert when stop loss is raised (e.g. after a target hit).
 */
export async function sendStopLossRaisedDiscord(
  signal: Signal,
  app: ConnectedApp | null,
  newStopLoss: number,
  targetKey: string,
  currentPrice: number,
  ticker: string,
  data: Record<string, any>,
): Promise<void> {
  if (!app || !app.sendDiscordMessages) return;

  const instrumentType = data.instrument_type || "Shares";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);
  if (!webhookUrl) return;

  const isLETF = instrumentType === "LETF";
  const { underlying } = getLetfUnderlyingAndLeverage(ticker);

  const description = isLETF
    ? `**🛡️ ${underlying} → ${ticker} Stop Loss Raised**`
    : `**🛡️ ${ticker} Stop Loss Raised**`;

  const fields: DiscordField[] = [];
  const entryPrice = data.entry_price != null ? Number(data.entry_price) : null;
  pushInstrumentFields(fields, instrumentType, data);

  fields.push(
    { name: "\u2705 Entry", value: `${fmtPrice(entryPrice)}`, inline: true },
    { name: "\u{1F6E1}\uFE0F New Stop", value: `${fmtPrice(newStopLoss)} (Break Even)`, inline: true },
    { name: "\u{1F4B8} Risk", value: `0% (Risk-Free)`, inline: true },
    { ...SPACER },
    { name: "\u{1F6A8} Status: Stop Loss Raised to Break Even \u{1F6A8}", value: "", inline: false },
  );

  const targetsArr = data.targets as Array<{ key: string; price: number }> | undefined;
  fields.push({
    name: "\u{1F6E1}\uFE0F Risk Management",
    value: `Stop loss raised to ${fmtPrice(newStopLoss)} (break even).\nTrade is now risk-free on remaining position.${targetsArr?.[1] ? `\n\u{1F3AF} Remaining target: TP2 at ${fmtPrice(targetsArr[1].price)}` : ""}`,
    inline: false,
  });

  const embed: DiscordEmbed = {
    description,
    color: ORANGE,
    fields,
    footer: { text: DISCLAIMER },
  };

  const sent = await sendWebhook(webhookUrl, "", [embed]);

  await storage.createDiscordMessage({
    signalId: signal.id,
    webhookUrl,
    channelType: "signal",
    instrumentType,
    status: sent ? "sent" : "error",
    messageType: "stop_loss_raised",
    embedData: { ticker, targetKey, newStopLoss, currentPrice },
    sourceAppId: app.id,
    sourceAppName: app.name,
  }).catch(() => {});
}

/**
 * Sends a Discord alert when stop loss is hit.
 */
export async function sendStopLossHitDiscord(
  signal: Signal,
  app: ConnectedApp | null,
  stopLoss: number,
  currentPrice: number,
  ticker: string,
  data: Record<string, any>,
): Promise<void> {
  if (!app || !app.sendDiscordMessages) return;

  const instrumentType = data.instrument_type || "Shares";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);
  if (!webhookUrl) return;

  const isLETF = instrumentType === "LETF";
  const { underlying } = getLetfUnderlyingAndLeverage(ticker);
  const description = isLETF
    ? `**🛑 ${underlying} → ${ticker} Stop Loss Hit**`
    : `**🛑 ${ticker} Stop Loss Hit**`;

  const entryPrice = data.entry_price != null ? Number(data.entry_price) : null;
  const stopLossHitPrice = data.stop_loss_hit_price != null ? Number(data.stop_loss_hit_price) : null;
  const stopLossHitPct = data.stop_loss_hit_pct != null ? String(data.stop_loss_hit_pct) : null;

  const fields: DiscordField[] = [];
  pushInstrumentFields(fields, instrumentType, data);

  fields.push(
    { name: "\u2705 Entry", value: `${fmtPrice(entryPrice)}`, inline: true },
    { name: "\u{1F6D1} Stop Hit", value: `${stopLossHitPrice != null ? fmtPrice(stopLossHitPrice) : "\u2014"}`, inline: true },
    { name: "\u{1F4B8} Result", value: `${stopLossHitPct ? `${stopLossHitPct}%` : "\u2014"}`, inline: true },
    { ...SPACER },
    { name: "\u{1F6A8} Status: Stop Loss Hit \u{1F6A8}", value: "\u200b", inline: false },
  );

  const embed: DiscordEmbed = {
    description,
    color: RED,
    fields,
    footer: { text: DISCLAIMER },
    timestamp: new Date().toISOString(),
  };

  const sent = await sendWebhook(webhookUrl, "@everyone", [embed]);

  await storage.createDiscordMessage({
    signalId: signal.id,
    webhookUrl,
    channelType: "signal",
    instrumentType,
    status: sent ? "sent" : "error",
    messageType: "stop_loss_hit",
    embedData: { embeds: [embed] },
  }).catch(() => {});
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
  if (!app || !app.sendDiscordMessages) return;

  const instrumentType = data.instrument_type || "Shares";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);
  if (!webhookUrl) return;

  const pnl = data.pnl != null ? Number(data.pnl) : null;
  const emoji = pnl != null && pnl > 0 ? "\u{1F4B0}" : "\u{1F4C9}";
  const isLETF = instrumentType === "LETF";
  const { underlying } = getLetfUnderlyingAndLeverage(ticker);

  const description = isLETF
    ? `**${emoji} ${underlying} → ${ticker} Closed Manually**`
    : `**${emoji} ${ticker} Closed Manually**`;

  const fields: DiscordField[] = [];
  const entryPrice = data.entry_price != null ? Number(data.entry_price) : null;
  const exitPrice = data.exit_price != null ? Number(data.exit_price) : null;
  const pnlPct = data.pnl_pct != null ? String(data.pnl_pct) : null;
  const rMultiple = data.r_multiple != null ? Number(data.r_multiple) : null;
  pushInstrumentFields(fields, instrumentType, data);

  fields.push(
    { name: "\u2705 Entry", value: `${fmtPrice(entryPrice)}`, inline: true },
    { name: "\u{1F3C1} Exit", value: `${fmtPrice(exitPrice)}`, inline: true },
    { name: "\u{1F4B8} Profit", value: `${pnlPct ?? "\u2014"}`, inline: true },
    { ...SPACER },
    { name: "\u{1F6A8} Status: Position Closed \u{1F6A8}", value: "\u200b", inline: false },
  );

  if (pnl != null) {
    fields.push({
      name: "Total P&L",
      value: `${fmtPnl(pnl)} | R-Multiple: ${rMultiple != null ? rMultiple.toFixed(2) : "\u2014"}`,
      inline: false,
    });
  }

  const embed: DiscordEmbed = {
    description,
    color: GRAY,
    fields,
    footer: { text: DISCLAIMER },
  };

  const sent = await sendWebhook(webhookUrl, "", [embed]);

  await storage.createDiscordMessage({
    signalId: signal.id,
    webhookUrl,
    channelType: "signal",
    instrumentType,
    status: sent ? "sent" : "error",
    messageType: "trade_closed_manually",
    embedData: { ticker },
    sourceAppId: app.id,
    sourceAppName: app.name,
  }).catch(() => {});
}

export async function sendSignalDiscordAlert(
  signal: Signal,
  app: ConnectedApp | null,
  overrideWebhookUrl?: string | null,
): Promise<DiscordSendResult> {
  if (!app) {
    return { sent: false, error: "No connected app provided" };
  }
  const useOverride = overrideWebhookUrl && overrideWebhookUrl.trim().length > 0;
  if (!useOverride && !app.sendDiscordMessages) {
    return { sent: false, error: `Discord messages disabled for ${app.name}` };
  }

  const data = signal.data as Record<string, any>;
  const ticker = data.ticker || "UNKNOWN";
  const instrumentType = data.instrument_type || "Options";
  const webhookUrl = useOverride
    ? overrideWebhookUrl!.trim()
    : getWebhookForInstrument(app, instrumentType);

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
  const stockPrice = data.entry_underlying_price
    ? Number(data.entry_underlying_price)
    : null;
  const isBullish = direction === "Call" || direction === "Long";
  const color = isBullish ? GREEN : RED;

  const { underlying: letfUnderlying } =
    instrumentType === "LETF" ? getLetfUnderlyingAndLeverage(ticker) : { underlying: ticker };
  const heading =
    instrumentType === "LETF"
      ? `**🚨 ${letfUnderlying} → ${ticker} Swing Alert**`
      : `**🚨 ${ticker} Trade Alert**`;

  const fields: DiscordField[] = buildEmbedFields(
    instrumentType,
    data,
    ticker,
    direction,
    entryPrice,
    stockPrice,
  );

  const embed: DiscordEmbed = {
    description: heading,
    color,
    fields,
    footer: { text: DISCLAIMER },
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
