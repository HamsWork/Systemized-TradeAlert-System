import type { Express } from "express";
import { storage } from "../storage";
import { insertAlertSchema } from "@shared/schema";

const partialAlertSchema = insertAlertSchema.partial();

export function registerAlertRoutes(app: Express) {
  app.get("/api/alerts", async (_req, res) => {
    try {
      const alerts = await storage.getAlerts();
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.get("/api/alerts/:id", async (req, res) => {
    try {
      const alert = await storage.getAlert(req.params.id);
      if (!alert) return res.status(404).json({ message: "Alert not found" });
      res.json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alert" });
    }
  });

  app.post("/api/alerts", async (req, res) => {
    try {
      const parsed = insertAlertSchema.parse(req.body);
      const alert = await storage.createAlert(parsed);
      await storage.createActivity({
        type: "alert_created",
        title: `Alert created: ${parsed.name}`,
        description: `${parsed.condition} $${parsed.targetPrice} on ${parsed.symbol}`,
        symbol: parsed.symbol,
        metadata: null,
      });
      res.status(201).json(alert);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid alert data" });
    }
  });

  app.patch("/api/alerts/:id", async (req, res) => {
    try {
      const parsed = partialAlertSchema.parse(req.body);
      const updated = await storage.updateAlert(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "Alert not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update alert" });
    }
  });

  app.delete("/api/alerts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteAlert(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Alert not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete alert" });
    }
  });
}
