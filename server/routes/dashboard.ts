import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/async-handler";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard/stats", asyncHandler(async (_req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  }));
}
