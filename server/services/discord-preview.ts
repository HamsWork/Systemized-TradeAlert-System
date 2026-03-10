import type { Signal } from "@shared/schema";
import {
  buildEntryAlertEmbed,
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

const SAMPLE_OPTIONS_DATA: Record<string, any> = {
  ticker: "AAPL",
  instrument_type: "Options",
  direction: "Call",
  entry_price: 5.2,
  entry_option_price: 5.2,
  entry_instrument_price: 5.2,
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
  entry_instrument_price: 420.0,
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
  entry_instrument_price: 72.5,
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
  entry_price: 6.5,
  entry_option_price: 6.5,
  entry_instrument_price: 6.5,
  entry_underlying_price: 72.5,
  underlying_symbol: "QQQ",
  expiration: "2026-04-18",
  strike: 80,
  stop_loss: 4.0,
  time_stop: "3 days",
  targets: {
    tp1: { price: 9.75, take_off_percent: 50, raise_stop_loss: { price: 6.5 } },
    tp2: { price: 13.0, take_off_percent: 100 },
  },
};

const SAMPLE_CRYPTO_DATA: Record<string, any> = {
  ticker: "BTC",
  instrument_type: "Crypto",
  direction: "Long",
  entry_price: 95000,
  entry_instrument_price: 95000,
  stop_loss: 92000,
  targets: {
    tp1: {
      price: 100000,
      take_off_percent: 50,
      raise_stop_loss: { price: 95000 },
    },
    tp2: { price: 105000, take_off_percent: 100 },
  },
};

interface TemplateGroup {
  instrumentType: string;
  ticker: string;
  templates: DiscordPreviewMessage[];
}

function buildPreviewsFromData(
  data: Record<string, any>,
  ticker: string,
  appName?: string,
): DiscordPreviewMessage[] {
  const previews: DiscordPreviewMessage[] = [];

  const expendName = appName === "Discord Scalper" ? "Scalp Trade" : "";

  const fakeSignal = { data } as unknown as Signal;
  previews.push({
    type: "signal_alert",
    label: "Entry Signal",
    content: "@everyone",
    embed: buildEntryAlertEmbed(fakeSignal, expendName),
  });

  const targets =
    data.targets && typeof data.targets === "object"
      ? (data.targets as Record<
          string,
          { price?: number; take_off_percent?: number; raise_stop_loss?: { price?: number } }
        >)
      : {};
  const targetEntries = Object.entries(targets)
    .filter(([, val]) => val?.price != null && Number(val.take_off_percent) !== 0)
    .sort(([, a], [, b]) => Number(a.price) - Number(b.price));

  for (let i = 0; i < targetEntries.length; i++) {
    const [key, val] = targetEntries[i];
    const tpNumber = i + 1;
    const price = Number(val.price);
    const entryPrice = data.entry_instrument_price ?? data.entry_price ?? 0;
    const profitPct = entryPrice ? ((price - entryPrice) / entryPrice) * 100 : 0;
    const targetData = {
      ...data,
      current_tp_number: tpNumber,
      current_tp_price: price,
      current_tp_key: key,
      current_instrument_price: price,
      current_target_number: tpNumber,
      hit_targets: {
        [`tp${tpNumber}`]: { profitPct },
        [`target_${tpNumber}`]: { takeOffPercent: val.take_off_percent ?? 50 },
      },
    };
    previews.push({
      type: "target_hit",
      label: `Target ${key.toUpperCase()} Hit`,
      content: "",
      embed: buildTargetHitEmbed(targetData, null),
    });
  }

  for (let i = 0; i < targetEntries.length; i++) {
    const [key, val] = targetEntries[i];
    const newStop =
      val.raise_stop_loss?.price != null
        ? Number(val.raise_stop_loss.price)
        : null;
    if (newStop == null) continue;
    const tpNumber = i + 1;
    const entryPrice = data.entry_instrument_price ?? data.entry_price ?? 0;
    const isBreakEven = entryPrice > 0 && Math.abs(newStop - entryPrice) < 0.01;
    const riskValue = entryPrice > 0 ? `${(((newStop - entryPrice) / entryPrice) * 100).toFixed(1)}%` : "—";
    const slData = {
      ...data,
      current_stop_loss: newStop,
      new_stop_loss: newStop,
      sl_raised_target_key: key,
      stop_loss_is_break_even: isBreakEven,
      current_target_number: tpNumber,
      risk_value: riskValue,
    };
    previews.push({
      type: "stop_loss_raised",
      label: `SL Raised (${key.toUpperCase()})`,
      content: "",
      embed: buildStopLossRaisedEmbed(slData, null),
    });
  }

  const stopLoss = data.stop_loss != null ? Number(data.stop_loss) : null;
  if (stopLoss != null) {
    const entryPrice = data.entry_instrument_price ?? data.entry_price ?? 0;
    const slPct = entryPrice ? ((stopLoss - entryPrice) / entryPrice) * 100 : null;
    const slData = {
      ...data,
      current_instrument_price: stopLoss,
      stop_loss_percent: slPct,
    };
    previews.push({
      type: "stop_loss_hit",
      label: "Stop Loss Hit",
      content: "",
      embed: buildStopLossHitEmbed(slData, null),
    });
  }

  return previews;
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
    const templates = buildPreviewsFromData(sampleData, ticker, undefined);
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
  return buildPreviewsFromData(data, ticker, appName);
}
