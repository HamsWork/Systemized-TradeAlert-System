import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";
import { executeIbkrTrade } from "./trade-executor";
import {
  sendSignalDiscordAlert,
  sendTradeExecutedDiscordAlert,
} from "./discord";

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

  const data = signal.data as Record<string, any>;
  const ticker = data.ticker || "UNKNOWN";

  const discordResult = await sendSignalDiscordAlert(signal, app);
  result.discordSent = discordResult.sent;
  if (discordResult.error) {
    result.errors.push(`Discord alert failed: ${discordResult.error}`);
  }

  if (app && app.executeIbkrTrades) {
    try {
      const tradeResult = await executeIbkrTrade(signal, app);
      if (tradeResult) {
        result.tradeExecuted = true;
        result.tradeResult = tradeResult;

        await storage.createActivity({
          type: "trade_executed",
          title: `IBKR trade executed: ${tradeResult.side} ${ticker}`,
          description: `Order #${tradeResult.orderId} ${tradeResult.status} - ${tradeResult.side} ${tradeResult.quantity} ${ticker}`,
          symbol: ticker,
          signalId: signal.id,
          metadata: {
            orderId: tradeResult.orderId,
            status: tradeResult.status,
            sourceApp: app.name,
          },
        });

        await sendTradeExecutedDiscordAlert(signal, app, tradeResult);
      }
    } catch (err: any) {
      const msg = `IBKR trade execution failed: ${err.message}`;
      console.error(`[SignalProcessor] ${msg}`);
      result.errors.push(msg);

      await storage.createActivity({
        type: "trade_error",
        title: `IBKR trade failed for ${ticker}`,
        description: msg,
        symbol: ticker,
        signalId: signal.id,
        metadata: { sourceApp: app?.name, error: err.message },
      });
    }
  }

  return result;
}
