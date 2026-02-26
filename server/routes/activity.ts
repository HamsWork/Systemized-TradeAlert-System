import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/async-handler";

export function registerActivityRoutes(app: Express) {
  app.get("/api/activity", asyncHandler(async (_req, res) => {
    const log = await storage.getActivityLog();
    res.json(log);
  }));
}
