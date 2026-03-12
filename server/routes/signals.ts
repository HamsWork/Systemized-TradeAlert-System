import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { insertSignalSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";
import { getParam } from "../lib/params";
import { processSignal } from "../services/signal-processor";
import { executeIbkrClose } from "../services/trade-executor";
import {
  recordManualTargetHit,
  recordManualStopLossHit,
  getCurrentInstrumentPrice,
} from "../services/trade-monitor";

import {
  sendTradeClosedManuallyDiscord,
  sendEntryDicordAlert,
  sendTargetHitDiscordAlert,
  sendStopLossHitDiscord,
  sendStopLossRaisedDiscord,
  sendRawDiscordEmbed,
} from "../services/discord";

import type { ConnectedApp } from "@shared/schema";
import { generateDiscordPreviews, generateAllTemplates } from "../services/discord-preview";
// NOTE: instrumentPriceFromUnderlying and related conversion helpers were removed.

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
    await storage
      .createActivity({
        type: "ingest_failed",
        title: "Signal ingest failed: no API key",
        description:
          "POST /api/ingest/signals called without Authorization header. Requests must include Bearer token.",
        symbol: null,
        signalId: null,
        metadata: { reason: "no_api_key", path: "/api/ingest/signals" },
      })
      .catch(() => {});
    return res
      .status(401)
      .json({ message: "Authorization header with Bearer token is required" });
  }

  const apiKey = authHeader.slice(7);
  const connectedApp = await storage.getConnectedAppByApiKey(apiKey);

  if (!connectedApp) {
    await storage
      .createActivity({
        type: "ingest_failed",
        title: "Signal ingest failed: invalid API key",
        description:
          "POST /api/ingest/signals called with an invalid or unknown API key.",
        symbol: null,
        signalId: null,
        metadata: { reason: "invalid_api_key", path: "/api/ingest/signals" },
      })
      .catch(() => {});
    return res.status(401).json({ message: "Invalid API key" });
  }

  if (connectedApp.status !== "active") {
    await storage
      .createActivity({
        type: "ingest_failed",
        title: "Signal ingest rejected: app inactive",
        description: `App "${connectedApp.name}" is inactive. Enable it in TradeSync to send signals.`,
        symbol: null,
        signalId: null,
        metadata: {
          reason: "app_inactive",
          path: "/api/ingest/signals",
          appId: connectedApp.id,
          appName: connectedApp.name,
        },
      })
      .catch(() => {});
    return res.status(403).json({
      message: "App is inactive. Enable it in TradeSync to send signals.",
    });
  }

  if (!connectedApp.syncSignals) {
    await storage
      .createActivity({
        type: "ingest_failed",
        title: "Signal ingest rejected: sync disabled",
        description: `Signal sync is disabled for app "${connectedApp.name}".`,
        symbol: null,
        signalId: null,
        metadata: {
          reason: "sync_signals_disabled",
          path: "/api/ingest/signals",
          appId: connectedApp.id,
          appName: connectedApp.name,
        },
      })
      .catch(() => {});
    return res
      .status(403)
      .json({ message: "Signal sync is disabled for this app." });
  }

  req.connectedApp = connectedApp;
  next();
}

const partialSignalSchema = insertSignalSchema.partial();

export function registerSignalRoutes(app: Express) {
  app.get(
    "/api/signals",
    asyncHandler(async (_req, res) => {
      const sigs = await storage.getSignals();
      res.json(sigs);
    }),
  );

  app.get(
    "/api/signals/:id",
    asyncHandler(async (req, res) => {
      const signal = await storage.getSignal(getParam(req, "id"));
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      res.json(signal);
    }),
  );

  app.get(
    "/api/signals/:id/discord-preview",
    asyncHandler(async (req, res) => {
      const signal = await storage.getSignal(getParam(req, "id"));
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      const previews = generateDiscordPreviews(signal);
      res.json(previews);
    }),
  );

  app.get(
    "/api/discord-templates",
    asyncHandler(async (_req, res) => {
      res.json(generateAllTemplates());
    }),
  );

  app.patch(
    "/api/signals/:id/auto-track",
    asyncHandler(async (req, res) => {
      const signal = await storage.getSignal(getParam(req, "id"));
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      const data = { ...(signal.data as Record<string, any>) };
      const newValue =
        req.body.auto_track !== undefined ? !!req.body.auto_track : false;
      data.auto_track = newValue;
      const updated = await storage.updateSignal(signal.id, { data });
      if (!updated)
        return res.status(500).json({ message: "Failed to update signal" });
      const ticker = data.ticker || data.symbol || "";
      await storage
        .createActivity({
          type: "auto_track_changed",
          title: `Auto-track ${newValue ? "enabled" : "disabled"}: ${ticker}`,
          description: `Auto-track for ${ticker} has been ${newValue ? "enabled" : "disabled"}`,
          symbol: ticker || null,
          signalId: signal.id,
          metadata: { auto_track: newValue },
        })
        .catch(() => {});
      res.json(updated);
    }),
  );

  app.post(
    "/api/signals/:id/send-discord",
    asyncHandler(async (req, res) => {
      const signal = await storage.getSignal(getParam(req, "id"));
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      const { messageType } = req.body;
      if (!messageType)
        return res.status(400).json({ message: "messageType is required" });
      const data = (signal.data || {}) as Record<string, any>;
      const ticker = data.ticker || data.symbol || "UNKNOWN";
      const app = signal.sourceAppId
        ? await storage.getConnectedApp(signal.sourceAppId)
        : null;
      if (!app)
        return res
          .status(400)
          .json({ message: "No source app found for this signal" });
      if (!app.sendDiscordMessages)
        return res
          .status(400)
          .json({ message: `Discord messages are disabled for ${app.name}` });

      const updateSignal = !!req.body.updateSignal;
      const customPayload = req.body.customPayload;

      if (customPayload && typeof customPayload === "object" && Array.isArray(customPayload.embeds)) {
        const result = await sendRawDiscordEmbed(signal, app, customPayload, messageType);
        return res.json(result);
      }

      let result: { sent: boolean; error: string | null } = {
        sent: false,
        error: null,
      };
      switch (messageType) {
        case "signal_alert":
          result = await sendEntryDicordAlert(signal, app);
          break;
        case "target_hit": {
          const targetKey = req.body.targetKey || "tp1";
          const targets = data.targets || {};
          const t = targets[targetKey];
          if (!t?.price)
            return res
              .status(400)
              .json({ message: `Target ${targetKey} not found` });
          const dataForTargetHit = { ...data };
          const fetchedInstrumentPrice = await getCurrentInstrumentPrice(data, ticker);
          const fallbackInstrumentPrice = Number(t.price);
          dataForTargetHit.current_instrument_price =
            fetchedInstrumentPrice ??
            dataForTargetHit.current_instrument_price ??
            fallbackInstrumentPrice;
          const currentInstrumentPrice =
            fetchedInstrumentPrice ??
            dataForTargetHit.current_instrument_price ??
            Number(t.price);
          dataForTargetHit.current_tp_key = targetKey;
          dataForTargetHit.current_tp_number = targetKey.replace(/^tp/i, "") || "1";
          dataForTargetHit.current_tp_price = Number(t.price);
          dataForTargetHit.current_tp_take_off_percent = Number(t.take_off_percent) || 50;
          if (t.raise_stop_loss?.price) {
            dataForTargetHit.current_tp_raise_stop_loss = Number(t.raise_stop_loss.price);
          }
          await sendTargetHitDiscordAlert(
            dataForTargetHit,
            app,
            signal.id,
          );
          if (updateSignal) {
            const updatedData = { ...data };
            if (!updatedData.hit_targets) updatedData.hit_targets = {};
            updatedData.hit_targets[targetKey] = {
              hitAt: new Date().toISOString(),
              price: Number(t.price),
            };
            if (t.raise_stop_loss?.price)
              updatedData.stop_loss = Number(t.raise_stop_loss.price);
            const allKeys = Object.keys(targets);
            const allHit = allKeys.every((k) => updatedData.hit_targets[k]);
            await storage.updateSignal(signal.id, {
              data: updatedData,
              ...(allHit ? { status: "completed" } : {}),
            });
          }
          result = { sent: true, error: null };
          break;
        }
        case "stop_loss_raised": {
          const targetKey = req.body.targetKey || "tp1";
          const targets = data.targets || {};
          const t = targets[targetKey];
          if (!t?.raise_stop_loss?.price)
            return res
              .status(400)
              .json({ message: `No raise_stop_loss on ${targetKey}` });
          const newSL = Number(t.raise_stop_loss.price);
          const bodyPayload = (req.body || {}) as Record<string, unknown>;
          /** Tracking price: for comparison; instrument price: for P&L display (see docs/PRICE_TERMINOLOGY). */
          const currentTrackingPrice =
            typeof bodyPayload.currentTrackingPrice === "number" &&
            bodyPayload.currentTrackingPrice > 0
              ? bodyPayload.currentTrackingPrice
              : typeof bodyPayload.current_tracking_price === "number" &&
                  bodyPayload.current_tracking_price > 0
                ? bodyPayload.current_tracking_price
                : data.entry_price != null
                  ? Number(data.entry_price)
                  : newSL;
          const dataForSLRaised = { ...data };
          const fetchedInstrumentPriceSL = await getCurrentInstrumentPrice(data, ticker);
          dataForSLRaised.current_instrument_price =
            fetchedInstrumentPriceSL ??
            dataForSLRaised.current_instrument_price ??
            currentTrackingPrice;
          const currentInstrumentPrice =
            fetchedInstrumentPriceSL ??
            (typeof bodyPayload.currentInstrumentPrice === "number" &&
            bodyPayload.currentInstrumentPrice > 0
              ? bodyPayload.currentInstrumentPrice
              : typeof bodyPayload.current_instrument_price === "number" &&
                  bodyPayload.current_instrument_price > 0
                ? bodyPayload.current_instrument_price
                : null) ??
            dataForSLRaised.current_instrument_price ??
            currentTrackingPrice;
          dataForSLRaised.new_stop_loss = newSL;
          dataForSLRaised.sl_raised_target_key = targetKey;
          await sendStopLossRaisedDiscord(
            dataForSLRaised,
            app,
            signal.id,
          );
          if (updateSignal) {
            const updatedData = { ...data, stop_loss: newSL };
            await storage.updateSignal(signal.id, { data: updatedData });
          }
          result = { sent: true, error: null };
          break;
        }
        case "stop_loss_hit": {
          const stopLoss =
            data.stop_loss != null ? Number(data.stop_loss) : null;
          if (stopLoss == null)
            return res.status(400).json({ message: "No stop loss defined" });
          const dataForSLHit = { ...data };
          const fetchedInstrumentPriceSLHit = await getCurrentInstrumentPrice(data, ticker);
          const instrumentPriceToStore = fetchedInstrumentPriceSLHit ?? null;
          if (instrumentPriceToStore != null) {
            dataForSLHit.current_instrument_price = instrumentPriceToStore;
            dataForSLHit.instrumentSLFilled = instrumentPriceToStore;
          }
          await sendStopLossHitDiscord(
            dataForSLHit,
            app,
            stopLoss,
            fetchedInstrumentPriceSLHit ?? dataForSLHit.current_instrument_price ?? stopLoss,
            signal.id,
          );
          if (updateSignal) {
            const updatedData = {
              ...data,
              stop_loss_hit: true,
              stop_loss_hit_at: new Date().toISOString(),
              stop_loss_hit_price: stopLoss,
              ...(instrumentPriceToStore != null
                ? {
                    current_instrument_price: instrumentPriceToStore,
                    instrumentSLFilled: instrumentPriceToStore,
                  }
                : {}),
            };
            await storage.updateSignal(signal.id, {
              data: updatedData,
              status: "stopped_out",
            });
          }
          result = { sent: true, error: null };
          break;
        }
        case "trade_closed_manually":
          await sendTradeClosedManuallyDiscord(signal, app, ticker, data);
          if (updateSignal) {
            await storage.updateSignal(signal.id, { status: "closed" });
          }
          result = { sent: true, error: null };
          break;
        default:
          return res
            .status(400)
            .json({ message: `Unknown message type: ${messageType}` });
      }

      res.json(result);
    }),
  );

  app.post(
    "/api/signals",
    asyncHandler(async (req, res) => {
      const parsed = insertSignalSchema.parse(req.body);
      const signal = await storage.createSignal(parsed);
      const data = parsed.data as Record<string, any>;
      const ticker = data.ticker || data.symbol || "";
      await storage.createActivity({
        type: "signal_created",
        title: `Signal: ${ticker}`,
        description: `Signal created for ${ticker}`,
        symbol: ticker || null,
        signalId: signal.id,
        metadata: null,
      });

      res.status(201).json(signal);
    }),
  );

  app.patch(
    "/api/signals/:id",
    asyncHandler(async (req, res) => {
      const parsed = partialSignalSchema.parse(req.body);
      const updated = await storage.updateSignal(getParam(req, "id"), parsed);
      if (!updated)
        return res.status(404).json({ message: "Signal not found" });
      res.json(updated);
    }),
  );

  app.post(
    "/api/signals/:id/target-hit",
    asyncHandler(async (req, res) => {
      const signal = await storage.getSignal(getParam(req, "id"));
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      const body = (req.body || {}) as Record<string, unknown>;
      const currentPrice =
        typeof body.currentPrice === "number" && body.currentPrice > 0
          ? body.currentPrice
          : typeof body.current_price === "number" && body.current_price > 0
            ? body.current_price
            : null;
      const result = await recordManualTargetHit(signal, currentPrice);
      if (result.error) return res.status(400).json({ message: result.error });
      return res.json(result.signal);
    }),
  );

  app.post(
    "/api/signals/:id/stop-loss-hit",
    asyncHandler(async (req, res) => {
      const signal = await storage.getSignal(getParam(req, "id"));
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      const body = (req.body || {}) as Record<string, unknown>;
      const currentPrice =
        typeof body.currentPrice === "number" && body.currentPrice > 0
          ? body.currentPrice
          : typeof body.current_price === "number" && body.current_price > 0
            ? body.current_price
            : null;
      const result = await recordManualStopLossHit(signal, currentPrice);
      if (result.error) return res.status(400).json({ message: result.error });
      return res.json(result.signal);
    }),
  );

  app.post(
    "/api/signals/:id/stop-auto-track",
    asyncHandler(async (req, res) => {
      const signal = await storage.getSignal(getParam(req, "id"));
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      if (signal.status !== "active") {
        return res.status(400).json({
          message: `Signal is not active (current status: ${signal.status}). Only active signals can change auto tracking.`,
        });
      }
      const data = (signal.data || {}) as Record<string, any>;
      if (data.auto_track === false) {
        return res.json(signal);
      }
      const updatedData = { ...data, auto_track: false };
      const updated = await storage.updateSignal(signal.id, {
        data: updatedData,
      });
      if (!updated)
        return res.status(500).json({ message: "Failed to update signal" });

      const ticker =
        (data.ticker as string) || (data.symbol as string) || "Unknown";
      await storage
        .createActivity({
          type: "auto_track_disabled",
          title: `Auto tracking disabled for ${ticker}`,
          description:
            "Automatic target and stop-loss tracking disabled; manual control only.",
          symbol: ticker,
          signalId: signal.id,
          metadata: { auto_track: false },
        })
        .catch(() => {});

      return res.json(updated);
    }),
  );

  app.post(
    "/api/signals/:id/close",
    asyncHandler(async (req, res) => {
      const signal = await storage.getSignal(getParam(req, "id"));
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      if (signal.status !== "active")
        return res.status(400).json({
          message: `Signal is not active (current status: ${signal.status}). Only active signals can be closed.`,
        });

      const data = (signal.data || {}) as Record<string, unknown>;
      const ticker =
        (data.ticker as string) || (data.symbol as string) || "Unknown";
      const app = signal.sourceAppId
        ? await storage.getConnectedApp(signal.sourceAppId)
        : null;

      const closeResult = await executeIbkrClose(signal, app ?? null);
      if (
        closeResult.error &&
        closeResult.executed === false &&
        closeResult.error !== "No filled position to close for this signal"
      ) {
        console.warn(
          `[Close API] IBKR close skipped or failed for ${ticker}: ${closeResult.error}`,
        );
      }

      const updated = await storage.updateSignal(signal.id, {
        status: "closed",
      });
      if (!updated)
        return res.status(500).json({ message: "Failed to update signal" });

      await storage
        .createActivity({
          type: "trade_closed",
          title: `Trade closed: ${ticker}`,
          description: closeResult.executed
            ? `Signal closed manually. IBKR close order placed (orderId: ${closeResult.orderId}, qty: ${closeResult.quantity}).`
            : `Signal manually closed (was active).${closeResult.error ? ` IBKR: ${closeResult.error}` : ""}`,
          symbol: ticker,
          signalId: signal.id,
          metadata: {
            reason: "api_close",
            closedManually: true,
            sourceApp: signal.sourceAppName || null,
            ibkrCloseOrderId: closeResult.orderId ?? null,
            ibkrCloseExecuted: closeResult.executed,
          },
        })
        .catch(() => {});

      await sendTradeClosedManuallyDiscord(
        updated,
        app ?? null,
        ticker,
        (updated.data || {}) as Record<string, any>,
      );

      res.json(updated);
    }),
  );

  app.delete(
    "/api/signals/:id",
    asyncHandler(async (req, res) => {
      const deleted = await storage.deleteSignal(getParam(req, "id"));
      if (!deleted)
        return res.status(404).json({ message: "Signal not found" });
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/ingest/signals",
    authenticateApiKey,
    asyncHandler(async (req, res) => {
      const connectedApp = req.connectedApp!;

      const processResult = await processSignal(req.body, connectedApp);

      if (processResult.validationErrors.length > 0) {
        return res
          .status(400)
          .json({ message: processResult.validationErrors.join("; ") });
      }

      res.status(201).json({
        success: true,
        signal: processResult.signal,
        processing: {
          discord: processResult.discord,
          ibkr: processResult.ibkr,
        },
      });
    }),
  );
}
