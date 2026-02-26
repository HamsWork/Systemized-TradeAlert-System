import type { Express } from "express";
import { storage } from "../storage";
import { insertIbkrOrderSchema, insertIbkrPositionSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";

const partialIbkrOrderSchema = insertIbkrOrderSchema.partial();
const partialIbkrPositionSchema = insertIbkrPositionSchema.partial();

export function registerIbkrRoutes(app: Express) {
  app.get("/api/ibkr/orders", asyncHandler(async (_req, res) => {
    const orders = await storage.getIbkrOrders();
    res.json(orders);
  }));

  app.get("/api/ibkr/orders/:integrationId", asyncHandler(async (req, res) => {
    const orders = await storage.getIbkrOrdersByIntegration(req.params.integrationId);
    res.json(orders);
  }));

  app.post("/api/ibkr/orders", asyncHandler(async (req, res) => {
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
  }));

  app.patch("/api/ibkr/orders/:id", asyncHandler(async (req, res) => {
    const parsed = partialIbkrOrderSchema.parse(req.body);
    const updated = await storage.updateIbkrOrder(req.params.id, parsed);
    if (!updated) return res.status(404).json({ message: "Order not found" });
    res.json(updated);
  }));

  app.get("/api/ibkr/positions", asyncHandler(async (_req, res) => {
    const positions = await storage.getIbkrPositions();
    res.json(positions);
  }));

  app.get("/api/ibkr/positions/:integrationId", asyncHandler(async (req, res) => {
    const positions = await storage.getIbkrPositionsByIntegration(req.params.integrationId);
    res.json(positions);
  }));

  app.post("/api/ibkr/positions", asyncHandler(async (req, res) => {
    const parsed = insertIbkrPositionSchema.parse(req.body);
    const position = await storage.createIbkrPosition(parsed);
    res.status(201).json(position);
  }));

  app.patch("/api/ibkr/positions/:id", asyncHandler(async (req, res) => {
    const parsed = partialIbkrPositionSchema.parse(req.body);
    const updated = await storage.updateIbkrPosition(req.params.id, parsed);
    if (!updated) return res.status(404).json({ message: "Position not found" });
    res.json(updated);
  }));
}
