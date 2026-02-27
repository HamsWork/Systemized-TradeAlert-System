import type { Signal, ConnectedApp } from "@shared/schema";
import { executeIbkrTrade } from "./trade-executor";
import { sendSignalDiscordAlert } from "./discord";

interface ProcessResult {
  discordSent: boolean;
  tradeExecuted: boolean;
  tradeResult: {
    orderId: number;
    status: string;
    symbol: string;
    side: string;
    quantity: number;
  } | null;
  errors: string[];
}

export async function processSignal(
  signal: Signal,
  app: ConnectedApp | null,
): Promise<ProcessResult> {
  const result: ProcessResult = {
    discordSent: false,
    tradeExecuted: false,
    tradeResult: null,
    errors: [],
  };

  const discordResult = await sendSignalDiscordAlert(signal, app);
  result.discordSent = discordResult.sent;
  if (discordResult.error) {
    result.errors.push(`Discord alert failed: ${discordResult.error}`);
  }

  const tradeExecution = await executeIbkrTrade(signal, app);
  result.tradeExecuted = tradeExecution.executed;
  result.tradeResult = tradeExecution.trade;
  if (tradeExecution.error) {
    result.errors.push(`IBKR trade failed: ${tradeExecution.error}`);
  }

  return result;
}
