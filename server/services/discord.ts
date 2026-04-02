import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";
import { getLETFUnderlyingSync, getLETFLeverage } from "../constants/letf";
import { fetchOptionContractPrice, fetchStockPrice } from "./polygon";
import { getCurrentInstrumentPrice } from "./trade-monitor";
import {
  getDefaultTemplates,
  renderTemplate,
  type TemplateEmbed,
} from "./discord-templates";
import type { ChartFile } from "./signal-processor";

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
  image?: { url: string };
  video?: { url: string };
  thumbnail?: { url: string };
}

const GREEN = 0x22c55e;
const RED = 0xef4444;
const BLUE = 0x3b82f6;
const SPACER: DiscordField = { name: "\u200b", value: "", inline: false };
const DISCLAIMER = "Disclaimer: Not financial advice. Trade at your own risk.";
const ORANGE = 0xf59e0b;

function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "\u2014";
  return `$${Number(p).toFixed(2)}`;
}

function instrumentLabel(instrumentType: string): string {
  if (instrumentType === "LETF" || instrumentType === "Shares") return "Shares";
  if (instrumentType === "Crypto") return "Crypto";
  return "Options";
}

function buildTakeProfitPlan(signalData: Record<string, any>): string {
  if (!signalData.targets || typeof signalData.targets !== "object")
    return "\u2014";
  const direction = signalData.direction || "Long";
  const isBullish = direction === "Call" || direction === "Long";
  const entryTracking =
    typeof signalData.entry_tracking_price === "number"
      ? signalData.entry_tracking_price
      : typeof signalData.entry_instrument_price === "number"
        ? signalData.entry_instrument_price
        : typeof signalData.entry_price === "number"
          ? signalData.entry_price
          : 0;

  const entries = Object.entries(signalData.targets)
    .filter(([, v]) => (v as any)?.price != null)
    .sort(([, a], [, b]) =>
      isBullish
        ? Number((a as any).price) - Number((b as any).price)
        : Number((b as any).price) - Number((a as any).price),
    );

  let tpIndex = 0;
  const lines: string[] = [];
  for (const [, v] of entries) {
    const t = v as any;
    if (Number(t.take_off_percent) === 0) continue;
    tpIndex++;
    const price = Number(t.price);
    const priceLabel = signalData.underlying_price_based
      ? fmtPrice(price)
      : (() => {
          const pct =
            t.percentage != null
              ? `${Number(t.percentage).toFixed(1)}%`
              : entryTracking
                ? fmtPct(entryTracking, price)
                : "?";
          return `${fmtPrice(price)} (${pct})`;
        })();
    const takeOff =
      t.take_off_percent != null ? `${t.take_off_percent}%` : "100%";
    const positionLabel =
      tpIndex === 1 ? "of position" : "of remaining position";
    let line = `Take Profit (${tpIndex}): At ${priceLabel} take off ${takeOff} ${positionLabel}`;
    if (t.raise_stop_loss?.price != null) {
      const rsl = t.raise_stop_loss;
      const rslPrice = Number(rsl.price);
      const isBreakEven =
        entryTracking > 0 && Math.abs(rslPrice - entryTracking) < 0.01;
      if (isBreakEven) {
        line += " and raise stop loss to break even.";
      } else {
        const rslPct =
          rsl.percentage != null
            ? ` (${Number(rsl.percentage).toFixed(1)}%)`
            : entryTracking
              ? ` (${fmtPct(entryTracking, rslPrice)})`
              : "";
        line += ` and raise stop loss to ${fmtPrice(rslPrice)}${rslPct}.`;
      }
    } else {
      line += ".";
    }
    lines.push(line);
  }
  return lines.join("\n") || "\u2014";
}

function buildTradePlan(signalData: Record<string, any>): string {
  const parts: string[] = [];
  if (signalData.trade_plan) {
    parts.push(String(signalData.trade_plan));
  }
  // If no explicit plan, generate a compact plan based on targets + stop-loss.
  if (!signalData.trade_plan) {
    const tps: string[] = [];
    const slLines: string[] = [];

    const direction = signalData.direction || "Long";
    const isBullish = direction === "Call" || direction === "Long";

    const entryTracking =
      typeof signalData.entry_tracking_price === "number"
        ? signalData.entry_tracking_price
        : typeof signalData.entry_underlying_price === "number"
          ? signalData.entry_underlying_price
          : typeof signalData.entry_instrument_price === "number"
            ? signalData.entry_instrument_price
            : typeof signalData.entry_price === "number"
              ? signalData.entry_price
              : null;

    const targetsObj =
      signalData.targets && typeof signalData.targets === "object"
        ? (signalData.targets as Record<string, any>)
        : {};

    const targetEntries = Object.entries(targetsObj)
      .filter(([, v]) => (v as any)?.price != null)
      .sort(([, a], [, b]) =>
        isBullish
          ? Number((a as any).price) - Number((b as any).price)
          : Number((b as any).price) - Number((a as any).price),
      );

    if (targetEntries.length > 0) {
      const tpLabels = targetEntries.map(([, v]) => {
        const t = v as any;
        const price = Number(t.price);
        if (signalData.underlying_price_based) {
          return fmtPrice(price);
        }
        // Use percentage from target first; else compute from entry.
        const pct =
          t.percentage != null
            ? `${Number(t.percentage).toFixed(1)}%`
            : entryTracking != null
              ? fmtPct(entryTracking, price)
              : "?";
        return `${fmtPrice(price)} (${pct})`;
      });
      tps.push(`🎯 Targets: ${tpLabels.join(", ")}`);
    }

    // Build stop-loss list as { price, percentage? } for initial SL + each raise_stop_loss.
    const slEntries: { price: number; percentage?: number }[] = [];
    if (signalData.stop_loss != null) {
      slEntries.push({
        price: Number(signalData.stop_loss),
        percentage: signalData.stop_loss_percentage,
      });
    }
    for (const [, v] of targetEntries) {
      const t = v as any;
      const rsl = t.raise_stop_loss;
      if (rsl?.price != null) {
        slEntries.push({
          price: Number(rsl.price),
          percentage: rsl.percentage != null ? rsl.percentage : t.percentage,
        });
      }
    }
    if (slEntries.length > 0) {
      const slParts = slEntries.map(({ price, percentage }) => {
        if (signalData.underlying_price_based) {
          return fmtPrice(price);
        }
        const pct =
          percentage != null
            ? `${Number(percentage).toFixed(1)}%`
            : entryTracking != null
              ? fmtPct(entryTracking, price)
              : "?";
        return `${fmtPrice(price)} (${pct})`;
      });
      slLines.push(`🛑 Stop loss: ${slParts.join(", ")}`);
    }

    if (tps.length) parts.push(tps.join("\n"));
    if (slLines.length) parts.push(slLines.join("\n"));
  }
  return parts.join("\n").trim() || "\u2014";
}

function buildTemplateVars(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
  messageType: string,
): Record<string, string> {
  const instrumentType = signalData.instrument_type || "Shares";
  const ticker = signalData.ticker || "UNKNOWN";
  const direction = signalData.direction || "Long";
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const underlying =
    signalData.underlying_ticker ||
    signalData.underlying_symbol ||
    getLETFUnderlyingSync(ticker) ||
    ticker;
  const leverage = getLETFLeverage(ticker);
  const dirText =
    direction === "Short" || direction === "Put" ? "BEAR" : "BULL";
  const right = direction === "Put" ? "PUT" : "CALL";

  const entryPrice =
    typeof signalData.entry_instrument_price === "number"
      ? signalData.entry_instrument_price
      : typeof signalData.entry_price === "number"
        ? signalData.entry_price
        : null;

  const vars: Record<string, string> = {
    ticker,
    instrument_type: instrumentType,
    instrument_label: instrumentLabel(instrumentType),
    direction,
    app_name: app?.name || "TradeSync",
    trade_type: signalData.trade_type ? String(signalData.trade_type) : "Scalp",
    entry_price: fmtPrice(entryPrice),
    stock_price: fmtPrice(
      signalData.entry_underlying_price ??
        signalData.entry_tracking_price ??
        signalData.current_tracking_price ??
        signalData.current_instrument_price ??
        null,
    ),
    expiry: signalData.expiration ? String(signalData.expiration) : "\u2014",
    strike:
      signalData.strike != null && !isNaN(Number(signalData.strike))
        ? String(signalData.strike)
        : "\u2014",
    right,
    option_price: fmtPrice(
      signalData.entry_option_price ??
        signalData.entry_instrument_price ??
        signalData.current_instrument_price ??
        null,
    ),
    letf_ticker: isLETF ? ticker : "\u2014",
    underlying: isLETF ? underlying : ticker,
    leverage: leverage != null ? String(Math.abs(leverage)) : "\u2014",
    letf_direction: dirText,
    letf_entry: fmtPrice(signalData.entry_instrument_price),
    stop_loss: fmtPrice(signalData.stop_loss),
    time_stop: signalData.time_stop ? String(signalData.time_stop) : "\u2014",
    trade_plan: buildTradePlan(signalData),
    take_profit_plan: buildTakeProfitPlan(signalData),
    new_stop_loss: "\u2014",
    risk_value: signalData.risk_value
      ? String(signalData.risk_value)
      : "\u2014",
    risk_mgmt: "\u2014",
    position_mgmt: "\u2014",
    tp_number: String(
      signalData.current_tp_number ?? signalData.current_target_number ?? 1,
    ),
    tp_price: fmtPrice(signalData.current_instrument_price),
    profit_pct:
      typeof signalData.hit_targets?.[`tp${signalData.current_target_number}`]
        ?.profitPct === "number"
        ? `${signalData.hit_targets[`tp${signalData.current_target_number}`].profitPct.toFixed(1)}%`
        : "\u2014",
    exit_price: fmtPrice(
      signalData.stop_loss_hit_instrument_price ??
        signalData.stop_loss_hit_price ??
        signalData.current_instrument_price ??
        null,
    ),
  };

  if (messageType === "target_hit") {
    const takeOffPct =
      signalData.targets?.[`tp${signalData.current_target_number}`]
        ?.take_off_percent ?? 50;
    const nextTargets =
      signalData.targets && typeof signalData.targets === "object"
        ? Object.entries(signalData.targets)
            .filter(([, v]) => (v as any)?.price != null)
            .sort(
              ([, a], [, b]) =>
                Number((a as any).price) - Number((b as any).price),
            )
        : [];
    let nextTpPrice: number | null = null;
    if (nextTargets.length > 0) {
      const idx = Math.min(
        signalData.current_target_number ?? 1,
        nextTargets.length - 1,
      );
      const maybe = nextTargets[idx]?.[1] as any;
      nextTpPrice = maybe?.price != null ? Number(maybe.price) : null;
    }
    vars.position_mgmt =
      `✅ Reduce position by ${takeOffPct}% (lock in profit)` +
      (nextTpPrice != null
        ? `\n🎯 Let remaining ${100 - takeOffPct}% ride to TP${Number(vars.tp_number) + 1} (${fmtPrice(nextTpPrice)})`
        : "");

    const currentTarget = signalData.targets?.[
      `tp${signalData.current_target_number}`
    ] as any;
    const newStopLoss =
      currentTarget?.raise_stop_loss?.price != null
        ? Number(currentTarget.raise_stop_loss.price)
        : null;
    if (newStopLoss != null) {
      const isBreakEven =
        entryPrice != null && Math.abs(newStopLoss - entryPrice) < 0.01;
      vars.new_stop_loss = isBreakEven
        ? `${fmtPrice(newStopLoss)} (Break Even)`
        : fmtPrice(newStopLoss);
      vars.risk_mgmt = isBreakEven
        ? `Raising stop loss to ${fmtPrice(newStopLoss)} (break even) on remaining position to secure gains while allowing room to run.`
        : `Raising stop loss to ${fmtPrice(newStopLoss)} on remaining position to secure gains while allowing room to run.`;
    } else {
      vars.risk_mgmt = "No stop adjustment on this target.";
    }
  }

  if (messageType === "stop_loss_raised") {
    vars.new_stop_loss = fmtPrice(
      signalData.current_stop_loss ?? signalData.stop_loss,
    );
    vars.risk_value = signalData.risk_value
      ? String(signalData.risk_value)
      : "\u2014";
    vars.risk_mgmt =
      vars.new_stop_loss !== "\u2014"
        ? `Stop loss raised to ${vars.new_stop_loss} on remaining position.`
        : "\u2014";
  }

  if (messageType === "stop_loss_hit") {
    const exit =
      signalData.stop_loss_hit_instrument_price ??
      signalData.current_instrument_price ??
      null;
    vars.exit_price = fmtPrice(exit);
    const pct =
      entryPrice != null && exit != null
        ? `${(((exit - entryPrice) / entryPrice) * 100).toFixed(1)}%`
        : "\u2014";
    vars.profit_pct = pct;
  }

  return vars;
}

async function getRenderedTemplateEmbed(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
  messageType: string,
): Promise<{ content: string; embed: DiscordEmbed } | null> {
  const instrumentType = signalData.instrument_type || "Shares";
  const defaults = getDefaultTemplates(instrumentType);
  const defaultTemplate = defaults.find((t) => t.type === messageType) || null;
  if (!defaultTemplate) return null;

  let embedTemplate: TemplateEmbed = defaultTemplate.embed;
  let content = defaultTemplate.content || "";

  try {
    // 1) App-specific override
    let override = app
      ? (await storage.getDiscordTemplatesByApp(app.id)).find(
          (t) =>
            t.instrumentType === instrumentType &&
            t.messageType === messageType,
        )
      : undefined;

    // 2) Global default override (appId="__default__") if no app-specific override
    if (!override) {
      const globalOverrides =
        await storage.getDiscordTemplatesByApp("__default__");
      override = globalOverrides.find(
        (t) =>
          t.instrumentType === instrumentType && t.messageType === messageType,
      );
    }

    if (override) {
      embedTemplate = override.embedJson as unknown as TemplateEmbed;
      content = override.content ?? content;
    }
  } catch {
    // ignore template load failures; fall back to defaults
  }

  console.log("embedTemplate", embedTemplate);
  const vars = buildTemplateVars(signalData, app, messageType);
  console.log("vars", vars);
  const rendered = renderTemplate(embedTemplate, vars);
  console.log("rendered", rendered);
  return { content, embed: rendered as unknown as DiscordEmbed };
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
  chartFile?: ChartFile | null,
): Promise<boolean> {
  if (!url) {
    console.log("[Discord] Webhook URL not configured");
    return false;
  }

  try {
    let res: Response;

    if (chartFile) {
      const filename = chartFile.originalname || "chart.png";
      const embedsWithImage = embeds.map((e) => ({
        ...e,
        image: { url: `attachment://${filename}` },
      }));

      const formData = new FormData();
      formData.append(
        "payload_json",
        JSON.stringify({ content, embeds: embedsWithImage }),
      );
      const blob = new Blob([chartFile.buffer], { type: chartFile.mimetype });
      formData.append("files[0]", blob, filename);

      res = await fetch(url, { method: "POST", body: formData });
    } else {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, embeds }),
      });
    }

    if (res.status === 429 && !isRetry) {
      const body = await res.json().catch(() => ({}));
      const retryAfter = (body as { retry_after?: number }).retry_after ?? 1;
      console.log(`[Discord] Rate limited, retrying after ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return sendWebhook(url, content, embeds, true, chartFile);
    }

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[Discord] Webhook failed: ${res.status} ${body}`);
      return false;
    }

    console.log(
      `[Discord] Webhook sent successfully${chartFile ? " (with chart media)" : ""}`,
    );
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
  const byType =
    instrumentType === "Options"
      ? app.discordWebhookOptions
      : instrumentType === "Shares"
        ? app.discordWebhookShares
        : instrumentType === "LETF"
          ? app.discordWebhookLetf
          : instrumentType === "LETF Option"
            ? app.discordWebhookLetfOption
            : instrumentType === "Crypto"
              ? app.discordWebhookCrypto
              : null;
  if (byType && byType.trim()) return byType.trim();

  const fallback =
    app.webhookUrl?.trim() ||
    app.discordWebhookOptions?.trim() ||
    app.discordWebhookShares?.trim() ||
    app.discordWebhookLetf?.trim() ||
    app.discordWebhookLetfOption?.trim() ||
    app.discordWebhookCrypto?.trim() ||
    null;
  return fallback || null;
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
export function profitPctFromInstrument(
  entry: number,
  current: number,
  instrumentType: string,
  direction: string,
): number {
  const isOption =
    instrumentType === "Options" || instrumentType === "LETF Option";
  if (isOption) return ((current - entry) / entry) * 100; // option P&L: we're long the option, profit when option price rises
  const isBullish = direction === "Call" || direction === "Long";
  return isBullish
    ? ((current - entry) / entry) * 100
    : ((entry - current) / entry) * 100;
}

function getUnderlying(data: Record<string, any>, ticker: string): string {
  return (
    data.underlying_ticker ||
    data.underlying_symbol ||
    getLETFUnderlyingSync(ticker) ||
    ticker
  );
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

function buildOptionsFields(signalData: Record<string, any>): DiscordField[] {
  const ticker = signalData.ticker || "UNKNOWN";
  const direction = signalData.direction || "Call";
  const stockPrice = signalData.entry_underlying_price;
  const optionPrice = signalData.entry_instrument_price;
  const fields: DiscordField[] = [];
  fields.push({ ...SPACER });
  fields.push({ name: "\u{1F7E2} Ticker", value: ticker, inline: true });
  fields.push({
    name: "\u{1F4CA} Stock Price",
    value: stockPrice ? fmtPrice(stockPrice) : "\u2014",
    inline: true,
  });
  fields.push({ ...SPACER });
  fields.push({
    name: "\u274C Expiration",
    value: signalData.expiration || "\u2014",
    inline: true,
  });
  fields.push({
    name: "\u270D\uFE0F Strike",
    value: `${signalData.strike || "\u2014"} ${direction.toUpperCase()}`,
    inline: true,
  });
  fields.push({
    name: "\u{1F4B5} Option Price",
    value: optionPrice ? fmtPrice(optionPrice) : "\u2014",
    inline: true,
  });
  fields.push({ ...SPACER });
  return fields;
}

function buildLetfFields(signalData: Record<string, any>): DiscordField[] {
  const ticker = signalData.ticker || "UNKNOWN";
  const underlying = getUnderlying(signalData, ticker);
  const leverage = getLETFLeverage(ticker);
  const dir = signalData.direction || "Long";
  const dirText = dir === "Short" ? "BEAR" : "BULL";
  const letfEntry =
    signalData.entry_instrument_price != null
      ? `$ ${Number(signalData.entry_instrument_price).toFixed(2)}`
      : "Pending";
  const fields: DiscordField[] = [
    { ...SPACER },
    { name: "\u{1F7E2} Ticker", value: underlying, inline: true },
    { name: "\u{1F4C8} Direction", value: dir, inline: true },
    { ...SPACER },
    {
      name: "\u{1F4F9} LETF",
      value: `${ticker} (${leverage}x ${dirText})`,
      inline: true,
    },
    {
      name: "\u{1F4B0} LETF Entry",
      value: letfEntry,
      inline: true,
    },
    { ...SPACER },
  ];
  return fields;
}

function buildLetfOptionsFields(
  signalData: Record<string, any>,
): DiscordField[] {
  const ticker = signalData.ticker || "UNKNOWN";
  const direction = signalData.direction || "Call";
  const underlying = getUnderlying(signalData, ticker);
  const leverage = getLETFLeverage(ticker);
  const dirText = direction === "Put" ? "BEAR" : "BULL";

  const fields: DiscordField[] = [
    { ...SPACER },
    { name: "\u{1F7E2} Ticker", value: ticker, inline: true },
    {
      name: "\u{1F4CA} LETF Price",
      value: signalData.entry_letf_price
        ? fmtPrice(signalData.entry_letf_price)
        : "\u2014",
      inline: true,
    },
    {
      name: "\u{1F4B9} Leveraged ETF",
      value: `${ticker} (${leverage}x ${dirText})`,
      inline: true,
    },
    { ...SPACER },
    {
      name: "\u274C Expiration",
      value: signalData.expiration || "\u2014",
      inline: true,
    },
    {
      name: "\u270D\uFE0F Strike",
      value: `${signalData.strike || "\u2014"} ${direction.toUpperCase()}`,
      inline: true,
    },
    {
      name: "\u{1F4B5} Option Price",
      value: signalData.entry_instrument_price
        ? fmtPrice(signalData.entry_instrument_price)
        : "\u2014",
      inline: true,
    },
    { ...SPACER },
  ];

  return fields;
}

function buildSharesFields(signalData: Record<string, any>): DiscordField[] {
  const dir = signalData.direction || "Long";
  const fields: DiscordField[] = [
    { ...SPACER },
    {
      name: "\u{1F7E2} Ticker",
      value: signalData.ticker || "UNKNOWN",
      inline: true,
    },
    {
      name: "\u{1F4CA} Stock Price",
      value: signalData.entry_tracking_price
        ? fmtPrice(signalData.entry_tracking_price)
        : "\u2014",
      inline: true,
    },
    { name: "\u{1F4C8} Direction", value: dir, inline: true },
    { ...SPACER },
  ];

  return fields;
}

function buildEmbedFields(signalData: Record<string, any>): DiscordField[] {
  const instrumentType = signalData.instrument_type || "Shares";
  if (instrumentType === "Shares") {
    return buildSharesFields(signalData);
  }
  if (instrumentType === "Options") {
    return buildOptionsFields(signalData);
  }
  if (instrumentType === "LETF") {
    return buildLetfFields(signalData);
  }
  if (instrumentType === "LETF Option") {
    return buildLetfOptionsFields(signalData);
  }

  return [];
}

/** Builds the signal alert (entry) embed. Used by preview and send. */
export function buildEntryAlertEmbed(
  signal: Signal,
  appName?: string,
): DiscordEmbed {
  const signalData = signal.data as Record<string, any>;
  const ticker = signalData.ticker;
  const instrumentType = signalData.instrument_type || "Shares";
  const strSharesSymbol =
    instrumentType === "LETF" || instrumentType === "Shares"
      ? "Shares"
      : "Options";

  const direction = signalData.direction;
  const isBullish = direction === "Call" || direction === "Long";

  const heading = `**\u{1F6A8} ${ticker} ${strSharesSymbol} Entry${appName && appName.trim().length > 0 ? ` - ${appName}` : ""}**`;

  const fields = buildEmbedFields(signalData);

  const tradePlanParts: string[] = [];
  if (signalData.targets && typeof signalData.targets === "object") {
    const targetPrices = Object.entries(signalData.targets)
      .filter(([, val]) => (val as any)?.price)
      .sort(([, a], [, b]) =>
        signalData.underlying_price_based
          ? isBullish
            ? Number((a as any).price) - Number((b as any).price)
            : Number((b as any).price) - Number((a as any).price)
          : direction === "Short"
            ? Number((b as any).price) - Number((a as any).price)
            : Number((a as any).price) - Number((b as any).price),
      )
      .map(([, val]) => {
        const price = Number((val as any).price);
        if (signalData.underlying_price_based) {
          return fmtPrice(price);
        }
        const t = val as any;
        const pct = t.percentage != null ? Number(t.percentage) : NaN;
        return pct ? `${fmtPrice(price)} (${pct}%)` : fmtPrice(price);
      });
    if (targetPrices.length > 0) {
      tradePlanParts.push(`🎯 Targets: ${targetPrices.join(", ")}`);
    }
  }

  if (signalData.stop_loss != null) {
    const formatStopLossPrice = (price: number, pct: number) =>
      signalData.underlying_price_based
        ? fmtPrice(price)
        : (() => {
            return pct ? `${fmtPrice(price)} (${pct}%)` : fmtPrice(price);
          })();

    const initialSL = formatStopLossPrice(
      Number(signalData.stop_loss),
      Number(signalData.stop_loss_percentage),
    );
    const targets =
      signalData.targets && typeof signalData.targets === "object"
        ? Object.entries(signalData.targets)
            .filter(([, val]) => (val as any)?.raise_stop_loss?.price)
            .sort(([, a], [, b]) =>
              signalData.underlying_price_based
                ? isBullish
                  ? Number((a as any).price) - Number((b as any).price)
                  : Number((b as any).price) - Number((a as any).price)
                : direction === "Short"
                  ? Number((b as any).price) - Number((a as any).price)
                  : Number((a as any).price) - Number((b as any).price),
            )
        : [];
    const raiseStopLossFormatted = targets.map(([, val]) => {
      const t = val as any;
      const rsl = t.raise_stop_loss || {};
      const pct =
        rsl.percentage != null
          ? Number(rsl.percentage)
          : t.percentage != null
            ? Number(t.percentage)
            : NaN;
      return formatStopLossPrice(Number(rsl.price), pct);
    });
    const stopLossLine = [initialSL, ...raiseStopLossFormatted].join(", ");
    tradePlanParts.push(`🛑 Stop loss: ${stopLossLine}`);
  }

  if (signalData.time_stop) {
    tradePlanParts.push(`🌐 Time Stop: ${signalData.time_stop}`);
  }

  if (tradePlanParts.length > 0) {
    fields.push({
      name: signalData.underlying_price_based
        ? `📝 Trade Plan (Based on ${signalData.underlying_ticker} levels)`
        : "📝 Trade Plan",
      value: tradePlanParts.join("\n"),
      inline: false,
    });
  }

  if (signalData.targets && typeof signalData.targets === "object") {
    const tpLines: string[] = [];
    const entries = Object.entries(signalData.targets).filter(
      ([, val]) => (val as any)?.price,
    );
    const priceLabel = (p: number) =>
      signalData.underlying_price_based
        ? fmtPrice(p)
        : (signalData.entry_tracking_price
            ? fmtPct(signalData.entry_tracking_price, p)
            : null) || fmtPrice(p);
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
          const isBreakEven =
            signalData.entry_tracking_price &&
            Math.abs(rslPrice - signalData.entry_tracking_price) < 0.01;
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
          const isBreakEven =
            signalData.entry_tracking_price &&
            Math.abs(rslPrice - signalData.entry_tracking_price) < 0.01;
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

  return {
    description: heading,
    color: GREEN,
    fields,
    footer: { text: DISCLAIMER },
  };
}

/** Builds the target hit embed. Used by preview and send. Profit % is always based on instrument price. */
export function buildTargetHitEmbed(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
): DiscordEmbed {
  const isSharesSymbol =
    signalData.instrument_type === "LETF" ||
    signalData.instrument_type === "Shares"
      ? "Shares"
      : "Options";

  const description =
    signalData.instrument_type === "Crypto"
      ? `**\u{1F3AF} ${signalData.ticker} Crypto Take Profit ${signalData.current_tp_number} HIT**`
      : `**\u{1F3AF} ${signalData.ticker} ${isSharesSymbol} Take Profit ${signalData.current_tp_number} HIT**`;

  const fields: DiscordField[] = [];
  if (signalData.instrument_type === "LETF") {
    fields.push(
      {
        name: `\u{1F4B9} LETF: ${
          signalData.leverage
            ? `${signalData.ticker} (${signalData.leverage}x ${signalData.leverage_direction})`
            : `${signalData.ticker} (${signalData.leverage_direction})`
        }`,
        value: "",
        inline: true,
      },
      { ...SPACER },
    );
  } else {
    fields.push({ ...SPACER });
    pushInstrumentFields(fields, signalData);
  }

  fields.push(
    {
      name: "\u2705 Entry",
      value: `${fmtPrice(signalData.entry_instrument_price)}`,
      inline: true,
    },
    {
      name: `\u{1F3AF} TP${signalData.current_tp_number} Hit`,
      value: `${fmtPrice(signalData.current_instrument_price)}`,
      inline: true,
    },
  );
  const profitPct =
    signalData.hit_targets[`tp${signalData.current_target_number}`]?.profitPct;

  fields.push(
    {
      name: "\u{1F4B8} Profit",
      value: `${profitPct != null ? `${profitPct.toFixed(1)}%` : "\u2014"}`,
      inline: true,
    },
    { ...SPACER },
    {
      name: `\u{1F6A8} Status: TP${signalData.current_tp_number} Reached \u{1F6A8}`,
      value: "\u200b",
      inline: false,
    },
  );
  const takeOffPercent =
    signalData.hit_targets[`target_${signalData.current_target_number}`]
      ?.takeOffPercent;
  // Find nextTp: first target in signalData.targets where takeOffPercent > 0 and targetNumber > current_target_number
  let nextTp: any = null;
  if (signalData.targets && typeof signalData.targets === "object") {
    nextTp = Object.entries(signalData.targets).find(
      ([key, t]) =>
        Number((t as any).takeOffPercent) > 0 &&
        Number(key.replace(/^tp/i, "")) >
          Number(signalData.current_target_number),
    );
  }
  const positionMgmtLines = [
    `\u2705 Reduce position by ${takeOffPercent ?? 50}% (lock in profit)`,
    ...(nextTp
      ? [
          `\u{1F3AF} Let remaining ${takeOffPercent ? 100 - takeOffPercent : 50}% ride to TP${signalData.current_tp_number + 1} (${fmtPrice(Number((nextTp as any).price))})`,
        ]
      : []),
  ];
  const currentTarget =
    signalData.targets[`tp${signalData.current_target_number}`];
  const newStopLoss = currentTarget?.raise_stop_loss?.price
    ? Number(currentTarget.raise_stop_loss.price)
    : null;
  const isBreakEven =
    newStopLoss != null &&
    signalData.entry_instrument_price != null &&
    Math.abs(newStopLoss - signalData.entry_instrument_price) < 0.01;
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
  signalData: Record<string, any>,
  app: ConnectedApp | null,
): DiscordEmbed {
  const isSharesSymbol =
    signalData.instrument_type === "LETF" ||
    signalData.instrument_type === "Shares"
      ? "Shares"
      : "Options";
  const description =
    signalData.instrument_type === "Crypto"
      ? `**\u{1F6E1}\uFE0F ${signalData.ticker} Crypto Stop Loss Raised**`
      : `**\u{1F6E1}\uFE0F ${signalData.ticker} ${isSharesSymbol} Stop Loss Raised**`;

  const newStopLabel = signalData.current_stop_loss_is_break_even
    ? `${fmtPrice(signalData.current_stop_loss)} (Break Even)`
    : fmtPrice(signalData.current_stop_loss);
  const statusLabel = signalData.current_stop_loss_is_break_even
    ? "\u{1F6A8} Status: Stop Loss Raised to Break Even \u{1F6A8}"
    : "\u{1F6A8} Status: Stop Loss Raised \u{1F6A8}";
  const riskMgmtLines = [
    signalData.current_stop_loss_is_break_even
      ? `Stop loss raised to ${fmtPrice(signalData.current_stop_loss)} (break even).\nTrade is now risk-free on remaining position.`
      : `Stop loss raised to ${fmtPrice(signalData.current_stop_loss)} on remaining position.`,
  ];
  const nextTargetKey = `tp${signalData.current_target_number + 1}`;
  const nextTarget = signalData.targets?.[nextTargetKey];
  if (nextTarget?.price != null) {
    const label = (nextTarget.key ?? nextTargetKey).toString().toUpperCase();
    riskMgmtLines.push(
      `\u{1F3AF} Next target: ${label} at ${fmtPrice(Number(nextTarget.price))}`,
    );
  }

  const fields: DiscordField[] = [];
  fields.push({ ...SPACER });
  pushInstrumentFields(fields, signalData);
  fields.push(
    {
      name: "\u2705 Entry",
      value: `${fmtPrice(signalData.entry_instrument_price)}`,
      inline: true,
    },
    {
      name: "\u{1F6E1}\uFE0F New Stop",
      value: newStopLabel,
      inline: true,
    },
    { name: "\u{1F4B8} Risk", value: signalData.risk_value, inline: true },
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
  signalData: Record<string, any>,
  app: ConnectedApp | null,
): DiscordEmbed {
  const isSharesSymbol =
    signalData.instrument_type === "LETF" ||
    signalData.instrument_type === "Shares"
      ? "Shares"
      : "Options";
  const description =
    signalData.instrument_type === "Crypto"
      ? `**\u{1F6D1} ${signalData.ticker} Crypto Stop Loss Hit**`
      : `**\u{1F6D1} ${signalData.ticker} ${isSharesSymbol} Stop Loss Hit**`;

  const fields: DiscordField[] = [];
  fields.push({ ...SPACER });
  pushInstrumentFields(fields, signalData);
  fields.push(
    {
      name: "\u2705 Entry",
      value: `${fmtPrice(signalData.entry_instrument_price)}`,
      inline: true,
    },
    {
      name: "\u{1F6D1} Stop Hit",
      value: fmtPrice(signalData.current_instrument_price) ?? "\u2014",
      inline: true,
    },
    {
      name: "\u{1F4B8} Result",
      value:
        signalData.current_stop_loss_percent != null
          ? `${signalData.current_stop_loss_percent.toFixed(1)}%`
          : "\u2014",
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
  const underlying = getUnderlying(data, ticker);
  const displayTicker = isLETF ? underlying : ticker;
  const description = isLETF
    ? `**${emoji} ${displayTicker} ${isSharesSymbol} Closed Manually**`
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
  pushInstrumentFields(fields, data);
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

function getDiscordWebhookUrl(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
): string | null {
  if (signalData.discord_webhook_url) return signalData.discord_webhook_url;
  if (!app) return null;
  return (
    getWebhookForInstrument(app, signalData.instrument_type || "Shares") || null
  );
}

/**
 * Sends a Discord alert when a take-profit target is hit.
 * For LETF, uses the rich format (underlying → LETF, Position Management, Risk Management).
 */
export async function sendTargetHitDiscordAlert(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
  signalId: string,
): Promise<void> {
  const discordWebhookUrl = getDiscordWebhookUrl(signalData, app);
  if (!discordWebhookUrl) return;

  const template = await getRenderedTemplateEmbed(
    signalData,
    app,
    "target_hit",
  );
  const embed = template?.embed ?? buildTargetHitEmbed(signalData, app);
  const content =
    template?.content ??
    (app
      ? getContentForInstrument(app, signalData.instrument_type || "Shares")
      : "@everyone");
  const sent = await sendWebhook(discordWebhookUrl, content, [embed]);

  await storage
    .createDiscordMessage({
      signalId,
      webhookUrl: discordWebhookUrl,
      channelType: "signal",
      instrumentType: signalData.instrument_type || "Shares",
      status: sent ? "sent" : "error",
      messageType: "target_hit",
      embedData: {
        ticker: signalData.ticker || "",
        sourceAppId: app?.id ?? null,
        sourceAppName: app?.name ?? null,
      },
    })
    .catch(() => {});
}

function pushInstrumentFields(
  fields: DiscordField[],
  signalData: Record<string, any>,
): void {
  const ticker = signalData.ticker || "UNKNOWN";
  const direction = signalData.direction || "Long";
  const underlying = getUnderlying(signalData, ticker);
  const leverage = signalData.leverage ?? getLETFLeverage(ticker);
  const dirText =
    direction === "Short" || direction === "Put" ? "BEAR" : "BULL";
  if (signalData.instrument_type === "LETF") {
    fields.push(
      {
        name: "\u{1F4B9} LETF",
        value: `${ticker} (${leverage}x ${dirText})`,
        inline: true,
      },
      {
        name: "\u{1F4B5} LETF Entry",
        value: signalData.entry_instrument_price
          ? fmtPrice(signalData.entry_instrument_price)
          : "\u2014",
        inline: true,
      },
      {
        name: "\u{1F4CA} Underlying Price",
        value:
          signalData.entry_underlying_price != null
            ? fmtPrice(signalData.entry_underlying_price)
            : "\u2014",
        inline: true,
      },
    );
  } else if (signalData.instrument_type === "LETF Option") {
    const right = direction === "Put" ? "PUT" : "CALL";
    fields.push(
      {
        name: "\u{1F4B9} Leveraged ETF",
        value: `${ticker} (${leverage}x ${dirText})`,
        inline: true,
      },
      {
        name: "\u274C Expiration",
        value: `${signalData.expiration ?? "\u2014"}`,
        inline: true,
      },
      {
        name: "\u270D\uFE0F Strike",
        value: `${signalData.strike ?? "\u2014"} ${right}`,
        inline: true,
      },
    );
  } else if (signalData.instrument_type === "Options") {
    fields.push(
      {
        name: "\u274C Expiration",
        value: `${signalData.expiration ?? "\u2014"}`,
        inline: true,
      },
      {
        name: "\u270D\uFE0F Strike",
        value: `${signalData.strike ?? "\u2014"} ${(signalData.direction || "Call").toUpperCase()}`,
        inline: true,
      },
      {
        name: "\u{1F4B5} Option Price",
        value:
          signalData.current_instrument_price != null
            ? fmtPrice(signalData.current_instrument_price)
            : "\u2014",
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
  signalId: string,
): Promise<void> {
  const discordWebhookUrl = getDiscordWebhookUrl(signalData, app);
  if (!discordWebhookUrl) return;

  const template = await getRenderedTemplateEmbed(
    signalData,
    app,
    "stop_loss_raised",
  );
  const embed = template?.embed ?? buildStopLossRaisedEmbed(signalData, app);
  const content =
    template?.content ??
    (app
      ? getContentForInstrument(app, signalData.instrument_type || "Shares")
      : "@everyone");
  const sent = await sendWebhook(discordWebhookUrl, content, [embed]);

  await storage
    .createDiscordMessage({
      signalId,
      webhookUrl: discordWebhookUrl,
      channelType: "signal",
      instrumentType: signalData.instrument_type || "Shares",
      status: sent ? "sent" : "error",
      messageType: "stop_loss_raised",
      embedData: {
        ticker: signalData.ticker || "",
        sourceAppId: app?.id ?? null,
        sourceAppName: app?.name ?? null,
      },
    })
    .catch(() => {});
}

/**
 * Sends a Discord alert when stop loss is hit.
 */
export async function sendStopLossHitDiscord(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
  signalId: string,
): Promise<void> {
  const discordWebhookUrl = getDiscordWebhookUrl(signalData, app);
  if (!discordWebhookUrl) return;

  const template = await getRenderedTemplateEmbed(
    signalData,
    app,
    "stop_loss_hit",
  );
  const embed = template?.embed ?? buildStopLossHitEmbed(signalData, app);
  const content =
    template?.content ??
    (app
      ? getContentForInstrument(app, signalData.instrument_type || "Shares")
      : "@everyone");
  const sent = await sendWebhook(discordWebhookUrl, content, [embed]);

  await storage
    .createDiscordMessage({
      signalId,
      webhookUrl: discordWebhookUrl,
      channelType: "signal",
      instrumentType: signalData.instrument_type || "Shares",
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

function buildMilestoneEntryEmbed(
  signal: Signal,
  appName?: string,
): DiscordEmbed {
  const signalData = signal.data as Record<string, any>;
  const ticker = signalData.ticker;
  const instrumentType = signalData.instrument_type || "Shares";
  const strSharesSymbol =
    instrumentType === "LETF" || instrumentType === "Shares"
      ? "Shares"
      : "Options";

  const heading = `**\u{1F6A8} ${ticker} ${strSharesSymbol} Entry${appName && appName.trim().length > 0 ? ` - ${appName}` : ""}**`;

  const fields = buildEmbedFields(signalData);

  if (signalData.stop_loss != null) {
    const slPrice = Number(signalData.stop_loss);
    fields.push({
      name: "🛑 Stop Loss",
      value: fmtPrice(slPrice),
      inline: true,
    });
  }

  if (signalData.trade_plan) {
    fields.push({ ...SPACER });
    fields.push({
      name: "📝 Notes",
      value: String(signalData.trade_plan),
      inline: false,
    });
  }

  return {
    description: heading,
    color: GREEN,
    fields,
    footer: { text: DISCLAIMER },
  };
}

async function sendEntryDiscordAlertTenPercent(
  signal: Signal,
  app: ConnectedApp | null,
  overrideWebhookUrl?: string | null,
  chartFile?: ChartFile | null,
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
    return {
      sent: false,
      error: `No webhook configured for ${instrumentType} on app ${app.name}`,
    };
  }

  if (!data.discord_webhook_url) {
    const updatedData = { ...data, discord_webhook_url: webhookUrl };
    await storage
      .updateSignal(signal.id, { data: updatedData as any })
      .catch(() => {});
  }

  const expendName =
    app.name === "Discord Scalper"
      ? "Scalp Trade"
      : app.name === "TDI Trade"
        ? "Swing Trade"
        : "";

  const embed = buildMilestoneEntryEmbed(signal, expendName);
  const content = getContentForInstrument(app, instrumentType);

  let sent = false;
  let error: string | null = null;
  try {
    sent = await sendWebhook(webhookUrl, content, [embed], false, chartFile);
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
    embedData: { ticker, alertMode: "ten_percent" },
    error,
    sourceAppId: app.id,
    sourceAppName: app.name,
  });

  if (sent) {
    await storage.createActivity({
      type: "discord_sent",
      title: `Discord alert sent for ${ticker}`,
      description: `Milestone-mode entry alert sent to Discord via ${app.name}`,
      symbol: ticker,
      signalId: signal.id,
      metadata: { sourceApp: app.name, sourceAppId: app.id },
    });
  }

  return { sent, error };
}

export function buildProfitMilestoneEmbed(
  signalData: Record<string, any>,
  milestonePct: number,
  app: ConnectedApp | null,
): DiscordEmbed {
  const ticker = signalData.ticker || "UNKNOWN";
  const instrumentType = signalData.instrument_type || "Shares";
  const isSharesSymbol =
    instrumentType === "LETF" || instrumentType === "Shares"
      ? "Shares"
      : "Options";

  const ORANGE = 0xf59e0b;
  const GOLD = 0xeab308;
  // const embedColor = milestonePct >= 50 ? GOLD : milestonePct >= 20 ? ORANGE : GREEN;
  const embedColor = GREEN;

  const heading = `**\u{1F4B0} ${ticker} ${isSharesSymbol} +${milestonePct}% Profit Milestone**`;

  const fields: DiscordField[] = [];

  const entryPrice =
    signalData.entry_instrument_price ?? signalData.entry_price;
  const currentPrice = signalData.current_instrument_price;
  const currentProfitPct =
    entryPrice && currentPrice
      ? profitPctFromInstrument(
          entryPrice,
          currentPrice,
          instrumentType,
          signalData.direction || "Long",
        )
      : milestonePct;

  pushInstrumentFields(fields, signalData);

  fields.push(
    { name: "📈 Entry Price", value: fmtPrice(entryPrice), inline: true },
    { name: "💵 Current Price", value: fmtPrice(currentPrice), inline: true },
    {
      name: "📊 Profit",
      value: `+${currentProfitPct.toFixed(1)}%`,
      inline: true,
    },
  );

  fields.push({ ...SPACER });
  let milestone_title = "🏆 Milestone";
  let milestone_text = `+${milestonePct}% profit reached`;
  if (milestonePct >= 30 && milestonePct < 40) {
    milestone_title = "<a:swj_boom_emoji:1485922107639726119> Boom Baby";
  } else if (milestonePct >= 40 && milestonePct < 50) {
    milestone_title = "<a:swj_kaboom_emoji:1485921838675787806> Kaboom";
  } else if (milestonePct >= 50) {
    milestone_title = "💰 Gains";
  }
  fields.push({
    name: milestone_title,
    value: milestone_text,
    inline: false,
  });

  let disclaimer_text = DISCLAIMER;
  if (milestonePct >= 10 && milestonePct < 30) {
    disclaimer_text = "Manage your own trade accordingly";
  } else if (milestonePct >= 30 && milestonePct < 40) {
    disclaimer_text = "break even stop loss";
  } else if (milestonePct >= 40) {
    disclaimer_text = "raise stop loss accordingly";
  }
  let image_url = "";
  if (milestonePct >= 30 && milestonePct < 40) {
    image_url =
      "https://cdn.discordapp.com/emojis/1485922107639726119.webp?size=60&animated=true";
  } else if (milestonePct >= 40 && milestonePct < 50) {
    image_url =
      "https://cdn.discordapp.com/emojis/1485921838675787806.webp?size=60&animated=true";
  }
  return {
    description: heading,
    color: embedColor,
    fields,
    footer: { text: disclaimer_text },
    thumbnail: { url: image_url },
  };
}

export async function sendProfitMilestoneDiscordAlert(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
  signalId: string,
  milestonePct: number,
): Promise<void> {
  const discordWebhookUrl = getDiscordWebhookUrl(signalData, app);
  if (!discordWebhookUrl) return;

  const embed = buildProfitMilestoneEmbed(signalData, milestonePct, app);
  const content = app
    ? getContentForInstrument(app, signalData.instrument_type || "Shares")
    : "@everyone";
  const sent = await sendWebhook(discordWebhookUrl, content, [embed]);

  await storage
    .createDiscordMessage({
      signalId,
      webhookUrl: discordWebhookUrl,
      channelType: "signal",
      instrumentType: signalData.instrument_type || "Shares",
      status: sent ? "sent" : "error",
      messageType: "profit_milestone",
      embedData: {
        ticker: signalData.ticker || "",
        milestonePct,
        sourceAppId: app?.id ?? null,
        sourceAppName: app?.name ?? null,
      },
    })
    .catch(() => {});
}

export async function sendEntryDicordAlert(
  signal: Signal,
  app: ConnectedApp | null,
  overrideWebhookUrl?: string | null,
  chartFile?: ChartFile | null,
): Promise<DiscordSendResult> {
  if (!app) {
    return { sent: false, error: "No connected app provided" };
  }
  const useOverride =
    overrideWebhookUrl && overrideWebhookUrl.trim().length > 0;
  if (!useOverride && !app.sendDiscordMessages) {
    return { sent: false, error: `Discord messages disabled for ${app.name}` };
  }

  if (signal.data.alert_mode === "ten_percent") {
    console.log("Sending ten percent alert");
    return sendEntryDiscordAlertTenPercent(
      signal,
      app,
      overrideWebhookUrl,
      chartFile,
    );
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
      .updateSignal(signal.id, { data: updatedData as any })
      .catch(() => {});
  }

  // const expendName = app.name === "Discord Scalper" ? "Scalp Trade" : app.name;
  const expendName =
    app.name === "Discord Scalper"
      ? "Scalp Trade"
      : app.name === "TDI Trade"
        ? "Swing Trade"
        : "";

  const dataForTemplate = {
    ...(signal.data as Record<string, any>),
    app_name: expendName || app.name,
  };
  const template = await getRenderedTemplateEmbed(
    dataForTemplate,
    app,
    "signal_alert",
  );
  const embed = template?.embed ?? buildEntryAlertEmbed(signal, expendName);
  const content =
    template?.content ?? getContentForInstrument(app, instrumentType);
  let sent = false;
  let error: string | null = null;
  try {
    sent = await sendWebhook(webhookUrl, content, [embed], false, chartFile);
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
