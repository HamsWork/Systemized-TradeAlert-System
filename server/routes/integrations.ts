import type { Express } from "express";
import { storage } from "../storage";
import { insertIntegrationSchema } from "@shared/schema";

const partialIntegrationSchema = insertIntegrationSchema.partial();

export function registerIntegrationRoutes(app: Express) {
  app.get("/api/integrations", async (_req, res) => {
    try {
      const items = await storage.getIntegrations();
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  app.post("/api/integrations", async (req, res) => {
    try {
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
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid integration data" });
    }
  });

  app.patch("/api/integrations/:id", async (req, res) => {
    try {
      const parsed = partialIntegrationSchema.parse(req.body);
      const updated = await storage.updateIntegration(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "Integration not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update integration" });
    }
  });

  app.delete("/api/integrations/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteIntegration(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Integration not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete integration" });
    }
  });
}
