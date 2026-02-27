import { IBApi, EventName, Contract, SecType, OrderAction, OrderType, TimeInForce, OptionType } from "@stoqey/ib";
import type { Signal, ConnectedApp } from "@shared/schema";
import { ibkrSyncManager } from "./ibkr-sync";
import { storage } from "../storage";

interface TradeResult {
  orderId: number;
  status: string;
  symbol: string;
  side: string;
  quantity: number;
  avgFillPrice?: number;
}

function makeStockContract(symbol: string): Contract {
  return {
    symbol,
    secType: SecType.STK,
    exchange: "SMART",
    currency: "USD",
  };
}

function makeOptionContract(
  symbol: string,
  expiration: string,
  strike: number,
  right: string,
): Contract {
  return {
    symbol,
    secType: SecType.OPT,
    exchange: "SMART",
    currency: "USD",
    lastTradeDateOrContractMonth: expiration.replace(/-/g, ""),
    strike,
    right: right.toUpperCase() === "C" || right.toUpperCase() === "CALL"
      ? OptionType.Call
      : OptionType.Put,
    multiplier: 100,
  };
}

function buildContract(data: Record<string, any>): Contract {
  const symbol = data.ticker;
  const instrumentType = data.instrument_type || "Shares";

  if (instrumentType === "Options") {
    return makeOptionContract(
      symbol,
      data.expiration || "",
      Number(data.strike) || 0,
      data.right || "C",
    );
  }

  return makeStockContract(symbol);
}

export async function executeIbkrTrade(
  signal: Signal,
  app: ConnectedApp,
  quantity: number = 1,
): Promise<TradeResult | null> {
  const data = signal.data as Record<string, any>;
  const ticker = data.ticker;
  const direction = data.direction || "Long";
  const side = direction === "Long" ? "BUY" : "SELL";

  const ibkrHost = app.ibkrHost;
  const ibkrPort = app.ibkrPort ? parseInt(app.ibkrPort) : undefined;
  const ibkrClientId = app.ibkrClientId ? parseInt(app.ibkrClientId) : undefined;

  let ib: IBApi | null = null;

  const integrations = await storage.getIntegrations();
  const ibkrIntegration = integrations.find(i => i.type === "ibkr" && i.enabled);

  if (!ibkrIntegration) {
    console.warn("[TradeExecutor] No enabled IBKR integration found");
    return null;
  }

  const cfg = ibkrIntegration.config as Record<string, any>;
  const host = ibkrHost || cfg?.host || "127.0.0.1";
  const port = ibkrPort || Number(cfg?.port) || 4003;
  const clientId = ibkrClientId || Number(cfg?.clientId) || 0;

  ib = new IBApi({ host, port, clientId: clientId + 100 });

  try {
    const connected = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 10000);

      ib!.once(EventName.connected, () => {
        clearTimeout(timeout);
        resolve(true);
      });

      ib!.once(EventName.error, () => {
        clearTimeout(timeout);
        resolve(false);
      });

      ib!.connect();
    });

    if (!connected) {
      console.warn(`[TradeExecutor] Failed to connect to IBKR at ${host}:${port}`);
      return null;
    }

    const nextOrderId = await new Promise<number>((resolve) => {
      const timeout = setTimeout(() => resolve(Date.now() % 100000), 5000);
      ib!.once(EventName.nextValidId, (orderId: number) => {
        clearTimeout(timeout);
        resolve(orderId);
      });
    });

    const contract = buildContract(data);

    const order = {
      action: side === "BUY" ? OrderAction.BUY : OrderAction.SELL,
      orderType: OrderType.MKT,
      totalQuantity: quantity,
      tif: TimeInForce.DAY,
      transmit: true,
    };

    console.log(`[TradeExecutor] Placing ${side} ${quantity} ${ticker} (orderId=${nextOrderId})`);

    const result = await new Promise<TradeResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve({
          orderId: nextOrderId,
          status: "SUBMITTED",
          symbol: ticker,
          side,
          quantity,
        });
      }, 15000);

      ib!.on(EventName.orderStatus, (
        orderId: number,
        status: string,
        filled: number,
        _remaining: number,
        avgFillPrice: number,
      ) => {
        if (orderId !== nextOrderId) return;

        if (status === "Filled") {
          clearTimeout(timeout);
          resolve({
            orderId,
            status: "FILLED",
            symbol: ticker,
            side,
            quantity: filled,
            avgFillPrice,
          });
        } else if (status === "Cancelled" || status === "ApiCancelled") {
          clearTimeout(timeout);
          reject(new Error(`Order ${orderId} was cancelled`));
        }
      });

      ib!.placeOrder(nextOrderId, contract, order);
    });

    const secType = contract.secType === SecType.OPT ? "OPT" : "STK";
    await storage.upsertIbkrOrder(String(result.orderId), ibkrIntegration.id, {
      integrationId: ibkrIntegration.id,
      signalId: signal.id,
      orderId: String(result.orderId),
      symbol: ticker,
      secType,
      expiration: data.expiration || null,
      strike: data.strike ? Number(data.strike) : null,
      right: data.right || null,
      conId: null,
      side: side.toLowerCase(),
      orderType: "market",
      quantity,
      limitPrice: null,
      stopPrice: null,
      filledQuantity: result.avgFillPrice ? quantity : 0,
      avgFillPrice: result.avgFillPrice || null,
      lastPrice: null,
      status: result.status === "FILLED" ? "filled" : "submitted",
      timeInForce: "DAY",
      commission: null,
      submittedAt: new Date(),
      filledAt: result.status === "FILLED" ? new Date() : null,
      sourceAppId: app.id,
      sourceAppName: app.name,
    });

    console.log(`[TradeExecutor] Order ${result.orderId} ${result.status} for ${ticker}`);
    return result;
  } catch (err: any) {
    console.error(`[TradeExecutor] Trade execution error: ${err.message}`);
    return null;
  } finally {
    if (ib) {
      try { ib.disconnect(); } catch {}
    }
  }
}
