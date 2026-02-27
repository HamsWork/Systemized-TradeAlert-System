import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/async-handler";

export function registerActivityRoutes(app: Express) {
  app.get("/api/activity", asyncHandler(async (_req, res) => {
    const log = await storage.getActivityLog();
    res.json(log);
  }));

  app.get("/api/activity/by-symbol/:symbol", asyncHandler(async (req, res) => {
    const entries = await storage.getActivityBySymbol(req.params.symbol.toUpperCase());
    res.json(entries);
  }));

  app.get("/api/activity/by-signal/:signalId", asyncHandler(async (req, res) => {
    const entries = await storage.getActivityBySignal(req.params.signalId);
    res.json(entries);
  }));

  app.get("/api/discord-messages", asyncHandler(async (_req, res) => {
    const messages = await storage.getDiscordMessages();
    res.json(messages);
  }));

  app.get("/api/discord-messages/by-signal/:signalId", asyncHandler(async (req, res) => {
    const messages = await storage.getDiscordMessagesBySignal(req.params.signalId);
    res.json(messages);
  }));
}
