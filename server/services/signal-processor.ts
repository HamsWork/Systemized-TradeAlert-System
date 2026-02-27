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
      const discordResult = await sendSignalDiscordAlert(signal, app);
      result.discordSent = discordResult.sent;

      await storage.createDiscordMessage({
        signalId: signal.id,
        webhookUrl: discordResult.webhookUrl || "",
        channelType: "signal",
        instrumentType: discordResult.instrumentType,
        status: discordResult.sent ? "sent" : "failed",
        messageType: "signal_alert",
        embedData: { ticker, direction: data.direction, instrumentType: discordResult.instrumentType },
        error: discordResult.sent ? null : "No webhook configured or send failed",
        sourceAppId: app.id,
        sourceAppName: app.name,
      });

      if (discordResult.sent) {
        await storage.createActivity({
          type: "discord_sent",
          title: `Discord alert sent for ${ticker}`,
          description: `Signal alert sent to Discord via ${app.name}`,
          symbol: ticker,
          signalId: signal.id,
          metadata: { sourceApp: app.name, sourceAppId: app.id },
        });
      }
    } catch (err: any) {
      const msg = `Discord alert failed: ${err.message}`;
      console.error(`[SignalProcessor] ${msg}`);
      result.errors.push(msg);

      await storage.createDiscordMessage({
        signalId: signal.id,
        webhookUrl: "",
        channelType: "signal",
        instrumentType: data.instrument_type || "Options",
        status: "error",
        messageType: "signal_alert",
        error: err.message,
        sourceAppId: app.id,
        sourceAppName: app.name,
      });
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
          signalId: signal.id,
          metadata: { orderId: tradeResult.orderId, status: tradeResult.status, sourceApp: app.name },
        });

        if (app.sendDiscordMessages) {
          try {
            const execDiscord = await sendTradeExecutedDiscordAlert(signal, app, tradeResult);

            await storage.createDiscordMessage({
              signalId: signal.id,
              webhookUrl: "",
              channelType: "signal",
              instrumentType: data.instrument_type || "Options",
              status: execDiscord ? "sent" : "failed",
              messageType: "trade_executed",
              embedData: { ticker, orderId: tradeResult.orderId, side: tradeResult.side, status: tradeResult.status },
              sourceAppId: app.id,
              sourceAppName: app.name,
            });
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
        signalId: signal.id,
        metadata: { sourceApp: app?.name, error: err.message },
      });
    }
  }

  return result;
}
