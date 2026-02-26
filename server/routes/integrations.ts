import type { Express } from "express";
import { storage } from "../storage";
import { insertIntegrationSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";

const partialIntegrationSchema = insertIntegrationSchema.partial();

export function registerIntegrationRoutes(app: Express) {
  app.get("/api/integrations", asyncHandler(async (_req, res) => {
    const items = await storage.getIntegrations();
    res.json(items);
  }));

  app.post("/api/integrations", asyncHandler(async (req, res) => {
    const parsed = insertIntegrationSchema.parse(req.body);
    const integration = await storage.createIntegration(parsed);
    await storage.createActivity({
      type: "integration_added",
      title: `Integration added: ${parsed.name}`,
      description: `${parsed.type} integration connected to TradeSync`,
      symbol: null,
      metadata: null,
    });
    res.status(201).json(integration);
  }));

  app.patch("/api/integrations/:id", asyncHandler(async (req, res) => {
    const parsed = partialIntegrationSchema.parse(req.body);
    const updated = await storage.updateIntegration(req.params.id, parsed);
    if (!updated) return res.status(404).json({ message: "Integration not found" });
    res.json(updated);
  }));

  app.delete("/api/integrations/:id", asyncHandler(async (req, res) => {
    const deleted = await storage.deleteIntegration(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Integration not found" });
    res.json({ success: true });
  }));
}
