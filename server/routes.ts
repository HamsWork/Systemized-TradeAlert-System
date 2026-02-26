import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAlertSchema, insertSignalSchema, insertSignalTypeSchema, insertConnectedAppSchema, insertSystemSettingSchema, insertIntegrationSchema, insertIbkrOrderSchema, insertIbkrPositionSchema } from "@shared/schema";
import crypto from "crypto";

const partialAlertSchema = insertAlertSchema.partial();
const partialSignalSchema = insertSignalSchema.partial();
const partialSignalTypeSchema = insertSignalTypeSchema.partial();
const partialConnectedAppSchema = insertConnectedAppSchema.partial();
const partialIntegrationSchema = insertIntegrationSchema.partial();
const partialIbkrOrderSchema = insertIbkrOrderSchema.partial();
const partialIbkrPositionSchema = insertIbkrPositionSchema.partial();

function generateApiKey(): string {
  return `ts_${crypto.randomBytes(24).toString("hex")}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/alerts", async (_req, res) => {
    try {
      const alerts = await storage.getAlerts();
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.get("/api/alerts/:id", async (req, res) => {
    try {
      const alert = await storage.getAlert(req.params.id);
      if (!alert) return res.status(404).json({ message: "Alert not found" });
      res.json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alert" });
    }
  });

  app.post("/api/alerts", async (req, res) => {
    try {
      const parsed = insertAlertSchema.parse(req.body);
      const alert = await storage.createAlert(parsed);
      await storage.createActivity({
        type: "alert_created",
        title: `Alert created: ${parsed.name}`,
        description: `${parsed.condition} $${parsed.targetPrice} on ${parsed.symbol}`,
        symbol: parsed.symbol,
        metadata: null,
      });
      res.status(201).json(alert);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid alert data" });
    }
  });

  app.patch("/api/alerts/:id", async (req, res) => {
    try {
      const parsed = partialAlertSchema.parse(req.body);
      const updated = await storage.updateAlert(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "Alert not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update alert" });
    }
  });

  app.delete("/api/alerts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteAlert(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Alert not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete alert" });
    }
  });

  app.get("/api/signal-types", async (_req, res) => {
    try {
      const types = await storage.getSignalTypes();
      res.json(types);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch signal types" });
    }
  });

  app.get("/api/signal-types/:id", async (req, res) => {
    try {
      const st = await storage.getSignalType(req.params.id);
      if (!st) return res.status(404).json({ message: "Signal type not found" });
      res.json(st);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch signal type" });
    }
  });

  app.post("/api/signal-types", async (req, res) => {
    try {
      const parsed = insertSignalTypeSchema.parse(req.body);
      const st = await storage.createSignalType(parsed);
      await storage.createActivity({
        type: "signal_type_created",
        title: `Signal type created: ${parsed.name}`,
        description: `New signal template "${parsed.name}" with ${(parsed.variables as any[])?.length || 0} variables`,
        symbol: null,
        metadata: null,
      });
      res.status(201).json(st);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid signal type data" });
    }
  });

  app.patch("/api/signal-types/:id", async (req, res) => {
    try {
      const parsed = partialSignalTypeSchema.parse(req.body);
      const updated = await storage.updateSignalType(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "Signal type not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update signal type" });
    }
  });

  app.delete("/api/signal-types/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteSignalType(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Signal type not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete signal type" });
    }
  });

  app.get("/api/signals", async (_req, res) => {
    try {
      const sigs = await storage.getSignals();
      res.json(sigs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch signals" });
    }
  });

  app.get("/api/signals/:id", async (req, res) => {
    try {
      const signal = await storage.getSignal(req.params.id);
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      res.json(signal);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch signal" });
    }
  });

  app.post("/api/signals", async (req, res) => {
    try {
      const parsed = insertSignalSchema.parse(req.body);
      const signalType = await storage.getSignalType(parsed.signalTypeId);
      const signal = await storage.createSignal(parsed);
      const data = parsed.data as Record<string, any>;
      await storage.createActivity({
        type: "signal_created",
        title: `Signal: ${signalType?.name || "Unknown"} - ${data.ticker || data.symbol || ""}`,
        description: `${signalType?.name || "Signal"} created${data.ticker ? ` for ${data.ticker}` : ""}`,
        symbol: data.ticker || data.symbol || null,
        metadata: null,
      });
      res.status(201).json(signal);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid signal data" });
    }
  });

  app.patch("/api/signals/:id", async (req, res) => {
    try {
      const parsed = partialSignalSchema.parse(req.body);
      const updated = await storage.updateSignal(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "Signal not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update signal" });
    }
  });

  app.delete("/api/signals/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteSignal(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Signal not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete signal" });
    }
  });

  app.post("/api/ingest/signals", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Missing or invalid Authorization header. Use: Bearer <api_key>" });
      }

      const apiKey = authHeader.slice(7);
      const connectedApp = await storage.getConnectedAppByApiKey(apiKey);

      if (!connectedApp) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      if (connectedApp.status !== "active") {
        return res.status(403).json({ message: "App is inactive. Enable it in TradeSync to send signals." });
      }

      if (!connectedApp.syncSignals) {
        return res.status(403).json({ message: "Signal sync is disabled for this app." });
      }

      const body = req.body;

      let signalTypeId = body.signalTypeId;
      if (!signalTypeId && body.signalType) {
        const st = await storage.getSignalTypeByName(body.signalType);
        if (st) signalTypeId = st.id;
      }

      if (!signalTypeId) {
        return res.status(400).json({ message: "signalTypeId or signalType (name) is required" });
      }

      const signalType = await storage.getSignalType(signalTypeId);
      if (!signalType) {
        return res.status(400).json({ message: "Signal type not found" });
      }

      const signalData = {
        signalTypeId,
        data: body.data || {},
        discordChannelId: body.discordChannelId || null,
        status: "active",
        sourceAppId: connectedApp.id,
        sourceAppName: connectedApp.name,
      };

      const parsed = insertSignalSchema.parse(signalData);
      const signal = await storage.createSignal(parsed);

      await storage.updateConnectedApp(connectedApp.id, { lastSyncAt: new Date() } as any);

      const data = body.data || {};
      await storage.createActivity({
        type: "signal_ingested",
        title: `Signal from ${connectedApp.name}: ${signalType.name} ${data.ticker || data.symbol || ""}`,
        description: `${signalType.name} signal${data.ticker ? ` for ${data.ticker}` : ""}`,
        symbol: data.ticker || data.symbol || null,
        metadata: { sourceApp: connectedApp.name, sourceAppId: connectedApp.id },
      });

      res.status(201).json({ success: true, signal });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid signal data" });
    }
  });

  app.get("/api/activity", async (_req, res) => {
    try {
      const log = await storage.getActivityLog();
      res.json(log);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity log" });
    }
  });

  app.get("/api/connected-apps", async (_req, res) => {
    try {
      const apps = await storage.getConnectedApps();
      res.json(apps);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch connected apps" });
    }
  });

  app.get("/api/connected-apps/:id", async (req, res) => {
    try {
      const app = await storage.getConnectedApp(req.params.id);
      if (!app) return res.status(404).json({ message: "App not found" });
      res.json(app);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch app" });
    }
  });

  app.post("/api/connected-apps", async (req, res) => {
    try {
      const data = { ...req.body };
      if (!data.apiKey) {
        data.apiKey = generateApiKey();
      }
      const parsed = insertConnectedAppSchema.parse(data);
      const app = await storage.createConnectedApp(parsed);
      await storage.createActivity({
        type: "app_connected",
        title: `Connected app: ${parsed.name}`,
        description: `${parsed.name} has been plugged into TradeSync`,
        symbol: null,
        metadata: null,
      });
      res.status(201).json(app);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid app data" });
    }
  });

  app.patch("/api/connected-apps/:id", async (req, res) => {
    try {
      const parsed = partialConnectedAppSchema.parse(req.body);
      const updated = await storage.updateConnectedApp(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "App not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update app" });
    }
  });

  app.post("/api/connected-apps/:id/regenerate-key", async (req, res) => {
    try {
      const newKey = generateApiKey();
      const updated = await storage.updateConnectedApp(req.params.id, { apiKey: newKey });
      if (!updated) return res.status(404).json({ message: "App not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to regenerate API key" });
    }
  });

  app.delete("/api/connected-apps/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteConnectedApp(req.params.id);
      if (!deleted) return res.status(404).json({ message: "App not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete app" });
    }
  });

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

  return httpServer;
}
