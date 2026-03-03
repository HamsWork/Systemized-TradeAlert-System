import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { insertSignalSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";
import { getParam } from "../lib/params";
import { processSignal } from "../services/signal-processor";
import { executeIbkrClose } from "../services/trade-executor";
import { sendTradeClosedManuallyDiscord } from "../services/discord";
import type { ConnectedApp } from "@shared/schema";

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
    return res.status(403).json({
      message: "App is inactive. Enable it in TradeSync to send signals.",
    });
  }

  if (!connectedApp.syncSignals) {
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
    "/api/signals/:id/close",
    asyncHandler(async (req, res) => {
      const signal = await storage.getSignal(getParam(req, "id"));
      if (!signal)
        return res.status(404).json({ message: "Signal not found" });
      if (signal.status !== "active")
        return res.status(400).json({
          message: `Signal is not active (current status: ${signal.status}). Only active signals can be closed.`,
        });

      const data = (signal.data || {}) as Record<string, unknown>;
      const ticker = (data.ticker as string) || (data.symbol as string) || "Unknown";
      const app = signal.sourceAppId
        ? await storage.getConnectedApp(signal.sourceAppId)
        : null;

      const closeResult = await executeIbkrClose(signal, app ?? null);
      if (closeResult.error && closeResult.executed === false && closeResult.error !== "No filled position to close for this signal") {
        console.warn(`[Close API] IBKR close skipped or failed for ${ticker}: ${closeResult.error}`);
      }

      const updated = await storage.updateSignal(signal.id, { status: "closed" });
      if (!updated) return res.status(500).json({ message: "Failed to update signal" });

      await storage.createActivity({
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
      }).catch(() => {});

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
