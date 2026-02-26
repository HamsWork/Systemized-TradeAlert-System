import type { Express } from "express";
import { storage } from "../storage";
import { insertConnectedAppSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";
import crypto from "crypto";

const partialConnectedAppSchema = insertConnectedAppSchema.partial();

function generateApiKey(): string {
  return `ts_${crypto.randomBytes(24).toString("hex")}`;
}

export function registerAppRoutes(app: Express) {
  app.get("/api/connected-apps", asyncHandler(async (_req, res) => {
    const apps = await storage.getConnectedApps();
    res.json(apps);
  }));

  app.get("/api/connected-apps/:id", asyncHandler(async (req, res) => {
    const connectedApp = await storage.getConnectedApp(req.params.id);
    if (!connectedApp) return res.status(404).json({ message: "App not found" });
    res.json(connectedApp);
  }));

  app.post("/api/connected-apps", asyncHandler(async (req, res) => {
    const data = { ...req.body };
    if (!data.apiKey) {
      data.apiKey = generateApiKey();
    }
    const parsed = insertConnectedAppSchema.parse(data);
    const connectedApp = await storage.createConnectedApp(parsed);
    await storage.createActivity({
      type: "app_connected",
      title: `Connected app: ${parsed.name}`,
      description: `${parsed.name} has been plugged into TradeSync`,
      symbol: null,
      metadata: null,
    });
    res.status(201).json(connectedApp);
  }));

  app.patch("/api/connected-apps/:id", asyncHandler(async (req, res) => {
    const parsed = partialConnectedAppSchema.parse(req.body);
    const updated = await storage.updateConnectedApp(req.params.id, parsed);
    if (!updated) return res.status(404).json({ message: "App not found" });
    res.json(updated);
  }));

  app.post("/api/connected-apps/:id/regenerate-key", asyncHandler(async (req, res) => {
    const newKey = generateApiKey();
    const updated = await storage.updateConnectedApp(req.params.id, { apiKey: newKey });
    if (!updated) return res.status(404).json({ message: "App not found" });
    res.json(updated);
  }));

  app.delete("/api/connected-apps/:id", asyncHandler(async (req, res) => {
    const deleted = await storage.deleteConnectedApp(req.params.id);
    if (!deleted) return res.status(404).json({ message: "App not found" });
    res.json({ success: true });
  }));
}
