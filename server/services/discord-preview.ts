import type { Signal } from "@shared/schema";
import {
  buildSignalAlertEmbed,
  buildTargetHitEmbed,
  buildStopLossRaisedEmbed,
  buildStopLossHitEmbed,
  type DiscordEmbed,
} from "./discord";

export interface DiscordPreviewMessage {
  type: string;
  label: string;
  content: string;
  embed: DiscordEmbed;
}

const GREEN = 0x22c55e;
const RED = 0xef4444;
const BLUE = 0x3b82f6;
const ORANGE = 0xf59e0b;
const GRAY = 0x6b7280;
const SPACER: DiscordField = { name: "\u200b", value: "", inline: false };
const DISCLAIMER = "Disclaimer: Not financial advice. Trade at your own risk.";

function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "\u2014";
  return `$${Number(p).toFixed(2)}`;
}

function fmtPct(base: number | null, target: number): string {
  if (!base || base === 0) return "?";
  return `${(((target - base) / base) * 100).toFixed(1)}%`;
}

function getUnderlying(data: Record<string, any>, ticker: string): string {
  return data.underlying_symbol || ticker;
}

function buildEntryEmbed(
  data: Record<string, any>,
  ticker: string,
): DiscordPreviewMessage {
  const instrumentType = data.instrument_type || "Shares";
  const direction = data.direction || "Long";
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const stockPrice = data.entry_underlying_price
    ? Number(data.entry_underlying_price)
    : null;
  const isBullish = direction === "Call" || direction === "Long";

  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const isCrypto = instrumentType === "Crypto";
  const underlying = getUnderlying(data, ticker);

  const heading = instrumentType === "LETF"
    ? `**\ud83d\udea8 ${underlying} \u2192 ${ticker} Swing Alert**`
    : instrumentType === "LETF Option"
      ? `**\ud83d\udea8 ${underlying} \u2192 ${ticker} Option Alert**`
      : isCrypto
        ? `**\ud83d\udea8 ${ticker} Crypto Alert**`
        : `**\ud83d\udea8 ${ticker} Trade Alert**`;

  const fields: DiscordField[] = [];

  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    const right = direction === "Put" ? "PUT" : "CALL";
    const isStockBased = data.trade_plan_type === "stock_price_based";
    const displayOptionPrice = data.entry_option_price != null ? Number(data.entry_option_price) : entryPrice;
    const refPrice = isStockBased ? (stockPrice || entryPrice) : (entryPrice || stockPrice);
    fields.push(
      { name: "\ud83d\udfe2 Ticker", value: ticker, inline: true },
      {
        name: "\ud83d\udcca Stock Price",
        value: stockPrice ? fmtPrice(stockPrice) : "\u2014",
        inline: true,
      },
      { ...SPACER },
      {
        name: "\u274c Expiration",
        value: data.expiration || "\u2014",
        inline: true,
      },
      {
        name: "\u270d\ufe0f Strike",
        value: `${data.strike || "\u2014"} ${right}`,
        inline: true,
      },
      {
        name: "\ud83d\udcb5 Option Price",
        value: displayOptionPrice ? fmtPrice(displayOptionPrice) : "\u2014",
        inline: true,
      },
      { ...SPACER },
    );
    addTradePlan(fields, data, refPrice);
    addTakeProfitPlan(fields, data, refPrice);
  } else if (instrumentType === "LETF") {
    const entryForPct = stockPrice ?? entryPrice ?? 0;
    const dir = direction === "Short" ? "BEAR" : "BULL";
    fields.push(
      {
        name: "\ud83d\udfe2 Ticker",
        value: underlying,
        inline: true,
      },
      {
        name: "\ud83d\udcca Stock Price",
        value: stockPrice ? fmtPrice(stockPrice) : "\u2014",
        inline: true,
      },
      { name: "\ud83d\udcc8 Direction", value: direction, inline: true },
      { ...SPACER },
      {
        name: "\ud83d\udcf9 LETF",
        value: `${ticker} (${dir})`,
        inline: true,
      },
      {
        name: "\ud83d\udcb0 LETF Entry",
        value: entryPrice ? fmtPrice(entryPrice) : "Pending",
        inline: true,
      },
      {
        name: "\ud83d\uded1 Stop",
        value:
          data.stop_loss != null
            ? `${fmtPrice(Number(data.stop_loss))} (${fmtPct(entryForPct, Number(data.stop_loss))})`
            : "\u2014",
        inline: true,
      },
      { ...SPACER },
    );
    addTradePlan(fields, data, entryForPct);
    addTakeProfitPlan(fields, data, entryForPct);
  } else {
    fields.push(
      { name: "\ud83d\udfe2 Ticker", value: ticker, inline: true },
      {
        name: "\ud83d\udcca Stock Price",
        value: entryPrice ? fmtPrice(entryPrice) : "\u2014",
        inline: true,
      },
      { name: "\ud83d\udcc8 Direction", value: direction, inline: true },
      { ...SPACER },
    );
    addTradePlan(fields, data, entryPrice);
    addTakeProfitPlan(fields, data, entryPrice);
  }

  return {
    type: "signal_alert",
    label: "Entry Signal",
    content: "@everyone",
    embed: {
      description: heading,
      color: isBullish ? GREEN : RED,
      fields,
      footer: { text: DISCLAIMER },
    },
  };
}

function addTradePlan(
  fields: DiscordField[],
  data: Record<string, any>,
  refPrice: number | null,
): void {
  const parts: string[] = [];
  if (data.targets && typeof data.targets === "object") {
    const prices = Object.entries(data.targets)
      .filter(([, val]) => (val as any)?.price)
      .map(([, val]) => {
        const price = Number((val as any).price);
        const pct = refPrice ? fmtPct(refPrice, price) : null;
        return pct ? `${fmtPrice(price)} (${pct})` : fmtPrice(price);
      });
    if (prices.length > 0)
      parts.push(`\ud83c\udfaf Targets: ${prices.join(", ")}`);
  }
  if (data.stop_loss != null) {
    const sl = Number(data.stop_loss);
    const slPct = refPrice ? fmtPct(refPrice, sl) : null;
    let slText = `\ud83d\uded1 Stop Loss: ${fmtPrice(sl)}(${slPct || "?"})`;
    const allTargets = Object.entries(data.targets || {}).filter(
      ([, val]) => (val as any)?.price,
    );
    allTargets.forEach(([, val]) => {
      if (!(val as any).raise_stop_loss?.price) return;
      const rsl = Number((val as any).raise_stop_loss.price);
      const rslPct = refPrice ? fmtPct(refPrice, rsl) : null;
      slText += `, ${fmtPrice(rsl)}(${rslPct || "?"})`;
    });
    parts.push(slText);
  }
  if (data.time_stop) parts.push(`\ud83c\udf10 Time Stop: ${data.time_stop}`);
  if (parts.length > 0) {
    fields.push({
      name: "\ud83d\udcdd Trade Plan",
      value: parts.join("\n"),
      inline: false,
    });
  }
}

function addTakeProfitPlan(
  fields: DiscordField[],
  data: Record<string, any>,
  refPrice: number | null,
): void {
  if (!data.targets || typeof data.targets !== "object") return;
  const entries = Object.entries(data.targets).filter(
    ([, val]) => (val as any)?.price,
  );
  if (entries.length === 0) return;
  const tpLines: string[] = [];
  entries.forEach(([, val], i) => {
    const t = val as any;
    const price = Number(t.price);
    const pct = refPrice ? fmtPct(refPrice, price) : null;
    const takeOff = t.take_off_percent ? `${t.take_off_percent}%` : "100%";
    const posLabel = i === 0 ? "of position" : "of remaining position";
    let line = `Take Profit (${i + 1}): At ${pct || fmtPrice(price)} take off ${takeOff} ${posLabel}`;
    if (t.raise_stop_loss?.price) {
      const rslPrice = Number(t.raise_stop_loss.price);
      const isBreakEven = refPrice && Math.abs(rslPrice - refPrice) < 0.01;
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
      name: "\ud83d\udcb0 Take Profit Plan",
      value: tpLines.join("\n"),
      inline: false,
    });
  }
}

function buildStopLossRaisedEmbeds(
  data: Record<string, any>,
  ticker: string,
): DiscordPreviewMessage[] {
  const targets = data.targets;
  if (!targets || typeof targets !== "object") return [];

  const instrumentType = data.instrument_type || "Shares";
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const isCrypto = instrumentType === "Crypto";
  const isOption = instrumentType === "Options" || instrumentType === "LETF Option";
  const isStockBased = data.trade_plan_type === "stock_price_based";
  const underlying = getUnderlying(data, ticker);
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const stockPrice = data.entry_underlying_price ? Number(data.entry_underlying_price) : null;
  const refPrice = (isOption && isStockBased) ? (stockPrice || entryPrice) : entryPrice;

  const entries = Object.entries(targets)
    .filter(([, val]) => (val as any)?.raise_stop_loss?.price)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  if (entries.length === 0) return [];

  return entries.map(([key, val]) => {
    const t = val as any;
    const newStopLoss = Number(t.raise_stop_loss.price);
    const isBreakEven = refPrice && Math.abs(newStopLoss - refPrice) < 0.01;

    const heading = isLETF
      ? `**\ud83d\udee1\ufe0f ${underlying} \u2192 ${ticker}${instrumentType === "LETF Option" ? " Option" : ""} Stop Loss Raised**`
      : isCrypto
        ? `**\ud83d\udee1\ufe0f ${ticker} Crypto Stop Loss Raised**`
        : `**\ud83d\udee1\ufe0f ${ticker} Stop Loss Raised**`;

    const allTargets = Object.entries(targets)
      .filter(([, v]) => (v as any)?.price)
      .sort(
        ([, a], [, b]) => Number((a as any).price) - Number((b as any).price),
      );
    const currentIdx = allTargets.findIndex(([k]) => k === key);
    const nextTarget =
      currentIdx >= 0 && currentIdx < allTargets.length - 1
        ? allTargets[currentIdx + 1]
        : null;

    const entryLabel = (isOption && isStockBased) ? "Entry (Stock)" : "Entry";
    const fields: DiscordField[] = [
      { name: `\u2705 ${entryLabel}`, value: fmtPrice(refPrice), inline: true },
      {
        name: "\ud83d\udee1\ufe0f New Stop",
        value: `${fmtPrice(newStopLoss)}${isBreakEven ? " (Break Even)" : ""}`,
        inline: true,
      },
      {
        name: "\ud83d\udcb8 Risk",
        value: isBreakEven
          ? "0% (Risk-Free)"
          : refPrice
            ? fmtPct(refPrice, newStopLoss)
            : "\u2014",
        inline: true,
      },
      { ...SPACER },
      {
        name: isBreakEven
          ? "\ud83d\udea8 Status: Stop Loss Raised to Break Even \ud83d\udea8"
          : "\ud83d\udea8 Status: Stop Loss Raised \ud83d\udea8",
        value: "\u200b",
        inline: false,
      },
    ];

    let mgmtText = `Stop loss raised to ${fmtPrice(newStopLoss)}${isBreakEven ? " (break even)" : ""}.`;
    if (isBreakEven)
      mgmtText += "\nTrade is now risk-free on remaining position.";
    if (nextTarget)
      mgmtText += `\n\ud83c\udfaf Remaining target: ${(nextTarget[0] as string).toUpperCase()} at ${fmtPrice(Number((nextTarget[1] as any).price))}`;

    fields.push({
      name: "\ud83d\udee1\ufe0f Risk Management",
      value: mgmtText,
      inline: false,
    });

    return {
      type: "stop_loss_raised",
      label: `SL Raised (${key.toUpperCase()})`,
      content: "",
      embed: {
        description: heading,
        color: ORANGE,
        fields,
        footer: { text: DISCLAIMER },
      },
    };
  });
}

function buildTargetHitEmbeds(
  data: Record<string, any>,
  ticker: string,
): DiscordPreviewMessage[] {
  const targets = data.targets;
  if (!targets || typeof targets !== "object") return [];

  const instrumentType = data.instrument_type || "Shares";
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const isCrypto = instrumentType === "Crypto";
  const isOption = instrumentType === "Options" || instrumentType === "LETF Option";
  const isStockBased = data.trade_plan_type === "stock_price_based";
  const underlying = getUnderlying(data, ticker);
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const stockPrice = data.entry_underlying_price ? Number(data.entry_underlying_price) : null;
  const refPrice = (isOption && isStockBased) ? (stockPrice || entryPrice) : entryPrice;

  const entries = Object.entries(targets)
    .filter(([, val]) => (val as any)?.price)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  return entries.map(([key, val], idx) => {
    const t = val as any;
    const targetPrice = Number(t.price);
    const pctProfit =
      refPrice && refPrice > 0
        ? (((targetPrice - refPrice) / refPrice) * 100).toFixed(1)
        : null;

    const heading = isLETF
      ? `**\ud83c\udfaf ${underlying} \u2192 ${ticker}${instrumentType === "LETF Option" ? " Option" : ""} Take Profit ${key.toUpperCase()} HIT**`
      : isCrypto
        ? `**\ud83c\udfaf ${ticker} Crypto Take Profit ${key.toUpperCase()} HIT**`
        : `**\ud83c\udfaf ${ticker} Take Profit ${key.toUpperCase()} HIT**`;

    const entryLabel = (isOption && isStockBased) ? "Entry (Stock)" : "Entry";
    const fields: DiscordField[] = [
      { name: `\u2705 ${entryLabel}`, value: fmtPrice(refPrice), inline: true },
      {
        name: "\ud83c\udfaf TP Hit",
        value: fmtPrice(targetPrice),
        inline: true,
      },
      {
        name: "\ud83d\udcb8 Profit",
        value: pctProfit ? `${pctProfit}%` : "\u2014",
        inline: true,
      },
      { ...SPACER },
      {
        name: `\ud83d\udea8 Status: TP ${key.toUpperCase()} Reached \ud83d\udea8`,
        value: "\u200b",
        inline: false,
      },
    ];

    const nextTarget = idx < entries.length - 1 ? entries[idx + 1] : null;
    fields.push({
      name: "\ud83d\udd0d Position Management",
      value: `\u2705 Reduce position by ${t.take_off_percent || 50}% (lock in profit)${nextTarget ? `\n\ud83c\udfaf Let remaining ride to ${(nextTarget[0] as string).toUpperCase()} (${fmtPrice(Number((nextTarget[1] as any).price))})` : ""}`,
      inline: false,
    });

    if (t.raise_stop_loss?.price) {
      const rsl = Number(t.raise_stop_loss.price);
      const isBreakEven = refPrice && Math.abs(rsl - refPrice) < 0.01;
      fields.push({ ...SPACER });
      fields.push({
        name: "\ud83d\udee1\ufe0f Risk Management",
        value: isBreakEven
          ? `Raising stop loss to ${fmtPrice(refPrice)} (break even) on remaining position to secure gains while allowing room to run.`
          : `Raising stop loss to ${fmtPrice(rsl)} on remaining position.`,
        inline: false,
      });
    }

    return {
      type: "target_hit",
      label: `Target ${key.toUpperCase()} Hit`,
      content: "",
      embed: {
        description: heading,
        color: GREEN,
        fields,
        footer: { text: DISCLAIMER },
      },
    };
  });
}

function buildStopLossHitTemplate(
  data: Record<string, any>,
  ticker: string,
): DiscordPreviewMessage | null {
  if (data.stop_loss == null) return null;

  const instrumentType = data.instrument_type || "Shares";
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const isCrypto = instrumentType === "Crypto";
  const isOption = instrumentType === "Options" || instrumentType === "LETF Option";
  const isStockBased = data.trade_plan_type === "stock_price_based";
  const underlying = getUnderlying(data, ticker);
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const stockPrice = data.entry_underlying_price ? Number(data.entry_underlying_price) : null;
  const refPrice = (isOption && isStockBased) ? (stockPrice || entryPrice) : entryPrice;
  const stopLoss = Number(data.stop_loss);
  const pctLoss =
    refPrice && refPrice > 0
      ? (((stopLoss - refPrice) / refPrice) * 100).toFixed(1)
      : null;

  const heading = isLETF
    ? `**\ud83d\uded1 ${underlying} \u2192 ${ticker}${instrumentType === "LETF Option" ? " Option" : ""} Stop Loss Hit**`
    : isCrypto
      ? `**\ud83d\uded1 ${ticker} Crypto Stop Loss Hit**`
      : `**\ud83d\uded1 ${ticker} Stop Loss Hit**`;

  const entryLabel = (isOption && isStockBased) ? "Entry (Stock)" : "Entry";
  const fields: DiscordField[] = [
    { name: `\u2705 ${entryLabel}`, value: fmtPrice(refPrice), inline: true },
    { name: "\ud83d\uded1 Stop Hit", value: fmtPrice(stopLoss), inline: true },
    {
      name: "\ud83d\udcb8 Result",
      value: pctLoss ? `${pctLoss}%` : "\u2014",
      inline: true,
    },
    { ...SPACER },
    {
      name: "\ud83d\udea8 Status: Stop Loss Hit \ud83d\udea8",
      value: "\u200b",
      inline: false,
    },
  ];

  return {
    type: "stop_loss_hit",
    label: "Stop Loss Hit",
    content: "@everyone",
    embed: {
      description: heading,
      color: RED,
      fields,
      footer: { text: DISCLAIMER },
      timestamp: new Date().toISOString(),
    },
  };
}

function buildTradeClosedTemplate(
  data: Record<string, any>,
  ticker: string,
): DiscordPreviewMessage {
  const instrumentType = data.instrument_type || "Shares";
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const isCrypto = instrumentType === "Crypto";
  const isOption = instrumentType === "Options" || instrumentType === "LETF Option";
  const isStockBased = data.trade_plan_type === "stock_price_based";
  const underlying = getUnderlying(data, ticker);
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const stockPrice = data.entry_underlying_price ? Number(data.entry_underlying_price) : null;
  const refPrice = (isOption && isStockBased) ? (stockPrice || entryPrice) : entryPrice;

  const heading = isLETF
    ? `**\ud83d\udcb0 ${underlying} \u2192 ${ticker}${instrumentType === "LETF Option" ? " Option" : ""} Closed Manually**`
    : isCrypto
      ? `**\ud83d\udcb0 ${ticker} Crypto Closed Manually**`
      : `**\ud83d\udcb0 ${ticker} Closed Manually**`;

  const entryLabel = (isOption && isStockBased) ? "Entry (Stock)" : "Entry";
  const fields: DiscordField[] = [
    { name: `\u2705 ${entryLabel}`, value: fmtPrice(refPrice), inline: true },
    { name: "\ud83c\udfc1 Exit", value: "\u2014", inline: true },
    { name: "\ud83d\udcb8 Profit", value: "\u2014", inline: true },
    { ...SPACER },
    {
      name: "\ud83d\udea8 Status: Position Closed \ud83d\udea8",
      value: "\u200b",
      inline: false,
    },
  ];

  return {
    type: "trade_closed_manually",
    label: "Trade Closed",
    content: "",
    embed: {
      description: heading,
      color: GRAY,
      fields,
      footer: { text: DISCLAIMER },
    },
  };
}

const SAMPLE_OPTIONS_DATA: Record<string, any> = {
  ticker: "AAPL",
  instrument_type: "Options",
  direction: "Call",
  entry_price: 5.2,
  entry_option_price: 5.2,
  entry_underlying_price: 195.5,
  expiration: "2026-04-18",
  strike: 200,
  stop_loss: 3.5,
  time_stop: "2 days",
  targets: {
    tp1: { price: 7.8, take_off_percent: 50, raise_stop_loss: { price: 5.2 } },
    tp2: { price: 10.4, take_off_percent: 100 },
  },
};

const SAMPLE_SHARES_DATA: Record<string, any> = {
  ticker: "MSFT",
  instrument_type: "Shares",
  direction: "Long",
  entry_price: 420.0,
  stop_loss: 410.0,
  time_stop: "5 days",
  targets: {
    tp1: {
      price: 435.0,
      take_off_percent: 50,
      raise_stop_loss: { price: 420.0 },
    },
    tp2: { price: 450.0, take_off_percent: 100 },
  },
};

const SAMPLE_LETF_DATA: Record<string, any> = {
  ticker: "TQQQ",
  instrument_type: "LETF",
  direction: "Long",
  entry_price: 72.5,
  entry_underlying_price: 490.0,
  underlying_symbol: "QQQ",
  stop_loss: 68.0,
  targets: {
    tp1: {
      price: 78.0,
      take_off_percent: 50,
      raise_stop_loss: { price: 72.5 },
    },
    tp2: { price: 84.0, take_off_percent: 100 },
  },
};

const SAMPLE_LETF_OPTION_DATA: Record<string, any> = {
  ticker: "TQQQ",
  instrument_type: "LETF Option",
  direction: "Call",
  entry_price: 6.50,
  entry_option_price: 6.50,
  entry_underlying_price: 72.50,
  underlying_symbol: "QQQ",
  expiration: "2026-04-18",
  strike: 80,
  stop_loss: 4.00,
  time_stop: "3 days",
  targets: {
    tp1: { price: 9.75, take_off_percent: 50, raise_stop_loss: { price: 6.50 } },
    tp2: { price: 13.00, take_off_percent: 100 },
  },
};

const SAMPLE_CRYPTO_DATA: Record<string, any> = {
  ticker: "BTC",
  instrument_type: "Crypto",
  direction: "Long",
  entry_price: 95000,
  stop_loss: 92000,
  targets: {
    tp1: { price: 100000, take_off_percent: 50, raise_stop_loss: { price: 95000 } },
    tp2: { price: 105000, take_off_percent: 100 },
  },
};

interface TemplateGroup {
  instrumentType: string;
  ticker: string;
  templates: DiscordPreviewMessage[];
}

export function generateAllTemplates(): TemplateGroup[] {
  const groups: TemplateGroup[] = [];

  for (const [label, sampleData] of [
    ["Options", SAMPLE_OPTIONS_DATA],
    ["Shares", SAMPLE_SHARES_DATA],
    ["LETF", SAMPLE_LETF_DATA],
    ["LETF Option", SAMPLE_LETF_OPTION_DATA],
    ["Crypto", SAMPLE_CRYPTO_DATA],
  ] as [string, Record<string, any>][]) {
    const ticker = sampleData.ticker;
    const templates: DiscordPreviewMessage[] = [];

    templates.push(buildEntryEmbed(sampleData, ticker));
    templates.push(...buildTargetHitEmbeds(sampleData, ticker));
    templates.push(...buildStopLossRaisedEmbeds(sampleData, ticker));

    const slHit = buildStopLossHitTemplate(sampleData, ticker);
    if (slHit) templates.push(slHit);

    templates.push(buildTradeClosedTemplate(sampleData, ticker));

    groups.push({ instrumentType: label, ticker, templates });
  }

  return groups;
}

export function generateDiscordPreviews(
  signal: Signal,
): DiscordPreviewMessage[] {
  const data = (signal.data || {}) as Record<string, any>;
  const ticker = data.ticker || data.symbol || "UNKNOWN";
  const appName = signal.sourceAppName || undefined;
  const previews: DiscordPreviewMessage[] = [];

  previews.push({
    type: "signal_alert",
    label: "Entry Signal",
    content: "@everyone",
    embed: buildSignalAlertEmbed(data, ticker, appName),
  });

  const targets =
    data.targets && typeof data.targets === "object"
      ? (data.targets as Record<
          string,
          { price?: number; raise_stop_loss?: { price?: number } }
        >)
      : {};
  const targetEntries = Object.entries(targets)
    .filter(([, val]) => val?.price != null)
    .sort(([, a], [, b]) => Number(a.price) - Number(b.price));

  for (const [key, val] of targetEntries) {
    const price = Number(val.price);
    previews.push({
      type: "target_hit",
      label: `Target ${key.toUpperCase()} Hit`,
      content: "",
      embed: buildTargetHitEmbed(data, ticker, { key, price }, appName),
    });
  }

  for (const [key, val] of targetEntries) {
    const newStop =
      val.raise_stop_loss?.price != null
        ? Number(val.raise_stop_loss.price)
        : null;
    if (newStop == null) continue;
    previews.push({
      type: "stop_loss_raised",
      label: `SL Raised (${key.toUpperCase()})`,
      content: "",
      embed: buildStopLossRaisedEmbed(data, ticker, key, newStop, appName),
    });
  }

  const stopLoss = data.stop_loss != null ? Number(data.stop_loss) : null;
  if (stopLoss != null) {
    previews.push({
      type: "stop_loss_hit",
      label: "Stop Loss Hit",
      content: "@everyone",
      embed: buildStopLossHitEmbed(data, ticker, stopLoss, appName),
    });
  }

  return previews;
}
