import type { Signal, ConnectedApp } from "@shared/schema";
import { insertSignalSchema } from "@shared/schema";
import { storage } from "../storage";
import { executeIbkrTrade } from "./trade-executor";
import { sendSignalDiscordAlert } from "./discord";
import { fetchPolygonBars, fetchOptionContractPrice, fetchStockPrice } from "./polygon";

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

const VALID_INSTRUMENT_TYPES = ["Options", "Shares", "LETF"];
const VALID_DIRECTIONS_OPTIONS = ["Call", "Put"];
const VALID_DIRECTIONS_DEFAULT = ["Long", "Short"];
const VALID_TRADE_PLAN_TYPES = ["stock_price_based", "option_price_based"];

/** LETF ticker -> underlying index (for fetching underlying price only; trade plan uses LETF price) */
const LETF_UNDERLYING: Record<string, string> = {
  TQQQ: "QQQ", SQQQ: "QQQ", UPRO: "SPY", SPXU: "SPY", SPXL: "SPY", SPXS: "SPY",
  UDOW: "DIA", SDOW: "DIA", TNA: "IWM", TZA: "IWM", LABU: "XBI", LABD: "XBI",
  HIBL: "XHB", HIBS: "XHB", SOXL: "SOX", SOXS: "SOX", TECL: "XLK", TECS: "XLK",
  FAS: "XLF", FAZ: "XLF", YINN: "FXI", YANG: "FXI", NUGT: "GDX", DUST: "GDX",
  JNUG: "GDXJ", JDST: "GDXJ",
};

const TDI_INSTRUMENT_MAP: Record<string, string> = {
  "SHARES": "Shares",
  "SHARE": "Shares",
  "STOCK": "Shares",
  "STK": "Shares",
  "OPTION": "Options",
  "OPTIONS": "Options",
  "OPT": "Options",
  "LETF": "LETF",
};

const TDI_DIRECTION_MAP: Record<string, string> = {
  "long": "Long",
  "LONG": "Long",
  "short": "Short",
  "SHORT": "Short",
  "call": "Call",
  "CALL": "Call",
  "put": "Put",
  "PUT": "Put",
};

function isTdiFormat(body: Record<string, any>): boolean {
  return !!(
    body.symbol && !body.ticker &&
    (body.entry_price !== undefined || body.stop_price !== undefined || body.strategy_mode || body.timeframe)
  );
}

function transformTdiSignal(body: Record<string, any>): Record<string, any> {
  const rawInstrument = (body.instrument_type || "SHARES").toUpperCase();
  const instrumentType = TDI_INSTRUMENT_MAP[rawInstrument] || "Shares";

  let direction = TDI_DIRECTION_MAP[body.direction] || body.direction || "Long";
  if (instrumentType === "Options" && (direction === "Long" || direction === "Short")) {
    direction = direction === "Long" ? "Call" : "Put";
  }

  const ticker = body.instrument_ticker || body.instrument_symbol || body.symbol;

  const result: Record<string, any> = {
    ticker: ticker.toUpperCase(),
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

  if (instrumentType === "Options") {
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

  if (body.underlying_symbol) result.underlying_symbol = body.underlying_symbol;

  if (body.trade_plan_type) result.trade_plan_type = body.trade_plan_type;
  if (body.auto_track !== undefined) result.auto_track = body.auto_track;

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

  console.log(`[Signal] Transformed TDI signal: ${body.symbol} → ${JSON.stringify(result)}`);
  return result;
}

function parseOptionTicker(opra: string): { expiration: string; strike: string } | null {
  const match = opra.match(/^[A-Z]+(\d{6})([CP])(\d+)$/);
  if (!match) return null;
  const dateStr = match[1];
  const expiration = `20${dateStr.slice(0, 2)}-${dateStr.slice(2, 4)}-${dateStr.slice(4, 6)}`;
  const strike = (parseInt(match[3]) / 1000).toString();
  return { expiration, strike };
}

function validateIngestBody(body: Record<string, any>): string[] {
  const errors: string[] = [];
  const { ticker, instrumentType, direction } = body;

  if (!ticker) {
    errors.push("ticker is required");
  }

  if (!instrumentType || !VALID_INSTRUMENT_TYPES.includes(instrumentType)) {
    errors.push(
      `instrumentType is required and must be one of: ${VALID_INSTRUMENT_TYPES.join(", ")}`,
    );
  }

  const validDirections = instrumentType === "Options" ? VALID_DIRECTIONS_OPTIONS : VALID_DIRECTIONS_DEFAULT;
  if (!direction || !validDirections.includes(direction)) {
    errors.push(
      `direction is required and must be one of: ${validDirections.join(", ")}`,
    );
  }

  if (instrumentType === "Options") {
    if (!body.expiration) errors.push("expiration is required for Options");
    if (!body.strike) errors.push("strike is required for Options");
  }

  if (body.entryPrice != null && (isNaN(Number(body.entryPrice)) || Number(body.entryPrice) <= 0)) {
    errors.push("entryPrice must be a positive number");
  }

  if (body.targets != null) {
    if (typeof body.targets !== "object" || Array.isArray(body.targets)) {
      errors.push("targets must be an object (e.g. { tp1: { price: 100 }, tp2: { price: 110 } })");
    } else {
      for (const [key, val] of Object.entries(body.targets)) {
        const t = val as any;
        if (!t || typeof t !== "object") {
          errors.push(`targets.${key} must be an object with a price field`);
          continue;
        }
        if (t.price == null || isNaN(Number(t.price)) || Number(t.price) <= 0) {
          errors.push(`targets.${key}.price must be a positive number`);
        }
        if (t.take_off_percent == null) {
          errors.push(`targets.${key}.take_off_percent is required`);
        } else if (isNaN(Number(t.take_off_percent)) || Number(t.take_off_percent) <= 0 || Number(t.take_off_percent) > 100) {
          errors.push(`targets.${key}.take_off_percent must be a number between 0 and 100`);
        }
        if (t.raise_stop_loss != null) {
          if (typeof t.raise_stop_loss !== "object") {
            errors.push(`targets.${key}.raise_stop_loss must be an object with a price field`);
          } else if (t.raise_stop_loss.price == null || isNaN(Number(t.raise_stop_loss.price)) || Number(t.raise_stop_loss.price) <= 0) {
            errors.push(`targets.${key}.raise_stop_loss.price must be a positive number`);
          }
        }
      }
    }
  }

  if (body.stop_loss != null && (isNaN(Number(body.stop_loss)) || Number(body.stop_loss) <= 0)) {
    errors.push("stop_loss must be a positive number");
  }

  if (body.time_stop != null) {
    if (typeof body.time_stop !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.time_stop)) {
      errors.push("time_stop must be a date string in YYYY-MM-DD format");
    }
  }

  if (body.trade_plan_type != null && !VALID_TRADE_PLAN_TYPES.includes(body.trade_plan_type)) {
    errors.push(`trade_plan_type must be one of: ${VALID_TRADE_PLAN_TYPES.join(", ")}`);
  }

  if (body.auto_track != null && typeof body.auto_track !== "boolean") {
    errors.push("auto_track must be a boolean (true or false)");
  }

  return errors;
}

async function buildSignalData(body: Record<string, any>): Promise<{ data: Record<string, any>; errors: string[] }> {
  const {
    ticker,
    instrumentType,
    direction,
    entryPrice,
    expiration,
    strike,
    targets,
    stop_loss,
    time_stop,
    trade_plan_type,
    auto_track,
  } = body;

  const errors: string[] = [];

  const signalDataObj: Record<string, any> = {
    ticker,
    instrument_type: instrumentType,
    direction,
    entry_price: entryPrice ? Number(entryPrice) : null,
  };

  if (instrumentType === "Options") {
    signalDataObj.expiration = expiration;
    signalDataObj.strike = strike;

    const right = direction === "Put" ? "P" : "C";

    try {
      const contractResult = await fetchOptionContractPrice(
        ticker,
        expiration,
        Number(strike),
        right,
      );

      if (!contractResult.exists) {
        errors.push(`Option contract not found: ${ticker} ${expiration} ${strike} ${direction}`);
      } else if (contractResult.price !== null) {
        if (!signalDataObj.entry_price) {
          signalDataObj.entry_price = contractResult.price;
          console.log(`[Signal] Auto-filled entryPrice from Polygon: $${contractResult.price} for ${ticker} ${expiration} ${strike} ${direction}`);
        }
      }
    } catch (err: any) {
      console.warn(`[Signal] Failed to verify option contract: ${err.message}`);
    }
  }

  try {
    if (instrumentType === "Options") {
      const stockPrice = await fetchStockPrice(ticker);
      if (stockPrice !== null) {
        signalDataObj.entry_underlying_price = stockPrice;
        console.log(`[Signal] Fetched underlying stock price from Polygon: $${stockPrice} for ${ticker}`);
      }
    } else if (instrumentType === "LETF") {
      const underlyingSymbol = LETF_UNDERLYING[(ticker || "").toUpperCase().trim()];
      if (underlyingSymbol) {
        const underlyingPrice = await fetchStockPrice(underlyingSymbol);
        if (underlyingPrice !== null) {
          signalDataObj.entry_underlying_price = underlyingPrice;
          console.log(`[Signal] Fetched underlying index price from Polygon: $${underlyingPrice} for ${ticker} (${underlyingSymbol})`);
        }
      }
    } else {
      const stockPrice = await fetchStockPrice(ticker);
      if (stockPrice !== null) {
        signalDataObj.entry_underlying_price = stockPrice;
        console.log(`[Signal] Fetched stock price from Polygon: $${stockPrice} for ${ticker}`);
      }
    }
  } catch (err: any) {
    console.warn(`[Signal] Failed to fetch underlying price: ${err.message}`);
  }

  if (targets && typeof targets === "object") {
    signalDataObj.targets = targets;
  }

  if (stop_loss !== undefined && stop_loss !== null) {
    signalDataObj.stop_loss = stop_loss;
  }

  if (time_stop) {
    signalDataObj.time_stop = time_stop;
  }

  signalDataObj.trade_plan_type =
    trade_plan_type ??
    (instrumentType === "Options" ? "option_price_based" : "stock_price_based");
  signalDataObj.auto_track = auto_track !== undefined ? auto_track : true;

  if (body.tdi_metadata) {
    signalDataObj.tdi_metadata = body.tdi_metadata;
  }

  if (body.underlying_symbol) {
    signalDataObj.underlying_symbol = body.underlying_symbol;
  }

  return { data: signalDataObj, errors };
}

export async function processSignal(
  body: Record<string, any>,
  app: ConnectedApp,
): Promise<ProcessResult> {
  const result: ProcessResult = {
    signal: null,
    discord: { sent: false, errors: [] },
    ibkr: { executed: false, tradeResult: null, errors: [] },
    validationErrors: [],
  };

  let normalizedBody = body;
  if (isTdiFormat(body)) {
    console.log(`[Signal] Detected TDI format from ${app.name}, transforming...`);
    normalizedBody = transformTdiSignal(body);
  }

  const validationErrors = validateIngestBody(normalizedBody);
  if (validationErrors.length > 0) {
    result.validationErrors = validationErrors;
    const ticker = normalizedBody.ticker || normalizedBody.symbol || "unknown";
    storage.createActivity({
      type: "signal_rejected",
      title: `Signal rejected from ${app.name}: ${ticker}`,
      description: `Validation failed: ${validationErrors.join("; ")}`,
      symbol: ticker,
      signalId: null,
      metadata: { sourceApp: app.name, sourceAppId: app.id, errors: validationErrors, rawSignal: body },
    }).catch(() => {});
    return result;
  }

  const buildResult = await buildSignalData(normalizedBody);
  const signalDataObj = buildResult.data;

  if (buildResult.errors.length > 0) {
    result.validationErrors = buildResult.errors;
    const ticker = normalizedBody.ticker || normalizedBody.symbol || "unknown";
    storage.createActivity({
      type: "signal_rejected",
      title: `Signal rejected from ${app.name}: ${ticker}`,
      description: `Build failed: ${buildResult.errors.join("; ")}`,
      symbol: ticker,
      signalId: null,
      metadata: { sourceApp: app.name, sourceAppId: app.id, errors: buildResult.errors, rawSignal: body },
    }).catch(() => {});
    return result;
  }

  const { ticker, instrument_type: instrumentType, direction, expiration, strike } = signalDataObj;
  const sourceName = app.name;
  const sourceId = app.id;

  const signalPayload = {
    data: signalDataObj,
    discordChannelId: body.discordChannelId || null,
    status: "active",
    sourceAppId: sourceId,
    sourceAppName: sourceName,
  };

  const parsed = insertSignalSchema.parse(signalPayload);
  const signal = await storage.createSignal(parsed);
  result.signal = signal;

  storage.updateConnectedApp(app.id, { lastSyncAt: new Date() } as any).catch(() => {});

  storage.createActivity({
    type: "signal_ingested",
    title: `Signal from ${sourceName}: ${ticker} ${direction}`,
    description: `${instrumentType} signal for ${ticker} (${direction})`,
    symbol: ticker,
    signalId: signal.id,
    metadata: { sourceApp: sourceName, sourceAppId: sourceId },
  }).catch(() => {});

  if (instrumentType === "Options" && strike && expiration) {
    const right = direction === "Put" ? "P" : "C";
    fetchPolygonBars({ symbol: ticker, secType: "STK" }).catch(() => {});
    fetchPolygonBars({
      symbol: ticker,
      secType: "OPT",
      strike: Number(strike),
      expiration,
      right,
    }).catch(() => {});
  } else {
    fetchPolygonBars({ symbol: ticker, secType: "STK" }).catch(() => {});
  }

  const discordResult = await sendSignalDiscordAlert(signal, app);
  result.discord.sent = discordResult.sent;
  if (discordResult.error) {
    result.discord.errors.push(discordResult.error);
  }

  const tradeExecution = await executeIbkrTrade(signal, app);
  result.ibkr.executed = tradeExecution.executed;
  result.ibkr.tradeResult = tradeExecution.trade;
  if (tradeExecution.error) {
    result.ibkr.errors.push(tradeExecution.error);
  }

  if (tradeExecution.executed && tradeExecution.trade) {
    const t = tradeExecution.trade;
    console.log(`[Signal] IBKR entry order SUCCESS: ${t.side} ${t.quantity} ${t.symbol} | status=${t.status} | orderId=${t.orderId}`);
  } else if (tradeExecution.error) {
    console.error(`[Signal] IBKR trade FAILED for ${ticker}: ${tradeExecution.error}`);
  }

  return result;
}
