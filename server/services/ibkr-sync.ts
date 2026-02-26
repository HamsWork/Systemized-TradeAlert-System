import { IbkrClient } from "./ibkr-client";
import { storage } from "../storage";
import type { Integration, InsertIbkrOrder, InsertIbkrPosition } from "@shared/schema";

function parseIbkrTimestamp(ts: string): Date | null {
  if (!ts) return null;
  const cleaned = ts.replace(/\s+/g, " ").trim();
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) return parsed;
  const match = cleaned.match(/^(\d{4})(\d{2})(\d{2})\s*[:-]?\s*(\d{2}):?(\d{2}):?(\d{2})/);
  if (match) {
    return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`);
  }
  return null;
}

const STATUS_MAP: Record<string, string> = {
  "ApiPending": "pending",
  "PendingSubmit": "pending",
  "PendingCancel": "pending",
  "PreSubmitted": "submitted",
  "Submitted": "submitted",
  "ApiCancelled": "cancelled",
  "Cancelled": "cancelled",
  "Filled": "filled",
  "Inactive": "rejected",
};

function mapOrderStatus(ibkrStatus: string): string {
  return STATUS_MAP[ibkrStatus] || ibkrStatus.toLowerCase();
}

function mapOrderType(ibkrType: string): string {
  const map: Record<string, string> = {
    "MKT": "market",
    "LMT": "limit",
    "STP": "stop",
    "STP LMT": "stop_limit",
    "TRAIL": "trailing_stop",
    "MOC": "market_on_close",
    "LOC": "limit_on_close",
  };
  return map[ibkrType] || ibkrType.toLowerCase();
}

class IbkrSyncManager {
  private clients: Map<string, IbkrClient> = new Map();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log("[IBKR Sync] Starting sync manager...");

    await this.connectAll();

    this.syncInterval = setInterval(() => {
      this.syncAll().catch(err => {
        console.error("[IBKR Sync] Sync cycle error:", err.message);
      });
    }, 10000);

    await this.syncAll();
  }

  stop(): void {
    this.running = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    for (const [id, client] of this.clients) {
      client.disconnect();
      this.clients.delete(id);
    }
    console.log("[IBKR Sync] Stopped.");
  }

  async connectAll(): Promise<void> {
    const integrations = await storage.getIntegrations();
    const ibkrIntegrations = integrations.filter(i => i.type === "ibkr" && i.enabled);

    for (const integration of ibkrIntegrations) {
      if (!this.clients.has(integration.id)) {
        await this.connectOne(integration);
      }
    }

    for (const [id] of this.clients) {
      if (!ibkrIntegrations.find(i => i.id === id)) {
        this.clients.get(id)?.disconnect();
        this.clients.delete(id);
      }
    }
  }

  private async connectOne(integration: Integration): Promise<void> {
    const client = new IbkrClient(integration);
    try {
      await client.connect();
      this.clients.set(integration.id, client);
      await storage.updateIntegration(integration.id, { status: "connected" } as any);
      console.log(`[IBKR Sync] Connected integration ${integration.name} (${integration.id})`);
    } catch (err: any) {
      console.warn(`[IBKR Sync] Failed to connect ${integration.name}: ${err.message}`);
      await storage.updateIntegration(integration.id, { status: "disconnected" } as any);
    }
  }

  async reconnect(integrationId: string): Promise<void> {
    const existing = this.clients.get(integrationId);
    if (existing) {
      existing.disconnect();
      this.clients.delete(integrationId);
    }
    const integration = await storage.getIntegration(integrationId);
    if (integration && integration.type === "ibkr" && integration.enabled) {
      await this.connectOne(integration);
    }
  }

  async disconnectOne(integrationId: string): Promise<void> {
    const client = this.clients.get(integrationId);
    if (client) {
      client.disconnect();
      this.clients.delete(integrationId);
    }
    await storage.updateIntegration(integrationId, { status: "disconnected" } as any);
  }

  private async syncAll(): Promise<void> {
    for (const [integrationId, client] of this.clients) {
      if (!client.isConnected) {
        console.log(`[IBKR Sync] Skipping ${integrationId} - not connected`);
        continue;
      }
      try {
        await Promise.all([
          this.syncOrders(integrationId, client),
          this.syncPositions(integrationId, client),
        ]);
      } catch (err: any) {
        console.error(`[IBKR Sync] Error syncing ${integrationId}: ${err.message}`);
        if (err.message?.includes("disconnect") || err.message?.includes("socket")) {
          this.clients.delete(integrationId);
          await storage.updateIntegration(integrationId, { status: "disconnected" } as any);
        }
      }
    }
  }

  private mktDataReqCounter = 20000;
  private mktPriceUpdateRunning = false;

  private async syncOrders(integrationId: string, client: IbkrClient): Promise<void> {
    const openOrders = await client.fetchOpenOrders();

    const ordersToUpdate: { orderId: string; contract: any; data: InsertIbkrOrder }[] = [];

    for (const oo of openOrders) {
      const secType = oo.contract.secType || "STK";
      const existing = await storage.getIbkrOrderByOrderId(String(oo.orderId), integrationId);
      const completedTime = oo.orderState.completedTime
        ? parseIbkrTimestamp(oo.orderState.completedTime)
        : null;

      const orderData: InsertIbkrOrder = {
        integrationId,
        orderId: String(oo.orderId),
        symbol: oo.contract.symbol || "UNKNOWN",
        secType,
        expiration: oo.contract.lastTradeDateOrContractMonth || null,
        strike: secType === "OPT" ? (oo.contract.strike ?? null) : null,
        right: secType === "OPT" ? (oo.contract.right || null) : null,
        conId: oo.contract.conId ?? null,
        side: oo.order.action?.toLowerCase() === "sell" ? "sell" : "buy",
        orderType: mapOrderType(oo.order.orderType || "MKT"),
        quantity: oo.order.totalQuantity || 0,
        limitPrice: oo.order.lmtPrice ?? null,
        stopPrice: oo.order.auxPrice ?? null,
        filledQuantity: oo.order.filledQuantity ?? 0,
        avgFillPrice: null,
        lastPrice: existing?.lastPrice ?? null,
        status: mapOrderStatus(oo.orderState.status || "Submitted"),
        timeInForce: oo.order.tif || "DAY",
        commission: oo.orderState.commission != null && oo.orderState.commission < 1e9
          ? oo.orderState.commission : null,
        submittedAt: existing?.submittedAt ?? new Date(),
        filledAt: completedTime,
      };

      await storage.upsertIbkrOrder(String(oo.orderId), integrationId, orderData);
      ordersToUpdate.push({ orderId: String(oo.orderId), contract: oo.contract, data: orderData });
    }

    this.updateMarketPrices(integrationId, client).catch(err =>
      console.warn(`[IBKR Sync] Background market price update error: ${err.message}`)
    );
  }

  private async updateMarketPrices(integrationId: string, client: IbkrClient): Promise<void> {
    if (this.mktPriceUpdateRunning) return;
    this.mktPriceUpdateRunning = true;
    try {
      await this.doUpdateMarketPrices(integrationId, client);
    } finally {
      this.mktPriceUpdateRunning = false;
    }
  }

  private async doUpdateMarketPrices(integrationId: string, client: IbkrClient): Promise<void> {
    const allOrders = await storage.getIbkrOrdersByIntegration(integrationId);
    if (allOrders.length === 0) return;

    const contractMap = new Map<string, { contract: any; orderIds: string[] }>();
    for (const order of allOrders) {
      const key = order.conId
        ? `conId_${order.conId}`
        : `${order.symbol}_${order.secType}_${order.expiration || ""}_${order.strike || ""}_${order.right || ""}`;

      if (!contractMap.has(key)) {
        const contract: any = {
          symbol: order.symbol,
          secType: order.secType || "STK",
          exchange: "SMART",
          currency: "USD",
        };
        if (order.conId) contract.conId = order.conId;
        if (order.secType === "OPT") {
          contract.lastTradeDateOrContractMonth = order.expiration || "";
          contract.strike = order.strike || 0;
          contract.right = order.right || "";
        }
        contractMap.set(key, { contract, orderIds: [] });
      }
      contractMap.get(key)!.orderIds.push(order.orderId);
    }

    for (const [key, { contract, orderIds }] of contractMap) {
      try {
        const reqId = this.mktDataReqCounter++;
        const price = await client.fetchMarketPrice(contract, reqId);
        if (price != null) {
          console.log(`[IBKR Sync] Got price for ${contract.symbol}: $${price}`);
          for (const orderId of orderIds) {
            await storage.updateIbkrOrderPrice(orderId, integrationId, price);
          }
        }
      } catch (err: any) {
        console.warn(`[IBKR Sync] Market price fetch failed for ${contract.symbol}: ${err.message}`);
      }
    }
  }

  private pnlReqCounter = 10000;

  private async syncPositions(integrationId: string, client: IbkrClient): Promise<void> {
    const livePositions = await client.fetchPositions();

    await storage.deleteIbkrPositionsByIntegration(integrationId);

    const positionsToUpdate: { posKey: string; data: InsertIbkrPosition; account: string; conId: number | undefined }[] = [];

    for (const pos of livePositions) {
      if (pos.position === 0) continue;

      const symbol = pos.contract.symbol || "UNKNOWN";
      const secType = pos.contract.secType || "STK";
      const posKey = secType === "OPT"
        ? `${symbol}_${pos.contract.lastTradeDateOrContractMonth}_${pos.contract.strike}_${pos.contract.right}`
        : symbol;

      const posData: InsertIbkrPosition = {
        integrationId,
        symbol,
        secType,
        expiration: pos.contract.lastTradeDateOrContractMonth || null,
        strike: secType === "OPT" ? (pos.contract.strike ?? null) : null,
        right: secType === "OPT" ? (pos.contract.right || null) : null,
        conId: pos.contract.conId ?? null,
        quantity: pos.position,
        avgCost: pos.avgCost,
        marketPrice: null,
        marketValue: null,
        unrealizedPnl: null,
        realizedPnl: null,
        currency: pos.contract.currency || "USD",
        lastUpdated: new Date(),
      };

      await storage.upsertIbkrPosition(posKey, integrationId, posData);
      positionsToUpdate.push({ posKey, data: posData, account: pos.account, conId: pos.contract.conId });
    }

    for (const item of positionsToUpdate) {
      if (!item.conId) continue;
      try {
        const reqId = this.pnlReqCounter++;
        const pnl = await client.fetchPnLSingle(item.account, item.conId, reqId);
        if (pnl) {
          const marketPrice = item.data.quantity !== 0 && pnl.marketValue !== 0
            ? pnl.marketValue / item.data.quantity
            : null;
          await storage.upsertIbkrPosition(item.posKey, integrationId, {
            ...item.data,
            marketPrice,
            marketValue: pnl.marketValue,
            unrealizedPnl: pnl.unrealizedPnl,
            realizedPnl: pnl.realizedPnl,
          });
        }
      } catch (err: any) {
        console.warn(`[IBKR Sync] PnL fetch failed for ${item.data.symbol}: ${err.message}`);
      }
    }
  }

  getConnectionStatus(): Map<string, boolean> {
    const status = new Map<string, boolean>();
    for (const [id, client] of this.clients) {
      status.set(id, client.isConnected);
    }
    return status;
  }
}

export const ibkrSyncManager = new IbkrSyncManager();
