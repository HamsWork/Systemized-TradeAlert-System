import type { Express } from "express";
import { storage } from "../storage";
import { insertAlertSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";

const partialAlertSchema = insertAlertSchema.partial();

export function registerAlertRoutes(app: Express) {
  app.get("/api/alerts", asyncHandler(async (_req, res) => {
    const alerts = await storage.getAlerts();
    res.json(alerts);
  }));

  app.get("/api/alerts/:id", asyncHandler(async (req, res) => {
    const alert = await storage.getAlert(req.params.id);
    if (!alert) return res.status(404).json({ message: "Alert not found" });
    res.json(alert);
  }));

  app.post("/api/alerts", asyncHandler(async (req, res) => {
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
  }));

  app.patch("/api/alerts/:id", asyncHandler(async (req, res) => {
    const parsed = partialAlertSchema.parse(req.body);
    const updated = await storage.updateAlert(req.params.id, parsed);
    if (!updated) return res.status(404).json({ message: "Alert not found" });
    res.json(updated);
  }));

  app.delete("/api/alerts/:id", asyncHandler(async (req, res) => {
    const deleted = await storage.deleteAlert(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Alert not found" });
    res.json({ success: true });
  }));
}
