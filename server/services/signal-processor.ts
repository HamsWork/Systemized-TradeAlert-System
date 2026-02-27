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
const VALID_DIRECTIONS = ["Long", "Short"];

function validateAndBuildSignalData(input: Record<string, any>): {
  updatedSignalData: Record<string, any> | null;
  validationErrors: string[];
} {
  const errors: string[] = [];
  const { ticker, instrumentType, direction, entryPrice, expiration, strike, targets, stop_loss, time_stop } = input;

  if (!ticker) {
    errors.push("ticker is required");
  }

  if (!instrumentType || !VALID_INSTRUMENT_TYPES.includes(instrumentType)) {
    errors.push(`instrumentType is required and must be one of: ${VALID_INSTRUMENT_TYPES.join(", ")}`);
  }

  if (!direction || !VALID_DIRECTIONS.includes(direction)) {
    errors.push(`direction is required and must be one of: ${VALID_DIRECTIONS.join(", ")}`);
  }

  if (instrumentType === "Options") {
    if (!expiration) errors.push("expiration is required for Options");
    if (!strike) errors.push("strike is required for Options");
  }

  if (errors.length > 0) {
    return { updatedSignalData: null, validationErrors: errors };
  }

  const updatedSignalData: Record<string, any> = {
    ticker,
    instrument_type: instrumentType,
    direction,
    entry_price: entryPrice || null,
  };

  if (instrumentType === "Options") {
    updatedSignalData.expiration = expiration;
    updatedSignalData.strike = strike;
  }

  if (targets && typeof targets === "object") {
    updatedSignalData.targets = targets;
  }

  if (stop_loss !== undefined && stop_loss !== null) {
    updatedSignalData.stop_loss = stop_loss;
  }

  if (time_stop) {
    updatedSignalData.time_stop = time_stop;
  }

  if (input.expiration) {
    updatedSignalData.expiration = input.expiration;
  }

  if (input.right) {
    updatedSignalData.right = input.right;
  }

  return { updatedSignalData, validationErrors: [] };
}

export async function processSignal(
  signalData: Record<string, any>,
  app: ConnectedApp | null,
): Promise<ProcessResult> {
  const result: ProcessResult = {
    signal: null,
    discord: { sent: false, errors: [] },
    ibkr: { executed: false, tradeResult: null, errors: [] },
    validationErrors: [],
  };

  const { updatedSignalData, validationErrors } = validateAndBuildSignalData(signalData);
  if (validationErrors.length > 0) {
    result.validationErrors = validationErrors;
    return result;
  }

  const { ticker, instrumentType, direction, expiration, strike } = signalData;

  const sourceName = app ? app.name : "Manual";
  const sourceId = app ? app.id : null;

  const signalPayload = {
    data: updatedSignalData!,
    discordChannelId: signalData.discordChannelId || null,
    status: "active",
    sourceAppId: sourceId,
    sourceAppName: sourceName,
  };

  const parsed = insertSignalSchema.parse(signalPayload);
  const signal = await storage.createSignal(parsed);
  result.signal = signal;

  if (app) {
    await storage.updateConnectedApp(app.id, { lastSyncAt: new Date() } as any);
  }

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
    const right = signalData.optionType?.toUpperCase().startsWith("P") ? "P" : "C";
    fetchPolygonBars({ symbol: ticker, secType: "OPT", strike: Number(strike), expiration, right }).catch(() => {});
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
