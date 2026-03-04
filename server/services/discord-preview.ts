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
  SOXL: { underlying: "SOX", leverage: 3 },
  SOXS: { underlying: "SOX", leverage: -3 },
  TECL: { underlying: "XLK", leverage: 3 },
  TECS: { underlying: "XLK", leverage: -3 },
  FAS: { underlying: "XLF", leverage: 3 },
  FAZ: { underlying: "XLF", leverage: -3 },
};

function getLetfInfo(
  ticker: string,
): { underlying: string; leverage: number } | null {
  return LETF_LOOKUP[(ticker || "").toUpperCase().trim()] || null;
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

  const isLETF = instrumentType === "LETF";
  const letfInfo = isLETF ? getLetfInfo(ticker) : null;
  const displayTicker =
    isLETF && letfInfo ? `${letfInfo.underlying} \u2192 ${ticker}` : ticker;

  const heading = isLETF
    ? `**\ud83d\udea8 ${letfInfo?.underlying || ticker} \u2192 ${ticker} Swing Alert**`
    : `**\ud83d\udea8 ${ticker} Trade Alert**`;

  const fields: DiscordField[] = [];

  if (instrumentType === "Options") {
    const right = direction === "Put" ? "PUT" : "CALL";
    const optionPrice = entryPrice;
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
        value: optionPrice ? fmtPrice(optionPrice) : "\u2014",
        inline: true,
      },
      { ...SPACER },
    );
    addTradePlan(fields, data, optionPrice);
    addTakeProfitPlan(fields, data, optionPrice);
  } else if (isLETF) {
    const entryForPct = stockPrice ?? entryPrice ?? 0;
    const dir = direction === "Short" ? "BEAR" : "BULL";
    fields.push(
      {
        name: "\ud83d\udfe2 Ticker",
        value: letfInfo?.underlying || ticker,
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
        value: `${ticker} (${letfInfo?.leverage || "?"}x ${dir})`,
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
  const isLETF = instrumentType === "LETF";
  const letfInfo = isLETF ? getLetfInfo(ticker) : null;
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;

  const entries = Object.entries(targets)
    .filter(([, val]) => (val as any)?.raise_stop_loss?.price)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  if (entries.length === 0) return [];

  return entries.map(([key, val]) => {
    const t = val as any;
    const newStopLoss = Number(t.raise_stop_loss.price);
    const isBreakEven = entryPrice && Math.abs(newStopLoss - entryPrice) < 0.01;

    const heading = isLETF
      ? `**\ud83d\udee1\ufe0f ${letfInfo?.underlying || ticker} \u2192 ${ticker} Stop Loss Raised**`
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

    const fields: DiscordField[] = [
      { name: "\u2705 Entry", value: fmtPrice(entryPrice), inline: true },
      {
        name: "\ud83d\udee1\ufe0f New Stop",
        value: `${fmtPrice(newStopLoss)}${isBreakEven ? " (Break Even)" : ""}`,
        inline: true,
      },
      {
        name: "\ud83d\udcb8 Risk",
        value: isBreakEven
          ? "0% (Risk-Free)"
          : entryPrice
            ? fmtPct(entryPrice, newStopLoss)
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
  const isLETF = instrumentType === "LETF";
  const letfInfo = isLETF ? getLetfInfo(ticker) : null;
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;

  const entries = Object.entries(targets)
    .filter(([, val]) => (val as any)?.price)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  return entries.map(([key, val], idx) => {
    const t = val as any;
    const targetPrice = Number(t.price);
    const pctProfit =
      entryPrice && entryPrice > 0
        ? (((targetPrice - entryPrice) / entryPrice) * 100).toFixed(1)
        : null;

    const heading = isLETF
      ? `**\ud83c\udfaf ${letfInfo?.underlying || ticker} \u2192 ${ticker} Take Profit ${key.toUpperCase()} HIT**`
      : `**\ud83c\udfaf ${ticker} Take Profit ${key.toUpperCase()} HIT**`;

    const fields: DiscordField[] = [
      { name: "\u2705 Entry", value: fmtPrice(entryPrice), inline: true },
      {
        name: "\ud83c\udfaf TP Hit",
        value: fmtPrice(targetPrice),
        inline: true,
      },
      {
        name: "\ud83d\udcb8 Profit",
        value: pctProfit ? `+${pctProfit}%` : "\u2014",
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
      const isBreakEven = entryPrice && Math.abs(rsl - entryPrice) < 0.01;
      fields.push({ ...SPACER });
      fields.push({
        name: "\ud83d\udee1\ufe0f Risk Management",
        value: isBreakEven
          ? `Raising stop loss to ${fmtPrice(entryPrice)} (break even) on remaining position to secure gains while allowing room to run.`
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

function buildStopLossHitEmbed(
  data: Record<string, any>,
  ticker: string,
): DiscordPreviewMessage | null {
  if (data.stop_loss == null) return null;

  const instrumentType = data.instrument_type || "Shares";
  const isLETF = instrumentType === "LETF";
  const letfInfo = isLETF ? getLetfInfo(ticker) : null;
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const stopLoss = Number(data.stop_loss);
  const pctLoss =
    entryPrice && entryPrice > 0
      ? (((stopLoss - entryPrice) / entryPrice) * 100).toFixed(1)
      : null;

  const heading = isLETF
    ? `**\ud83d\uded1 ${letfInfo?.underlying || ticker} \u2192 ${ticker} Stop Loss Hit**`
    : `**\ud83d\uded1 ${ticker} Stop Loss Hit**`;

  const fields: DiscordField[] = [
    { name: "\u2705 Entry", value: fmtPrice(entryPrice), inline: true },
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

function buildTradeClosedEmbed(
  data: Record<string, any>,
  ticker: string,
): DiscordPreviewMessage {
  const instrumentType = data.instrument_type || "Shares";
  const isLETF = instrumentType === "LETF";
  const letfInfo = isLETF ? getLetfInfo(ticker) : null;
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;

  const heading = isLETF
    ? `**\ud83d\udcb0 ${letfInfo?.underlying || ticker} \u2192 ${ticker} Closed Manually**`
    : `**\ud83d\udcb0 ${ticker} Closed Manually**`;

  const fields: DiscordField[] = [
    { name: "\u2705 Entry", value: fmtPrice(entryPrice), inline: true },
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
  ] as const) {
    const ticker = sampleData.ticker;
    const templates: DiscordPreviewMessage[] = [];

    templates.push(buildEntryEmbed(sampleData, ticker));
    templates.push(...buildTargetHitEmbeds(sampleData, ticker));
    templates.push(...buildStopLossRaisedEmbeds(sampleData, ticker));

    const slHit = buildStopLossHitEmbed(sampleData, ticker);
    if (slHit) templates.push(slHit);

    templates.push(buildTradeClosedEmbed(sampleData, ticker));

    groups.push({ instrumentType: label, ticker, templates });
  }

  return groups;
}

export function generateDiscordPreviews(
  signal: Signal,
): DiscordPreviewMessage[] {
  const data = (signal.data || {}) as Record<string, any>;
  const ticker = data.ticker || data.symbol || "UNKNOWN";
  const previews: DiscordPreviewMessage[] = [];

  previews.push({
    type: "signal_alert",
    label: "Entry Signal",
    content: "@everyone",
    embed: buildSignalAlertEmbed(data, ticker),
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
      embed: buildTargetHitEmbed(data, ticker, { key, price }),
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
      embed: buildStopLossRaisedEmbed(data, ticker, key, newStop),
    });
  }

  const stopLoss = data.stop_loss != null ? Number(data.stop_loss) : null;
  if (stopLoss != null) {
    previews.push({
      type: "stop_loss_hit",
      label: "Stop Loss Hit",
      content: "@everyone",
      embed: buildStopLossHitEmbed(data, ticker, stopLoss),
    });
  }

  return previews;
}
