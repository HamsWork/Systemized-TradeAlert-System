import type { Express } from "express";
import { storage } from "../storage";

export function registerActivityRoutes(app: Express) {
  app.get("/api/activity", async (_req, res) => {
    try {
      const log = await storage.getActivityLog();
      res.json(log);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity log" });
    }
  });
}
