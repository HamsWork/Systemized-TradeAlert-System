import type { Express } from "express";
import { storage } from "../storage";
import { insertSignalSchema, insertSignalTypeSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";

const partialSignalSchema = insertSignalSchema.partial();
const partialSignalTypeSchema = insertSignalTypeSchema.partial();

export function registerSignalRoutes(app: Express) {
  app.get("/api/signal-types", asyncHandler(async (_req, res) => {
    const types = await storage.getSignalTypes();
    res.json(types);
  }));

  app.get("/api/signal-types/:id", asyncHandler(async (req, res) => {
    const st = await storage.getSignalType(req.params.id);
    if (!st) return res.status(404).json({ message: "Signal type not found" });
    res.json(st);
  }));

  app.post("/api/signal-types", asyncHandler(async (req, res) => {
    const parsed = insertSignalTypeSchema.parse(req.body);
    const st = await storage.createSignalType(parsed);
    await storage.createActivity({
      type: "signal_type_created",
      title: `Signal type created: ${parsed.name}`,
      description: `New signal template "${parsed.name}" with ${(parsed.variables as any[])?.length || 0} variables`,
      symbol: null,
      metadata: null,
    });
    res.status(201).json(st);
  }));

  app.patch("/api/signal-types/:id", asyncHandler(async (req, res) => {
    const parsed = partialSignalTypeSchema.parse(req.body);
    const updated = await storage.updateSignalType(req.params.id, parsed);
    if (!updated) return res.status(404).json({ message: "Signal type not found" });
    res.json(updated);
  }));

  app.delete("/api/signal-types/:id", asyncHandler(async (req, res) => {
    const deleted = await storage.deleteSignalType(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Signal type not found" });
    res.json({ success: true });
  }));

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
    const signalType = await storage.getSignalType(parsed.signalTypeId);
    const signal = await storage.createSignal(parsed);
    const data = parsed.data as Record<string, any>;
    await storage.createActivity({
      type: "signal_created",
      title: `Signal: ${signalType?.name || "Unknown"} - ${data.ticker || data.symbol || ""}`,
      description: `${signalType?.name || "Signal"} created${data.ticker ? ` for ${data.ticker}` : ""}`,
      symbol: data.ticker || data.symbol || null,
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

    let signalTypeId = body.signalTypeId;
    if (!signalTypeId && body.signalType) {
      const st = await storage.getSignalTypeByName(body.signalType);
      if (st) signalTypeId = st.id;
    }

    if (!signalTypeId) {
      return res.status(400).json({ message: "signalTypeId or signalType (name) is required" });
    }

    const signalType = await storage.getSignalType(signalTypeId);
    if (!signalType) {
      return res.status(400).json({ message: "Signal type not found" });
    }

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
      signalTypeId,
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
      title: `Signal from ${sourceName}: ${signalType.name} ${ticker}`,
      description: `${signalType.name} signal for ${ticker} (${instrumentType})`,
      symbol: ticker,
      metadata: { sourceApp: sourceName, sourceAppId: sourceId },
    });

    res.status(201).json({ success: true, signal });
  }));
}
