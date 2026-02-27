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
    const stockPrice = await fetchStockPrice(ticker);
    if (stockPrice !== null) {
      signalDataObj.entry_underlying_price = stockPrice;
      console.log(`[Signal] Fetched underlying price from Polygon: $${stockPrice} for ${ticker}`);
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

  const validationErrors = validateIngestBody(body);
  if (validationErrors.length > 0) {
    result.validationErrors = validationErrors;
    return result;
  }

  const buildResult = await buildSignalData(body);
  const signalDataObj = buildResult.data;

  if (buildResult.errors.length > 0) {
    result.validationErrors = buildResult.errors;
    return result;
  }

  const ticker = signalDataObj.ticker;
  const instrumentType = signalDataObj.instrument_type;
  const direction = signalDataObj.direction;
  const expiration = signalDataObj.expiration;
  const strike = signalDataObj.strike;

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

  return result;
}
