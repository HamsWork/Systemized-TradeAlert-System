import type { Signal, ConnectedApp } from "@shared/schema";
import { insertSignalSchema } from "@shared/schema";
import { storage } from "../storage";
import { executeIbkrTrade } from "./trade-executor";
import { sendSignalDiscordAlert } from "./discord";
import { fetchPolygonBars } from "./polygon";

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

  return errors;
}

function buildSignalData(body: Record<string, any>): Record<string, any> {
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

  const signalDataObj: Record<string, any> = {
    ticker,
    instrument_type: instrumentType,
    direction,
    entry_price: entryPrice || null,
  };

  if (instrumentType === "Options") {
    signalDataObj.expiration = expiration;
    signalDataObj.strike = strike;
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

  if (body.expiration) {
    signalDataObj.expiration = body.expiration;
  }

  if (body.right) {
    signalDataObj.right = body.right;
  }

  return signalDataObj;
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

  const signalDataObj = buildSignalData(body);
  const { ticker, instrumentType, direction, expiration, strike } =
    signalDataObj;

  const sourceName = app.name;
  const sourceId = app.id;

  const signalPayload = {
    data: signalDataObj,
    discordChannelId: signalData.discordChannelId || null,
    status: "active",
    sourceAppId: sourceId,
    sourceAppName: sourceName,
  };

  const parsed = insertSignalSchema.parse(signalPayload);
  const signal = await storage.createSignal(parsed);
  result.signal = signal;

  await storage.updateConnectedApp(app.id, { lastSyncAt: new Date() } as any);

  await storage.createActivity({
    type: "signal_ingested",
    title: `Signal from ${sourceName}: ${ticker} ${direction}`,
    description: `${instrumentType} signal for ${ticker} (${direction})`,
    symbol: ticker,
    signalId: signal.id,
    metadata: { sourceApp: sourceName, sourceAppId: sourceId },
  });

  fetchPolygonBars({ symbol: ticker, secType: "STK" }).catch(() => {});
  if (instrumentType === "Options" && strike && expiration) {
    const right = signalData.optionType?.toUpperCase().startsWith("P")
      ? "P"
      : "C";
    fetchPolygonBars({
      symbol: ticker,
      secType: "OPT",
      strike: Number(strike),
      expiration,
      right,
    }).catch(() => {});
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
