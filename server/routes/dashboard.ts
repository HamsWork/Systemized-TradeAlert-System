import type { Express } from "express";
import { storage } from "../storage";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });
}
