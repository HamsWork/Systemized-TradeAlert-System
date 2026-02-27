import type { Express } from "express";
import { storage } from "../storage";
import { insertSignalSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";
import { fetchPolygonBars } from "../services/polygon";
import { processSignal } from "../services/signal-processor";

const partialSignalSchema = insertSignalSchema.partial();

export function registerSignalRoutes(app: Express) {
  app.get("/api/signals", asyncHandler(async (_req, res) => {
    const sigs = await storage.getSignals();
    res.json(sigs);
  }));

  app.get("/api/signals/:id", asyncHandler(async (req, res) => {
    const signal = await storage.getSignal(req.params.id);
    if (!signal) return res.status(404).json({ message: "Signal not found" });
    res.json(signal);
  }));

  app.post("/api/signals", asyncHandler(async (req, res) => {
    const parsed = insertSignalSchema.parse(req.body);
    const signal = await storage.createSignal(parsed);
    const data = parsed.data as Record<string, any>;
    const ticker = data.ticker || data.symbol || "";
    await storage.createActivity({
      type: "signal_created",
      title: `Signal: ${ticker}`,
      description: `Signal created for ${ticker}`,
      symbol: ticker || null,
      metadata: null,
    });

    if (signal.sourceAppId) {
      const sourceApp = await storage.getConnectedApp(signal.sourceAppId);
      if (sourceApp) {
        processSignal(signal, sourceApp).catch(err =>
          console.error("[Signals] Background processing error:", err.message)
        );
      }
    }

    res.status(201).json(signal);
  }));

  app.patch("/api/signals/:id", asyncHandler(async (req, res) => {
    const parsed = partialSignalSchema.parse(req.body);
    const updated = await storage.updateSignal(req.params.id, parsed);
    if (!updated) return res.status(404).json({ message: "Signal not found" });
    res.json(updated);
  }));

  app.delete("/api/signals/:id", asyncHandler(async (req, res) => {
    const deleted = await storage.deleteSignal(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Signal not found" });
    res.json({ success: true });
  }));

  app.post("/api/ingest/signals", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    let connectedApp = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const apiKey = authHeader.slice(7);
      connectedApp = await storage.getConnectedAppByApiKey(apiKey);

      if (!connectedApp) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      if (connectedApp.status !== "active") {
        return res.status(403).json({ message: "App is inactive. Enable it in TradeSync to send signals." });
      }

      if (!connectedApp.syncSignals) {
        return res.status(403).json({ message: "Signal sync is disabled for this app." });
      }
    }

    const body = req.body;

    const { ticker, instrumentType, direction, expiration, strike, entryPrice, targets, stop_loss } = body;

    if (!ticker) {
      return res.status(400).json({ message: "ticker is required" });
    }

    const validInstruments = ["Options", "Shares", "LETF"];
    if (!instrumentType || !validInstruments.includes(instrumentType)) {
      return res.status(400).json({ message: `instrumentType is required and must be one of: ${validInstruments.join(", ")}` });
    }

    const validDirections = ["Long", "Short"];
    if (!direction || !validDirections.includes(direction)) {
      return res.status(400).json({ message: `direction is required and must be one of: ${validDirections.join(", ")}` });
    }

    if (instrumentType === "Options") {
      if (!expiration) {
        return res.status(400).json({ message: "expiration is required for Options" });
      }
      if (!strike) {
        return res.status(400).json({ message: "strike is required for Options" });
      }
    }

    const signalDataObj: Record<string, any> = {
      ticker,
      instrument_type: instrumentType,
      direction,
      entry_price: entryPrice || null,
    };

    if (instrumentType === "Options") {
      signalDataObj.expiration = expiration;
      signalDataObj.strike = strike;
    }

    if (targets && typeof targets === "object") {
      signalDataObj.targets = targets;
    }

    if (stop_loss !== undefined && stop_loss !== null) {
      signalDataObj.stop_loss = stop_loss;
    }

    if (body.expiration) {
      signalDataObj.expiration = body.expiration;
    }

    const sourceName = connectedApp ? connectedApp.name : "Manual";
    const sourceId = connectedApp ? connectedApp.id : null;

    const signalData = {
      data: signalDataObj,
      discordChannelId: body.discordChannelId || null,
      status: "active",
      sourceAppId: sourceId,
      sourceAppName: sourceName,
    };

    const parsed = insertSignalSchema.parse(signalData);
    const signal = await storage.createSignal(parsed);

    if (connectedApp) {
      await storage.updateConnectedApp(connectedApp.id, { lastSyncAt: new Date() } as any);
    }

    await storage.createActivity({
      type: "signal_ingested",
      title: `Signal from ${sourceName}: ${ticker} ${direction}`,
      description: `${instrumentType} signal for ${ticker} (${direction})`,
      symbol: ticker,
      metadata: { sourceApp: sourceName, sourceAppId: sourceId },
    });

    fetchPolygonBars({ symbol: ticker, secType: "STK" }).catch(() => {});
    if (instrumentType === "Options" && strike && expiration) {
      const right = body.optionType?.toUpperCase().startsWith("P") ? "P" : "C";
      fetchPolygonBars({ symbol: ticker, secType: "OPT", strike: Number(strike), expiration, right }).catch(() => {});
    }

    const processResult = await processSignal(signal, connectedApp);

    res.status(201).json({
      success: true,
      signal,
      processing: {
        discordSent: processResult.discordSent,
        tradeExecuted: processResult.tradeExecuted,
        tradeResult: processResult.tradeResult,
        errors: processResult.errors,
      },
    });
  }));
}
