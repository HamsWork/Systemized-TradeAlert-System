import type { Express } from "express";
import { storage } from "../storage";
import { insertIbkrOrderSchema, insertIbkrPositionSchema } from "@shared/schema";
import { asyncHandler } from "../lib/async-handler";
import { ibkrSyncManager } from "../services/ibkr-sync";
import { fetchPolygonBars } from "../services/polygon";

const partialIbkrOrderSchema = insertIbkrOrderSchema.partial();
const partialIbkrPositionSchema = insertIbkrPositionSchema.partial();

export function registerIbkrRoutes(app: Express) {
  app.get("/api/ibkr/orders", asyncHandler(async (_req, res) => {
    const orders = await storage.getIbkrOrders();
    res.json(orders);
  }));

  app.get("/api/ibkr/orders/by-symbol/:symbol", asyncHandler(async (req, res) => {
    const orders = await storage.getIbkrOrdersBySymbol(req.params.symbol.toUpperCase());
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

  app.post("/api/ibkr/connect/:integrationId", asyncHandler(async (req, res) => {
    const integration = await storage.getIntegration(req.params.integrationId);
    if (!integration) return res.status(404).json({ message: "Integration not found" });
    if (integration.type !== "ibkr") return res.status(400).json({ message: "Not an IBKR integration" });

    await ibkrSyncManager.reconnect(integration.id);
    const status = ibkrSyncManager.getConnectionStatus();
    const connected = status.get(integration.id) ?? false;

    res.json({ success: connected, status: connected ? "connected" : "disconnected" });
  }));

  app.post("/api/ibkr/disconnect/:integrationId", asyncHandler(async (req, res) => {
    await ibkrSyncManager.disconnectOne(req.params.integrationId);
    res.json({ success: true, status: "disconnected" });
  }));

  app.get("/api/ibkr/chart-data", asyncHandler(async (req, res) => {
    const { symbol, secType, strike, expiration, right, duration } = req.query;
    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ message: "symbol query parameter is required" });
    }

    const polygonBars = await fetchPolygonBars({
      symbol,
      secType: (secType as string) || "STK",
      strike: strike ? Number(strike) : undefined,
      expiration: (expiration as string) || undefined,
      right: (right as string) || undefined,
    });
    if (polygonBars.length > 0) {
      return res.json(polygonBars);
    }

    const ibkrBars = await ibkrSyncManager.fetchContractHistory({
      symbol,
      secType: (secType as string) || "STK",
      strike: strike ? Number(strike) : undefined,
      expiration: (expiration as string) || undefined,
      right: (right as string) || undefined,
      duration: (duration as string) || undefined,
    });
    res.json(ibkrBars);
  }));

  app.get("/api/ibkr/status", asyncHandler(async (_req, res) => {
    const status = ibkrSyncManager.getConnectionStatus();
    const result: Record<string, boolean> = {};
    for (const [id, connected] of status) {
      result[id] = connected;
    }
    res.json(result);
  }));
}
