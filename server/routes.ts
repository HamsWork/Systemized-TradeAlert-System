import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAlertSchema, insertSignalSchema, insertWatchlistSchema } from "@shared/schema";

const partialAlertSchema = insertAlertSchema.partial();
const partialSignalSchema = insertSignalSchema.partial();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Dashboard stats
  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Alerts CRUD
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

  // Signals CRUD
  app.get("/api/signals", async (_req, res) => {
    try {
      const sigs = await storage.getSignals();
      res.json(sigs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch signals" });
    }
  });

  app.get("/api/signals/:id", async (req, res) => {
    try {
      const signal = await storage.getSignal(req.params.id);
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      res.json(signal);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch signal" });
    }
  });

  app.post("/api/signals", async (req, res) => {
    try {
      const parsed = insertSignalSchema.parse(req.body);
      const signal = await storage.createSignal(parsed);
      await storage.createActivity({
        type: "signal_created",
        title: `${parsed.direction.toUpperCase()} signal: ${parsed.symbol}`,
        description: `${parsed.type} signal at $${parsed.entryPrice} with ${parsed.confidence}% confidence`,
        symbol: parsed.symbol,
        metadata: null,
      });
      res.status(201).json(signal);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid signal data" });
    }
  });

  app.patch("/api/signals/:id", async (req, res) => {
    try {
      const parsed = partialSignalSchema.parse(req.body);
      const updated = await storage.updateSignal(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "Signal not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update signal" });
    }
  });

  app.delete("/api/signals/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteSignal(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Signal not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete signal" });
    }
  });

  // Watchlist CRUD
  app.get("/api/watchlist", async (_req, res) => {
    try {
      const items = await storage.getWatchlist();
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch watchlist" });
    }
  });

  app.post("/api/watchlist", async (req, res) => {
    try {
      const parsed = insertWatchlistSchema.parse(req.body);
      const item = await storage.addToWatchlist(parsed);
      await storage.createActivity({
        type: "watchlist_added",
        title: `Added ${parsed.symbol} to watchlist`,
        description: `${parsed.name} at $${parsed.currentPrice}`,
        symbol: parsed.symbol,
        metadata: null,
      });
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid watchlist data" });
    }
  });

  app.delete("/api/watchlist/:id", async (req, res) => {
    try {
      const deleted = await storage.removeFromWatchlist(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Item not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove from watchlist" });
    }
  });

  // Activity Log
  app.get("/api/activity", async (_req, res) => {
    try {
      const log = await storage.getActivityLog();
      res.json(log);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity log" });
    }
  });

  return httpServer;
}
