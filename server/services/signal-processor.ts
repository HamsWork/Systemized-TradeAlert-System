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

function fetchExpectedData(signal: Signal): {
  ticker: string;
  instrumentType: string;
  direction: string;
  entryPrice: number | null;
  targets: Record<string, any> | null;
  stopLoss: number | null;
  timeStop: string | null;
  expiration: string | null;
  strike: number | null;
  right: string | null;
} {
  const data = signal.data as Record<string, any>;
  return {
    ticker: data.ticker || "UNKNOWN",
    instrumentType: data.instrument_type || "Options",
    direction: data.direction || "Long",
    entryPrice: data.entry_price ? Number(data.entry_price) : null,
    targets: data.targets && typeof data.targets === "object" ? data.targets : null,
    stopLoss: data.stop_loss != null ? Number(data.stop_loss) : null,
    timeStop: data.time_stop || null,
    expiration: data.expiration || null,
    strike: data.strike ? Number(data.strike) : null,
    right: data.right || null,
  };
}

export async function processSignal(
  signal: Signal,
  app: ConnectedApp | null,
): Promise<ProcessResult> {
  const result: ProcessResult = {
    discord: { sent: false, errors: [] },
    ibkr: { executed: false, tradeResult: null, errors: [] },
  };

  const expectedData = fetchExpectedData(signal);
  console.log(`[SignalProcessor] Processing ${expectedData.ticker} (${expectedData.instrumentType}, ${expectedData.direction})`);

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
