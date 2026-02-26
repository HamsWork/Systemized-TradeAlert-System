import type { Express } from "express";
import { storage } from "../storage";
import { insertSignalSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";

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

    const { ticker, instrumentType, direction, expiration, strike, entryPrice } = body;
    let { tradePlan } = body;

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

    if (tradePlan && typeof tradePlan === "string") {
      try { tradePlan = JSON.parse(tradePlan); } catch { return res.status(400).json({ message: "tradePlan must be a valid JSON object" }); }
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

    if (tradePlan && typeof tradePlan === "object") {
      if (tradePlan.stopLoss) {
        const sl = tradePlan.stopLoss;
        if (sl.sl1) signalDataObj.stop_loss_1 = sl.sl1;
        if (sl.sl2) signalDataObj.stop_loss_2 = sl.sl2;
        if (sl.sl3) signalDataObj.stop_loss_3 = sl.sl3;
      }
      if (tradePlan.targetLevels) {
        const tp = tradePlan.targetLevels;
        if (tp.tp1) signalDataObj.take_profit_1 = tp.tp1;
        if (tp.tp2) signalDataObj.take_profit_2 = tp.tp2;
        if (tp.tp3) signalDataObj.take_profit_3 = tp.tp3;
      }
      if (tradePlan.raiseStopLevel) {
        const rs = tradePlan.raiseStopLevel;
        if (rs.method) signalDataObj.raise_stop_method = rs.method;
        if (rs.value) signalDataObj.raise_stop_value = rs.value;
      }
      if (tradePlan.notes) signalDataObj.trade_plan = tradePlan.notes;
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

    res.status(201).json({ success: true, signal });
  }));
}
