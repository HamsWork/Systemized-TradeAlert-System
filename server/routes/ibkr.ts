import type { Express } from "express";
import { storage } from "../storage";
import { insertIbkrOrderSchema, insertIbkrPositionSchema } from "@shared/schema";

const partialIbkrOrderSchema = insertIbkrOrderSchema.partial();
const partialIbkrPositionSchema = insertIbkrPositionSchema.partial();

export function registerIbkrRoutes(app: Express) {
  app.get("/api/ibkr/orders", async (_req, res) => {
    try {
      const orders = await storage.getIbkrOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBKR orders" });
    }
  });

  app.get("/api/ibkr/orders/:integrationId", async (req, res) => {
    try {
      const orders = await storage.getIbkrOrdersByIntegration(req.params.integrationId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBKR orders" });
    }
  });

  app.post("/api/ibkr/orders", async (req, res) => {
    try {
      const parsed = insertIbkrOrderSchema.parse(req.body);
      const order = await storage.createIbkrOrder(parsed);
      await storage.createActivity({
        type: "ibkr_order",
        title: `IBKR Order: ${parsed.side.toUpperCase()} ${parsed.symbol}`,
        description: `${parsed.orderType} order for ${parsed.quantity} shares`,
        symbol: parsed.symbol,
        metadata: { orderId: parsed.orderId, status: parsed.status },
      });
      res.status(201).json(order);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid order data" });
    }
  });

  app.patch("/api/ibkr/orders/:id", async (req, res) => {
    try {
      const parsed = partialIbkrOrderSchema.parse(req.body);
      const updated = await storage.updateIbkrOrder(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "Order not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update order" });
    }
  });

  app.get("/api/ibkr/positions", async (_req, res) => {
    try {
      const positions = await storage.getIbkrPositions();
      res.json(positions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBKR positions" });
    }
  });

  app.get("/api/ibkr/positions/:integrationId", async (req, res) => {
    try {
      const positions = await storage.getIbkrPositionsByIntegration(req.params.integrationId);
      res.json(positions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBKR positions" });
    }
  });

  app.post("/api/ibkr/positions", async (req, res) => {
    try {
      const parsed = insertIbkrPositionSchema.parse(req.body);
      const position = await storage.createIbkrPosition(parsed);
      res.status(201).json(position);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid position data" });
    }
  });

  app.patch("/api/ibkr/positions/:id", async (req, res) => {
    try {
      const parsed = partialIbkrPositionSchema.parse(req.body);
      const updated = await storage.updateIbkrPosition(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "Position not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update position" });
    }
  });
}
