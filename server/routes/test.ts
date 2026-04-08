import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import {
  sendEntryDicordAlert,
  sendTargetHitDiscordAlert,
  sendStopLossRaisedDiscord,
  sendStopLossHitDiscord,
  sendTradeClosedManuallyDiscord,
  sendTradeExecutedDiscordAlert,
} from "../services/discord";
import { asyncHandler } from "../lib/async-handler";
import type { ConnectedApp, Signal } from "@shared/schema";

const DISCORD_TEST_TYPES = [
  "signal_alert",
  "target_hit",
  "stop_loss_raised",
  "stop_loss_hit",
  "trade_closed_manually",
  "trade_executed",
] as const;

declare global {
  namespace Express {
    interface Request {
      connectedApp?: ConnectedApp | null;
    }
  }
}

async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization header with Bearer token is required" });
  }
  const apiKey = authHeader.slice(7);
  const connectedApp = await storage.getConnectedAppByApiKey(apiKey);
  if (!connectedApp) {
    return res.status(401).json({ message: "Invalid API key" });
  }
  if (connectedApp.status !== "active") {
    return res.status(403).json({ message: "App is inactive." });
  }
  req.connectedApp = connectedApp;
  next();
}

/**
 * Registers test-only routes (e.g. trigger Discord alerts without live prices).
 * Enabled when NODE_ENV=development or ENABLE_TEST_ROUTES=true.
 * In production, set ENABLE_TEST_ROUTES=true explicitly to enable.
 */
export function registerTestRoutes(app: Express) {
  const inDev = process.env.NODE_ENV === "development";
  const explicit = process.env.ENABLE_TEST_ROUTES === "true";
  if (!inDev && !explicit) return;

  app.post(
    "/api/test/discord-alert",
    authenticateApiKey,
    asyncHandler(async (req, res) => {
      const app = req.connectedApp!;
      if (!app.sendDiscordMessages) {
        return res.status(400).json({
          message: "Discord messages are disabled for this app. Enable in TradeSync.",
        });
      }

      const body = req.body as Record<string, any>;
      const type = body.type as string;
      const instrumentType = body.instrumentType || body.instrument_type || "Shares";
      const ticker = (body.ticker || body.symbol || "TEST").toString().toUpperCase();
      const entryPrice = body.entryPrice ?? body.entry_price ?? 100;
      const stopLoss = body.stopLoss ?? body.stop_loss ?? 95;
      const currentPrice = body.currentPrice ?? body.current_price ?? entryPrice ?? 100;

      if (!type || !DISCORD_TEST_TYPES.includes(type as (typeof DISCORD_TEST_TYPES)[number])) {
        return res.status(400).json({
          message: `body.type must be one of: ${DISCORD_TEST_TYPES.join(", ")}`,
        });
      }

      function baseSignalData() {
        const data: Record<string, any> = {
          ticker,
          instrument_type: instrumentType,
          direction: (instrumentType === "Options" || instrumentType === "LETF Option") ? (body.direction || "Call") : "Long",
          entry_price: entryPrice,
          entry_underlying_price: body.entry_underlying_price ?? (instrumentType === "LETF" ? 5200 : null),
          stop_loss: stopLoss,
          targets: {
            tp1: { price: Number(body.tp1Price ?? 110), take_off_percent: 50, raise_stop_loss: { price: entryPrice } },
            tp2: { price: Number(body.tp2Price ?? 120), take_off_percent: 50 },
          },
        };
        if (instrumentType === "Options" || instrumentType === "LETF Option") {
          data.expiration = body.expiration ?? "2026-04-17";
          data.strike = body.strike ?? 155;
          data.right = (body.direction || "Call").toString().toLowerCase().startsWith("put") ? "PUT" : "CALL";
          data.currentPrice = body.optionPrice ?? entryPrice;
        }
        if (instrumentType === "LETF") {
          data.underlyingStockPrice = body.entry_underlying_price ?? 5200;
        }
        return data;
      }

      let signal: Signal;
      const existing = (await storage.getSignals()).find((s) => s.sourceAppId === app.id);
      if (existing) {
        signal = existing;
        await storage.updateSignal(existing.id, { data: { ...(existing.data as Record<string, any>), ...baseSignalData() } });
        signal = (await storage.getSignal(existing.id))!;
      } else {
        signal = await storage.createSignal({
          data: baseSignalData(),
          status: "active",
          sourceAppId: app.id,
          sourceAppName: app.name,
        });
      }

      const data: Record<string, any> = {
        ...(signal.data as Record<string, any>),
        instrument_type: instrumentType,
        ticker,
        entry_price: entryPrice,
        stop_loss: stopLoss,
      };

      if (type === "signal_alert") {
        if (body.alert_mode) {
          const updData = { ...(signal.data as Record<string, any>), alert_mode: body.alert_mode };
          await storage.updateSignal(signal.id, { data: updData as any });
          signal = (await storage.getSignal(signal.id))!;
        }
        const result = await sendEntryDicordAlert(signal, app);
        return res.json({
          ok: result.sent,
          type: "signal_alert",
          message: result.sent ? `Signal Discord alert sent for ${ticker}` : result.error,
        });
      }

      if (type === "target_hit") {
        const targetKey = body.targetKey ?? body.target_key ?? "tp1";
        const targetPrice = body.targetPrice ?? body.target_price ?? currentPrice;
        await sendTargetHitDiscordAlert(
          data,
          app,
          {
            key: targetKey,
            price: Number(targetPrice),
            takeOffPercent: body.takeOffPercent ?? body.take_off_percent ?? 50,
            raiseStopLoss: body.raiseStopLoss ?? body.raise_stop_loss ?? entryPrice,
          },
          currentPrice,
          data.current_instrument_price ?? currentPrice,
          signal?.id ?? "",
        );
        return res.json({
          ok: true,
          type: "target_hit",
          message: `Target hit Discord alert sent for ${ticker} (${targetKey})`,
        });
      }

      if (type === "stop_loss_raised") {
        const newStopLoss = body.newStopLoss ?? body.new_stop_loss ?? entryPrice;
        const targetKey = body.targetKey ?? body.target_key ?? "tp1";
        const dataForSLRaised = {
          ...data,
          new_stop_loss: Number(newStopLoss),
          sl_raised_target_key: targetKey,
          current_tracking_price: currentPrice,
          current_instrument_price:
            data.current_instrument_price ?? currentPrice,
        };
        await sendStopLossRaisedDiscord(
          dataForSLRaised,
          app,
          signal?.id ?? "",
        );
        return res.json({
          ok: true,
          type: "stop_loss_raised",
          message: `Stop loss raised Discord alert sent for ${ticker}`,
        });
      }

      if (type === "stop_loss_hit") {
        const sl = stopLoss ?? data.stop_loss ?? 95;
        const slData = {
          ...data,
          stop_loss_hit: true,
          stop_loss_hit_price: currentPrice,
          stop_loss_hit_pct: -5.2,
        };
        await sendStopLossHitDiscord(
          slData,
          app,
          signal?.id ?? "",
        );
        return res.json({
          ok: true,
          type: "stop_loss_hit",
          message: `Stop loss hit Discord alert sent for ${ticker}`,
        });
      }

      if (type === "trade_closed_manually") {
        const exitPrice = body.exitPrice ?? body.exit_price ?? currentPrice;
        const pnl = body.pnl ?? (Number(exitPrice) - Number(entryPrice)) * 10;
        const pnlPct = body.pnlPct ?? body.pnl_pct ?? ((Number(exitPrice) - Number(entryPrice)) / Number(entryPrice) * 100).toFixed(1);
        const closedData = {
          ...data,
          entry_price: entryPrice,
          exit_price: exitPrice,
          pnl,
          pnl_pct: pnlPct,
          r_multiple: body.r_multiple ?? body.rMultiple ?? 1.5,
        };
        await sendTradeClosedManuallyDiscord(signal, app, ticker, closedData);
        return res.json({
          ok: true,
          type: "trade_closed_manually",
          message: `Trade closed manually Discord alert sent for ${ticker}`,
        });
      }

      if (type === "trade_executed") {
        const tradeResult = {
          orderId: body.orderId ?? body.order_id ?? 12345,
          status: body.status ?? "filled",
          symbol: ticker,
          side: body.side ?? "buy",
          quantity: body.quantity ?? 10,
        };
        const result = await sendTradeExecutedDiscordAlert(signal, app, tradeResult);
        return res.json({
          ok: result.sent,
          type: "trade_executed",
          message: result.sent ? `Trade executed Discord alert sent for ${ticker}` : result.error,
        });
      }

      return res.status(400).json({ message: "Invalid type" });
    }),
  );
}
