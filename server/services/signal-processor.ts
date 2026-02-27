import type { Signal, ConnectedApp } from "@shared/schema";
import { executeIbkrTrade } from "./trade-executor";
import { sendSignalDiscordAlert } from "./discord";

interface ProcessResult {
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
}

const VALID_INSTRUMENT_TYPES = ["Options", "Shares", "LETF"];
const VALID_DIRECTIONS = ["Long", "Short"];

function validateSignal(signal: Signal): string[] {
  const errors: string[] = [];
  const data = signal.data as Record<string, any>;

  if (!data.ticker) {
    errors.push("Missing required field: ticker");
  }

  if (!data.instrument_type || !VALID_INSTRUMENT_TYPES.includes(data.instrument_type)) {
    errors.push(`Invalid or missing instrument_type (must be one of: ${VALID_INSTRUMENT_TYPES.join(", ")})`);
  }

  if (!data.direction || !VALID_DIRECTIONS.includes(data.direction)) {
    errors.push(`Invalid or missing direction (must be one of: ${VALID_DIRECTIONS.join(", ")})`);
  }

  if (data.instrument_type === "Options") {
    if (!data.expiration) errors.push("Options signal missing required field: expiration");
    if (!data.strike) errors.push("Options signal missing required field: strike");
  }

  if (data.entry_price != null && (isNaN(Number(data.entry_price)) || Number(data.entry_price) <= 0)) {
    errors.push("entry_price must be a positive number");
  }

  if (data.stop_loss != null && (isNaN(Number(data.stop_loss)) || Number(data.stop_loss) <= 0)) {
    errors.push("stop_loss must be a positive number");
  }

  if (data.targets && typeof data.targets === "object") {
    for (const [key, val] of Object.entries(data.targets)) {
      const t = val as any;
      if (!t?.price || isNaN(Number(t.price)) || Number(t.price) <= 0) {
        errors.push(`Target ${key} must have a positive price`);
      }
    }
  }

  return errors;
}

export async function processSignal(
  signal: Signal,
  app: ConnectedApp | null,
): Promise<ProcessResult> {
  const result: ProcessResult = {
    discord: { sent: false, errors: [] },
    ibkr: { executed: false, tradeResult: null, errors: [] },
  };

  const validationErrors = validateSignal(signal);
  if (validationErrors.length > 0) {
    console.warn(`[SignalProcessor] Validation failed:`, validationErrors);
    result.discord.errors.push(...validationErrors);
    result.ibkr.errors.push(...validationErrors);
    return result;
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


