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

export async function processSignal(
  signal: Signal,
  app: ConnectedApp | null,
): Promise<ProcessResult> {
  const result: ProcessResult = {
    discord: { sent: false, errors: [] },
    ibkr: { executed: false, tradeResult: null, errors: [] },
  };

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
