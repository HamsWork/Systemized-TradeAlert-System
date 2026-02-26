import type { Express } from "express";
import { storage } from "../storage";
import { insertSystemSettingSchema } from "@shared/schema";

export function registerSettingsRoutes(app: Express) {
  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await storage.getSystemSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const parsed = insertSystemSettingSchema.parse(req.body);
      const setting = await storage.upsertSystemSetting(parsed);
      res.json(setting);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update setting" });
    }
  });
}
