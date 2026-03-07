import type { Signal } from "@shared/schema";
import {
  buildEntryAlertEmbed,
  buildTargetHitEmbed,
  buildStopLossRaisedEmbed,
  buildStopLossHitEmbed,
  buildTradeClosedEmbed,
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
  entry_price: 6.5,
  entry_option_price: 6.5,
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

  previews.push({
    type: "signal_alert",
    label: "Entry Signal",
    content: "@everyone",
    embed: buildEntryAlertEmbed(data, ticker, expendName),
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
      content: "",
      embed: buildStopLossHitEmbed(data, ticker, stopLoss),
    });
  }

  previews.push({
    type: "trade_closed_manually",
    label: "Trade Closed",
    content: "",
    embed: buildTradeClosedEmbed(data, ticker),
  });

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
