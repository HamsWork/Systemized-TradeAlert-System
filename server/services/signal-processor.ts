import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";
import { executeIbkrTrade } from "./trade-executor";
import { sendSignalDiscordAlert, sendTradeExecutedDiscordAlert } from "./discord";

interface ProcessResult {
  discordSent: boolean;
  tradeExecuted: boolean;
  tradeResult: { orderId: number; status: string; symbol: string; side: string; quantity: number } | null;
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

  if (app && app.sendDiscordMessages) {
    try {
      const sent = await sendSignalDiscordAlert(signal, app);
      result.discordSent = sent;
      if (sent) {
        await storage.createActivity({
          type: "discord_sent",
          title: `Discord alert sent for ${ticker}`,
          description: `Signal alert sent to Discord via ${app.name}`,
          symbol: ticker,
          metadata: { sourceApp: app.name, sourceAppId: app.id },
        });
      }
    } catch (err: any) {
      const msg = `Discord alert failed: ${err.message}`;
      console.error(`[SignalProcessor] ${msg}`);
      result.errors.push(msg);
    }
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
          metadata: { orderId: tradeResult.orderId, status: tradeResult.status, sourceApp: app.name },
        });

        if (app.sendDiscordMessages) {
          try {
            await sendTradeExecutedDiscordAlert(signal, app, tradeResult);
          } catch (err: any) {
            console.error(`[SignalProcessor] Trade execution Discord alert failed: ${err.message}`);
          }
        }
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
        metadata: { sourceApp: app?.name, error: err.message },
      });
    }
  }

  return result;
}
