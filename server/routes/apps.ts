import type { Express } from "express";
import { storage } from "../storage";
import { insertConnectedAppSchema } from "@shared/schema";
import crypto from "crypto";

const partialConnectedAppSchema = insertConnectedAppSchema.partial();

function generateApiKey(): string {
  return `ts_${crypto.randomBytes(24).toString("hex")}`;
}

export function registerAppRoutes(app: Express) {
  app.get("/api/connected-apps", async (_req, res) => {
    try {
      const apps = await storage.getConnectedApps();
      res.json(apps);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch connected apps" });
    }
  });

  app.get("/api/connected-apps/:id", async (req, res) => {
    try {
      const connectedApp = await storage.getConnectedApp(req.params.id);
      if (!connectedApp) return res.status(404).json({ message: "App not found" });
      res.json(connectedApp);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch app" });
    }
  });

  app.post("/api/connected-apps", async (req, res) => {
    try {
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
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid app data" });
    }
  });

  app.patch("/api/connected-apps/:id", async (req, res) => {
    try {
      const parsed = partialConnectedAppSchema.parse(req.body);
      const updated = await storage.updateConnectedApp(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "App not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update app" });
    }
  });

  app.post("/api/connected-apps/:id/regenerate-key", async (req, res) => {
    try {
      const newKey = generateApiKey();
      const updated = await storage.updateConnectedApp(req.params.id, { apiKey: newKey });
      if (!updated) return res.status(404).json({ message: "App not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to regenerate API key" });
    }
  });

  app.delete("/api/connected-apps/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteConnectedApp(req.params.id);
      if (!deleted) return res.status(404).json({ message: "App not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete app" });
    }
  });
}
