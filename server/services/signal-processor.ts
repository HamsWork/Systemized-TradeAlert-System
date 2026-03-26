import type {
  Signal,
  StoredSignalData,
  SignalTargetEntry,
  ConnectedApp,
} from "@shared/schema";
import { insertSignalSchema, ingestSignalBodySchema } from "@shared/schema";
import { storage } from "../storage";
import { getLETFLeverage, getLETFUnderlying } from "../constants/letf";
import { executeIbkrTrade } from "./trade-executor";
import { sendEntryDicordAlert, profitPctFromInstrument } from "./discord";
import { getCurrentInstrumentPrice } from "./trade-monitor";
import { ibkrSyncManager } from "./ibkr-sync";
import { queueIbkrRetry } from "./ibkr-retry-queue";
import {
  fetchPolygonBars,
  fetchOptionContractPrice,
  fetchStockPrice,
} from "./polygon";

interface ProcessResult {
  signal: Signal | null;
  discord: {
    sent: boolean;
    errors: string[];
  };
  ibkr: {
    executed: boolean;
    tradeResult: {
      orderId: number;
      status: string;
      symbol: string;
      side: string;
      quantity: number;
    } | null;
    errors: string[];
  };
  validationErrors: string[];
}

const TDI_INSTRUMENT_MAP: Record<string, string> = {
  SHARES: "Shares",
  SHARE: "Shares",
  STOCK: "Shares",
  STK: "Shares",
  OPTION: "Options",
  OPTIONS: "Options",
  OPT: "Options",
  LETF: "LETF",
  LETF_OPTION: "LETF Option",
  LETF_OPT: "LETF Option",
  LETFOPTION: "LETF Option",
  CRYPTO: "Crypto",
  COIN: "Crypto",
};

const TDI_DIRECTION_MAP: Record<string, string> = {
  long: "Long",
  LONG: "Long",
  short: "Short",
  SHORT: "Short",
  call: "Call",
  CALL: "Call",
  put: "Put",
  PUT: "Put",
};

const INGEST_INSTRUMENT_ENUM = [
  "Options",
  "Shares",
  "LETF",
  "LETF Option",
  "Crypto",
] as const;

function isTdiFormat(body: Record<string, any>): boolean {
  return !!(
    body.symbol &&
    !body.ticker &&
    (body.entry_price !== undefined ||
      body.stop_price !== undefined ||
      body.strategy_mode ||
      body.timeframe)
  );
}

function transformTdiSignal(body: Record<string, any>): Record<string, any> {
  const rawInstrument = (body.instrument_type || "SHARES").toUpperCase();
  const instrumentType = TDI_INSTRUMENT_MAP[rawInstrument] || "Shares";

  let direction = TDI_DIRECTION_MAP[body.direction] || body.direction || "Long";
  if (
    (instrumentType === "Options" || instrumentType === "LETF Option") &&
    (direction === "Long" || direction === "Short")
  ) {
    direction = direction === "Long" ? "Call" : "Put";
  }

  const tickerRaw =
    body.instrument_ticker || body.instrument_symbol || body.symbol;
  const ticker =
    tickerRaw != null && typeof tickerRaw === "string"
      ? tickerRaw.toUpperCase()
      : "";

  const result: Record<string, any> = {
    ticker,
    instrumentType,
    direction,
  };

  if (body.entry_price != null) result.entryPrice = Number(body.entry_price);
  if (body.stop_price != null) result.stop_loss = Number(body.stop_price);

  const targets: Record<string, any> = {};
  if (body.target_2r != null && Number(body.target_2r) > 0) {
    targets.tp1 = { price: Number(body.target_2r), take_off_percent: 50 };
    if (body.entry_price != null) {
      targets.tp1.raise_stop_loss = { price: Number(body.entry_price) };
    }
  }
  if (body.target_3r != null && Number(body.target_3r) > 0) {
    targets.tp2 = { price: Number(body.target_3r), take_off_percent: 50 };
  }
  if (body.tp1_price != null && Number(body.tp1_price) > 0) {
    targets.tp1 = targets.tp1 || {};
    targets.tp1.price = Number(body.tp1_price);
    targets.tp1.take_off_percent = targets.tp1.take_off_percent || 50;
  }
  if (body.tp2_price != null && Number(body.tp2_price) > 0) {
    targets.tp2 = targets.tp2 || {};
    targets.tp2.price = Number(body.tp2_price);
    targets.tp2.take_off_percent = targets.tp2.take_off_percent || 50;
  }
  if (Object.keys(targets).length > 0) result.targets = targets;

  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    if (body.expiration) result.expiration = body.expiration;
    if (body.strike) result.strike = body.strike;

    if (!result.expiration && body.option_contract_ticker) {
      const parsed = parseOptionTicker(body.option_contract_ticker);
      if (parsed) {
        result.expiration = parsed.expiration;
        result.strike = parsed.strike;
        if (!result.ticker || result.ticker === body.symbol?.toUpperCase()) {
          result.ticker = body.symbol?.toUpperCase() || ticker.toUpperCase();
        }
      }
    }
  }

  if (body.underlying_symbol) result.underlying_ticker = body.underlying_symbol;
  if (body.leverage) result.leverage = body.leverage;

  if (body.auto_track !== undefined) result.auto_track = body.auto_track;
  if (body.underlying_price_based !== undefined)
    result.underlying_price_based = body.underlying_price_based;

  result.tdi_metadata = {
    strategy_mode: body.strategy_mode || null,
    timeframe: body.timeframe || null,
    quality_grade: body.quality_grade || null,
    quality_score: body.quality_score ?? null,
    alert_date: body.alert_date || null,
    source_signal_id: body.source_signal_id ?? body.id ?? null,
    risk: body.risk ?? null,
    quantity: body.quantity ?? null,
  };

  console.log(
    `[Signal] Transformed TDI signal: ${body.symbol} → ${JSON.stringify(result)}`,
  );
  return result;
}

/** TDI transform (if detected) + camelCase/enum normalization for ingest schema. */ //TODO should remove later
function normalizeBodyForIngest(
  body: Record<string, any>,
  appName?: string,
): Record<string, any> {
  let out: Record<string, any> = body;
  if (isTdiFormat(body)) {
    if (appName) {
      console.log(
        `[Signal] Detected TDI format from ${appName}, transforming...`,
      );
    }
    out = transformTdiSignal(body);
  }
  out = { ...out };
  if (out.instrumentType == null && out.instrument_type != null) {
    out.instrumentType = out.instrument_type;
  }
  if (out.entryPrice == null && out.entry_price != null) {
    out.entryPrice = out.entry_price;
  }
  if (out.tradeType == null && out.trade_type != null) {
    out.tradeType = out.trade_type;
  }
  const raw = out.instrumentType ?? out.instrument_type ?? "";
  const s = String(raw).trim();
  if (s) {
    const upperKey = s.toUpperCase().replace(/\s+/g, "_");
    const mapped =
      TDI_INSTRUMENT_MAP[upperKey] ??
      (INGEST_INSTRUMENT_ENUM.includes(
        s as (typeof INGEST_INSTRUMENT_ENUM)[number],
      )
        ? s
        : "Shares");
    out.instrumentType = mapped;
  }
  return out;
}

function parseOptionTicker(
  opra: string,
): { expiration: string; strike: string } | null {
  const match = opra.match(/^[A-Z]+(\d{6})([CP])(\d+)$/);
  if (!match) return null;
  const dateStr = match[1];
  const expiration = `20${dateStr.slice(0, 2)}-${dateStr.slice(2, 4)}-${dateStr.slice(4, 6)}`;
  const strike = (parseInt(match[3]) / 1000).toString();
  return { expiration, strike };
}

/** Normalize raw targets to Record<string, SignalTargetEntry>; compute percentage when underlying_price_based is false. */
function normalizeTargets(
  targets: Record<string, unknown>,
  options: {
    underlying_price_based?: boolean;
    entryPrice: unknown;
    direction: string;
  },
): Record<string, SignalTargetEntry> {
  const underlyingPriceBased =
    options.underlying_price_based !== undefined
      ? options.underlying_price_based
      : false;
  const entryPriceNum =
    options.entryPrice != null && options.entryPrice !== ""
      ? Number(options.entryPrice)
      : NaN;
  const isBullish =
    options.direction !== "Short" && options.direction !== "Put";

  const normalizedTargets: Record<string, SignalTargetEntry> = {};
  for (const [key, val] of Object.entries(targets)) {
    if (val == null || typeof val !== "object") continue;
    const t = val as Record<string, unknown>;
    const entry: SignalTargetEntry = {};
    if (t.price != null && t.price !== "") {
      const n = Number(t.price);
      if (!Number.isNaN(n)) entry.price = n;
    }
    if (t.percentage != null && t.percentage !== "") {
      const n = Number(t.percentage);
      if (!Number.isNaN(n)) entry.percentage = n;
    }
    if (
      !underlyingPriceBased &&
      entry.percentage == null &&
      entry.price != null &&
      !Number.isNaN(entryPriceNum) &&
      entryPriceNum > 0
    ) {
      const pct = isBullish
        ? ((entry.price - entryPriceNum) / entryPriceNum) * 100
        : ((entryPriceNum - entry.price) / entryPriceNum) * 100;
      entry.percentage = Math.round(pct * 10) / 10;
    }
    if (t.take_off_percent != null && t.take_off_percent !== "") {
      const n = Number(t.take_off_percent);
      if (!Number.isNaN(n)) entry.take_off_percent = n;
    }
    if (t.raise_stop_loss != null && typeof t.raise_stop_loss === "object") {
      const rsl = t.raise_stop_loss as Record<string, unknown>;
      entry.raise_stop_loss = {};
      if (rsl.price != null && rsl.price !== "") {
        const n = Number(rsl.price);
        if (!Number.isNaN(n)) entry.raise_stop_loss!.price = n;
      }
      if (rsl.percentage != null && rsl.percentage !== "") {
        const n = Number(rsl.percentage);
        if (!Number.isNaN(n)) entry.raise_stop_loss!.percentage = n;
      }
      if (Object.keys(entry.raise_stop_loss).length === 0) {
        delete entry.raise_stop_loss;
      }
    }
    if (Object.keys(entry).length > 0) normalizedTargets[key] = entry;
  }
  return normalizedTargets;
}

async function buildSignalData(
  body: Record<string, any>,
  app: ConnectedApp,
): Promise<{ data: StoredSignalData; errors: string[] }> {
  const {
    ticker,
    instrumentType,
    direction,
    entryPrice,
    expiration,
    strike,
    targets,
    stop_loss,
    stop_loss_percentage,
    time_stop,
    auto_track,
    underlying_price_based,
  } = body;

  

  const errors: string[] = [];

  const defaultTradeType =
    app?.slug === "tdi-core-scanner" || app?.slug === "situ-trader"
      ? "Swing"
      : "Scalp";

  const signalData: StoredSignalData = {
    ticker,
    instrument_type: instrumentType,
    direction,
    entry_price: entryPrice != null ? Number(entryPrice) : 0.0,
    underlying_ticker: ticker,
    trade_type: body.tradeType
      ? body.tradeType.charAt(0).toUpperCase() +
        body.tradeType.slice(1).toLowerCase()
      : defaultTradeType,
  };

  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    signalData.expiration = expiration;
    signalData.strike = strike;
    signalData.right = direction === "Put" ? "P" : "C";
  }

  if (instrumentType === "LETF" || instrumentType === "LETF Option") {
    signalData.underlying_ticker =
      body.underlying_ticker ?? (await getLETFUnderlying(ticker)) ?? ticker;
    signalData.leverage = body.leverage ?? getLETFLeverage(ticker);

    const dirText =
      direction === "Short" || direction === "Put" ? "BEAR" : "BULL";

    signalData.leverage_direction = dirText;
  }

  if (targets && typeof targets === "object" && !Array.isArray(targets)) {
    signalData.targets = normalizeTargets(targets, {
      underlying_price_based,
      entryPrice,
      direction,
    });
  }

  if (stop_loss !== undefined && stop_loss !== null) {
    const stopLossNum = Number(stop_loss);
    signalData.stop_loss = Number.isNaN(stopLossNum)
      ? Number(stop_loss)
      : stopLossNum;
    signalData.current_stop_loss = signalData.stop_loss;
    const stopLossPercentageNum = Number(stop_loss_percentage);
    if (!Number.isNaN(stopLossPercentageNum)) {
      signalData.stop_loss_percentage = stopLossPercentageNum;
      signalData.current_stop_loss_percent = signalData.stop_loss_percentage;
    } else {
      const entryNum =
        entryPrice != null && entryPrice !== "" ? Number(entryPrice) : NaN;
      if (
        !Number.isNaN(entryNum) &&
        entryNum > 0 &&
        typeof signalData.current_stop_loss === "number" &&
        !Number.isNaN(signalData.current_stop_loss)
      ) {
        const slPct = profitPctFromInstrument(
          entryNum,
          signalData.current_stop_loss,
          instrumentType,
          direction,
        );
        signalData.stop_loss_percentage = Math.round(slPct * 10) / 10;
        signalData.current_stop_loss_percent = signalData.stop_loss_percentage;
      }
    }
  }

  if (time_stop) {
    signalData.time_stop = time_stop;
  }

  signalData.auto_track =
    auto_track !== undefined && auto_track !== null ? auto_track : true;

  const webhookFromBody =
    typeof body.discord_webhook_url === "string"
      ? body.discord_webhook_url.trim() || null
      : null;
  if (webhookFromBody) signalData.discord_webhook_url = webhookFromBody;

  const alertMode = body.alert_mode ?? "normal";
  const underlyingPriceBased =
    alertMode === "ten_percent" ? false
    : underlying_price_based !== undefined ? underlying_price_based : false;
  signalData.underlying_price_based = underlyingPriceBased;

  if (underlyingPriceBased) {
    const t0 = Date.now();
    const instrumentPrice = await getCurrentInstrumentPrice(signalData, ticker);
    const instrMs = Date.now() - t0;
    console.log(
      `[Signal][Timing] fetchInstrumentPrice(${ticker}) took ${instrMs}ms → ${instrumentPrice}`,
    );
    if (instrumentPrice != null && instrumentPrice > 0) {
      signalData.entry_instrument_price = instrumentPrice;
    } else {
      console.warn(
        `[Signal] Could not fetch instrument price for ${ticker} , proceeding without it`,
      );
      errors.push("Instrument price Error");
    }
    signalData.entry_tracking_price = entryPrice ?? null;
    signalData.entry_underlying_price = entryPrice ?? null;
  } else {
    const symbolForPrice = signalData.underlying_ticker ?? ticker;
    if (!symbolForPrice || typeof symbolForPrice !== "string") {
      errors.push("Ticker is required for Shares");
    } else {
      const t0 = Date.now();
      const underlyingPrice = await fetchStockPrice(symbolForPrice);
      const stockMs = Date.now() - t0;
      console.log(
        `[Signal][Timing] fetchStockPrice(${symbolForPrice}) took ${stockMs}ms → ${underlyingPrice}`,
      );
      if (underlyingPrice == null || underlyingPrice <= 0) {
        errors.push("Underlying price Error");
      } else {
        signalData.entry_underlying_price = underlyingPrice;
      }
    }
    signalData.entry_tracking_price = entryPrice ?? null;
    signalData.entry_instrument_price = entryPrice ?? null;
  }

  if (instrumentType === "LETF Option") {
    const t0 = Date.now();
    signalData.entry_letf_price =
      (await fetchStockPrice(signalData.ticker)) ?? null;
    console.log(
      `[Signal][Timing] fetchLETFPrice(${signalData.ticker}) took ${Date.now() - t0}ms → ${signalData.entry_letf_price}`,
    );
  }

  signalData.alert_mode = alertMode;

  signalData.hit_targets = {};
  signalData.current_target_number = 0;
  signalData.current_tp_number = 0;
  signalData.remain_quantity = 100;

  signalData.status = "submitted";

  return { data: signalData, errors };
}

export interface ChartFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

function getAppBuyingPowerLimit(app: ConnectedApp): number {
  const appAny = app as any;
  const raw =
    appAny.buyingPowerLimit ??
    appAny.buying_power_limit ??
    appAny.buyingPowerLimitPct ??
    appAny.buying_power_limit_pct ??
    appAny.positionLimit ??
    appAny.position_limit ??
    1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  // Support both ratio (0..1) and percent-style (1..100).
  return n > 1 ? n / 100 : n;
}

function getEntryPriceForSizing(signalData: StoredSignalData): number {
  const p =
    signalData.entry_instrument_price ??
    signalData.entry_price ??
    signalData.entry_tracking_price ??
    null;
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function processSignal(
  body: Record<string, any>,
  app: ConnectedApp,
  chartFile?: ChartFile | null,
): Promise<ProcessResult> {
  const result: ProcessResult = {
    signal: null,
    discord: { sent: false, errors: [] },
    ibkr: { executed: false, tradeResult: null, errors: [] },
    validationErrors: [],
  };

  const totalT0 = Date.now();
  console.log(`[Signal] Processing signal for ${body.ticker}`, body);
  const normalizedBody = normalizeBodyForIngest(body, app.name);

  console.log(`[Signal] Normalized body for ${body.ticker}`, normalizedBody);

  const ingestParsed = ingestSignalBodySchema.safeParse(normalizedBody);
  if (!ingestParsed.success) {
    const validationErrors = ingestParsed.error.issues.map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    );
    result.validationErrors = validationErrors;
    const ticker = normalizedBody.ticker || normalizedBody.symbol || "unknown";
    storage
      .createActivity({
        type: "signal_rejected",
        title: `Signal rejected from ${app.name}: ${ticker}`,
        description: `Validation failed: ${validationErrors.join("; ")}`,
        symbol: ticker,
        signalId: null,
        metadata: {
          sourceApp: app.name,
          sourceAppId: app.id,
          errors: validationErrors,
          rawSignal: body,
        },
      })
      .catch(() => {});
    return result;
  }
  const validatedBody = ingestParsed.data;

  console.log(`[Signal] Validated body for ${body.ticker}`, validatedBody);

  const buildT0 = Date.now();
  const buildResult = await buildSignalData(validatedBody, app);

  const signalData = buildResult.data;

  if (buildResult.errors.length > 0) {
    result.validationErrors = buildResult.errors;
    const ticker = validatedBody.ticker || "unknown";
    storage
      .createActivity({
        type: "signal_rejected",
        title: `Signal rejected from ${app.name}: ${ticker}`,
        description: `Build failed: ${buildResult.errors.join("; ")}`,
        symbol: ticker,
        signalId: null,
        metadata: {
          sourceApp: app.name,
          sourceAppId: app.id,
          errors: buildResult.errors,
          rawSignal: body,
        },
      })
      .catch(() => {});
    return result;
  }

  const buildMs = Date.now() - buildT0;
  console.log(
    `[Signal][Timing] buildSignalData(${validatedBody.ticker}) took ${buildMs}ms`,
  );

  const {
    ticker,
    instrument_type: instrumentType,
    direction,
    expiration,
    strike,
  } = signalData;
  const sourceName = app.name;
  const sourceId = app.id;

  const signalPayload = {
    data: signalData,
    status: "active",
    sourceAppId: sourceId,
    sourceAppName: sourceName,
  };

  const insertParsed = insertSignalSchema.parse(signalPayload);
  const signal = await storage.createSignal(insertParsed);
  result.signal = signal;

  storage
    .updateConnectedApp(app.id, { lastSyncAt: new Date() } as any)
    .catch(() => {});

  storage
    .createActivity({
      type: "signal_ingested",
      title: `Signal from ${sourceName}: ${ticker} ${direction}`,
      description: `${instrumentType} signal for ${ticker} (${direction})`,
      symbol: ticker,
      signalId: signal.id,
      metadata: {
        sourceApp: sourceName,
        sourceAppId: sourceId,
        rawSignal: body,
      },
    })
    .catch(() => {});

  if (
    (instrumentType === "Options" || instrumentType === "LETF Option") &&
    strike &&
    expiration
  ) {
    const right = direction === "Put" ? "P" : "C";
    fetchPolygonBars({ symbol: ticker, secType: "STK" }).catch(() => {});
    fetchPolygonBars({
      symbol: ticker,
      secType: "OPT",
      strike: Number(strike),
      expiration,
      right,
    }).catch(() => {});
  } else if (instrumentType === "Crypto") {
    // No Polygon chart prefetch for Crypto
  } else {
    fetchPolygonBars({ symbol: ticker, secType: "STK" }).catch(() => {});
  }

  const ibkrT0 = Date.now();
  const entryPriceForSizing = getEntryPriceForSizing(signalData);
  const appLimitRatio = getAppBuyingPowerLimit(app);
  const accountSummaries = ibkrSyncManager.getAccountSummary();
  const buyingPower = accountSummaries.find((a) => (a.buyingPower ?? 0) > 0)?.buyingPower ?? 0;
  const maxNotional = Math.min(3000, buyingPower * appLimitRatio);
  const computedQty =
    entryPriceForSizing > 0 && maxNotional > 0
      ? Math.max(1, Math.floor(maxNotional / entryPriceForSizing))
      : 1;
  const tradeExecution = await executeIbkrTrade(signal, app, computedQty);
  const ibkrMs = Date.now() - ibkrT0;
  console.log(`[Signal][Timing] executeIbkrTrade(${ticker}) took ${ibkrMs}ms`);
  result.ibkr.executed = tradeExecution.executed;
  result.ibkr.tradeResult = tradeExecution.trade;
  if (tradeExecution.error) {
    result.ibkr.errors.push(tradeExecution.error);
  }

  if (tradeExecution.executed && tradeExecution.trade) {
    const t = tradeExecution.trade;
    console.log(
      `[Signal] IBKR entry order SUCCESS: ${t.side} ${t.quantity} ${t.symbol} | status=${t.status} | orderId=${t.orderId}`,
    );
    if (t.avgFillPrice && t.avgFillPrice > 0) {
      const prevEntry = signalData.entry_instrument_price;
      signalData.ibkr_fill_price = t.avgFillPrice;
      signalData.entry_instrument_price = t.avgFillPrice;
      console.log(
        `[Signal] Saved IBKR fill price $${t.avgFillPrice} to signal (was Polygon $${prevEntry})`,
      );
      await storage.updateSignal(signal.id, { data: signalData });
    }
  } else if (tradeExecution.error) {
    console.error(
      `[Signal] IBKR trade FAILED for ${ticker}: ${tradeExecution.error}`,
    );
    const isConnectionError =
      tradeExecution.error.includes("Failed to connect") ||
      tradeExecution.error.includes("ECONNREFUSED") ||
      tradeExecution.error.includes("timeout") ||
      tradeExecution.error.includes("socket");
    if (isConnectionError && signal.id && app.id) {
      queueIbkrRetry(signal.id, app.id, computedQty, tradeExecution.error);
    }
  }

  const updatedSignal = { ...signal, data: signalData };

  const discordWebhookUrl =
    signalData.discord_webhook_url ??
    (typeof body.discord_webhook_url === "string"
      ? body.discord_webhook_url.trim() || null
      : null) ??
    (typeof body.discord_channel_webhook === "string"
      ? body.discord_channel_webhook.trim() || null
      : null);
  console.log(
    `[Signal] Sending discord alert to ${discordWebhookUrl ?? "(app default)"} for ${ticker}`,
  );
  const discordT0 = Date.now();
  const discordResult = await sendEntryDicordAlert(
    updatedSignal,
    app,
    discordWebhookUrl,
    chartFile ?? null,
  );
  const discordMs = Date.now() - discordT0;
  console.log(
    `[Signal][Timing] sendEntryDiscordAlert(${ticker}) took ${discordMs}ms`,
  );
  result.discord.sent = discordResult.sent;
  if (discordResult.error) {
    result.discord.errors.push(discordResult.error);
  }

  const totalMs = Date.now() - totalT0;
  console.log(
    `[Signal][Timing] TOTAL processSignal(${ticker}) took ${totalMs}ms (build=${buildMs}ms, ibkr=${ibkrMs}ms, discord=${discordMs}ms)`,
  );
  return result;
}
