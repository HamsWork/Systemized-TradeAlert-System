import type { Express } from "express";
import { storage } from "../storage";
import { insertSystemSettingSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";

export function registerSettingsRoutes(app: Express) {
  app.get("/api/settings", asyncHandler(async (_req, res) => {
    const settings = await storage.getSystemSettings();
    res.json(settings);
  }));

  app.put("/api/settings", asyncHandler(async (req, res) => {
    const parsed = insertSystemSettingSchema.parse(req.body);
    const setting = await storage.upsertSystemSetting(parsed);
    res.json(setting);
  }));
}
