import {
  IBApi,
  EventName,
  Contract,
  SecType,
  OrderAction,
  OrderType,
  TimeInForce,
  OptionType,
} from "@stoqey/ib";
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
  childOrders?: {
    orderId: number;
    type: string;
    price: number;
    quantity: number;
  }[];
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
    right:
      right.toUpperCase() === "C" || right.toUpperCase() === "CALL"
        ? OptionType.Call
        : OptionType.Put,
    multiplier: 100,
  };
}

function buildContract(data: Record<string, any>): Contract {
  const symbol = data.ticker;
  const instrumentType = data.instrument_type || "Shares";

  if (instrumentType === "Options") {
    const right = data.direction === "Put" ? "P" : "C";
    return makeOptionContract(
      symbol,
      data.expiration || "",
      Number(data.strike) || 0,
      right,
    );
  }

  return makeStockContract(symbol);
}

export interface TradeExecutionResult {
  executed: boolean;
  trade: TradeResult | null;
  error: string | null;
}

interface TargetInfo {
  key: string;
  price: number;
  takeOffPercent: number;
  raiseStopLoss?: number;
}

function parseTargets(data: Record<string, any>): TargetInfo[] {
  if (!data.targets || typeof data.targets !== "object") return [];
  return Object.entries(data.targets)
    .filter(([, val]) => (val as any)?.price)
    .map(([key, val]) => {
      const t = val as any;
      return {
        key,
        price: Number(t.price),
        takeOffPercent: Number(t.take_off_percent) || 100,
        raiseStopLoss: t.raise_stop_loss?.price
          ? Number(t.raise_stop_loss.price)
          : undefined,
      };
    });
}

function splitQuantityByTargets(
  totalQty: number,
  targets: TargetInfo[],
): number[] {
  if (targets.length === 0) return [];
  const quantities: number[] = [];
  let remaining = totalQty;
  for (let i = 0; i < targets.length; i++) {
    const pct = targets[i].takeOffPercent / 100;
    const qty =
      i === targets.length - 1
        ? remaining
        : Math.max(1, Math.round(remaining * pct));
    quantities.push(Math.min(qty, remaining));
    remaining -= quantities[i];
    if (remaining <= 0) break;
  }
  return quantities;
}

function determineSide(data: Record<string, any>): {
  side: string;
  exitSide: OrderAction;
} {
  const instrumentType = data.instrument_type || "Shares";
  const direction = data.direction || "Long";

  if (instrumentType === "Options") {
    return { side: "BUY", exitSide: OrderAction.SELL };
  }

  const isBullish = direction === "Long";
  return {
    side: isBullish ? "BUY" : "SELL",
    exitSide: isBullish ? OrderAction.SELL : OrderAction.BUY,
  };
}

let tradeClientIdCounter = 200;

async function connectIbkr(
  host: string,
  port: number,
  clientId: number,
): Promise<IBApi> {
  const uniqueClientId = clientId + tradeClientIdCounter++;
  if (tradeClientIdCounter > 999) tradeClientIdCounter = 200;
  const ib = new IBApi({ host, port, clientId: uniqueClientId });

  const connected = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 10000);
    ib.once(EventName.connected, () => {
      clearTimeout(timeout);
      resolve(true);
    });
    ib.once(EventName.error, () => {
      clearTimeout(timeout);
      resolve(false);
    });
    ib.connect();
  });

  if (!connected) {
    try {
      ib.disconnect();
    } catch {}
    throw new Error(`Failed to connect to IBKR at ${host}:${port}`);
  }

  return ib;
}

async function getNextOrderId(ib: IBApi): Promise<number> {
  return new Promise<number>((resolve) => {
    const timeout = setTimeout(() => resolve(Date.now() % 100000), 5000);
    ib.once(EventName.nextValidId, (orderId: number) => {
      clearTimeout(timeout);
      resolve(orderId);
    });
  });
}

interface OrderStatusResult {
  status: string;
  filled: number;
  avgFillPrice: number;
  rejected?: boolean;
  rejectReason?: string;
}

function waitForOrderStatus(
  ib: IBApi,
  orderId: number,
  timeoutMs: number = 15000,
): Promise<OrderStatusResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve({ status: "SUBMITTED", filled: 0, avgFillPrice: 0 });
    }, timeoutMs);

    const onStatus = (
      oid: number,
      status: string,
      filled: number,
      _rem: number,
      avgFillPrice: number,
    ) => {
      if (oid !== orderId) return;
      if (status === "Filled") {
        clearTimeout(timeout);
        cleanup();
        resolve({ status: "FILLED", filled, avgFillPrice });
      } else if (status === "Inactive") {
        clearTimeout(timeout);
        cleanup();
        resolve({ status: "REJECTED", filled: 0, avgFillPrice: 0, rejected: true, rejectReason: "Order went inactive — likely rejected by IBKR. Check margin, permissions, or contract validity." });
      } else if (status === "Cancelled" || status === "ApiCancelled") {
        clearTimeout(timeout);
        cleanup();
        resolve({ status: "CANCELLED", filled: 0, avgFillPrice: 0, rejected: true, rejectReason: `Order ${oid} was cancelled` });
      }
    };

    const onError = (err: Error, code: number, reqId: number) => {
      if (reqId !== orderId && reqId !== -1) return;

      if (code === 399) {
        console.log(`[TradeExecutor] Order ${orderId} info: ${err.message}`);
        return;
      }

      const reason = buildRejectReason(code, err.message);
      console.error(`[TradeExecutor] Order ${orderId} rejected: code=${code}, msg=${err.message}`);

      if (isOrderRejectCode(code)) {
        clearTimeout(timeout);
        cleanup();
        resolve({ status: "REJECTED", filled: 0, avgFillPrice: 0, rejected: true, rejectReason: reason });
      }
    };

    const cleanup = () => {
      ib.off(EventName.orderStatus, onStatus);
      ib.off(EventName.error, onError);
    };
    ib.on(EventName.orderStatus, onStatus);
    ib.on(EventName.error, onError);
  });
}

function isOrderRejectCode(code: number): boolean {
  const rejectCodes = [
    103, 104, 105, 106, 107, 109, 110, 111, 113,
    116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126,
    131, 132, 133, 134, 135, 136, 137, 138, 139, 140,
    141, 142, 143, 144, 145, 146, 147, 148, 151, 152,
    153, 154, 155, 156, 157, 158, 159, 160, 161,
    163, 164, 165, 166, 167, 168, 169, 170, 171,
    200, 201, 202, 203, 309, 312, 321, 322, 323,
    324, 325, 326, 327, 328, 329, 330, 347, 364,
    404, 405, 406, 407, 408, 417, 418, 419, 420, 421, 422,
    10003, 10005, 10006, 10007, 10008, 10009, 10010, 10011, 10012,
    10013, 10014, 10020, 10021, 10022, 10023, 10024, 10025, 10026, 10027,
  ];
  return rejectCodes.includes(code);
}

function buildRejectReason(code: number, message: string): string {
  const codeReasons: Record<number, string> = {
    103: "Duplicate order ID",
    104: "Cannot modify a filled order",
    105: "Order being modified does not match original",
    110: "Price is below minimum variation",
    116: "Market order not allowed — use limit order instead",
    131: "Order would exceed position limit",
    132: "Order would exceed account margin",
    133: "Order would be submitted to exchange outside trading hours",
    135: "Cannot cancel order — already filled or cancelled",
    136: "Cannot find order to cancel or modify",
    161: "Cancel attempted — order not cancelled (may be filled)",
    200: "Contract not found — check ticker, expiration, strike, or right",
    201: "Order rejected — insufficient margin or buying power",
    202: "Order cancelled by user or system",
    203: "Security not available for trading",
    309: "Max number of orders for this contract has been reached",
    399: "Order info/warning — not a rejection",
    404: "Order held — no matching entry order",
    405: "Order held — contract not available",
    417: "Order rejected — account not approved for this product",
    421: "Order rejected — account not approved for short selling",
    10003: "Order size exceeds the max allowed",
    10005: "Order price exceeds the max or min allowed",
    10006: "Order rejected — outside regular trading hours",
    10020: "Order rejected — insufficient shares available for short sale",
    10021: "Order rejected — no margin permission",
  };

  const knownReason = codeReasons[code];
  if (knownReason) return `[${code}] ${knownReason}: ${message}`;
  return `[${code}] ${message}`;
}

export async function executeIbkrTrade(
  signal: Signal,
  app: ConnectedApp | null,
  quantity: number = 100,
): Promise<TradeExecutionResult> {
  if (!app) {
    return { executed: false, trade: null, error: "No connected app provided" };
  }
  if (!app.executeIbkrTrades) {
    return {
      executed: false,
      trade: null,
      error: `IBKR trade execution disabled for ${app.name}`,
    };
  }

  const data = signal.data as Record<string, any>;
  const ticker = data.ticker;
  const { side, exitSide } = determineSide(data);
  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const stopLoss = data.stop_loss ? Number(data.stop_loss) : null;
  const targets = parseTargets(data);

  const integrations = await storage.getIntegrations();
  const ibkrIntegration = integrations.find(
    (i) => i.type === "ibkr" && i.enabled,
  );

  if (!ibkrIntegration) {
    return {
      executed: false,
      trade: null,
      error: "No enabled IBKR integration found",
    };
  }

  const cfg = ibkrIntegration.config as Record<string, any>;
  const host = app.ibkrHost || cfg?.host || "127.0.0.1";
  const port =
    (app.ibkrPort ? parseInt(app.ibkrPort) : null) || Number(cfg?.port) || 4003;
  const clientId =
    (app.ibkrClientId ? parseInt(app.ibkrClientId) : null) ||
    Number(cfg?.clientId) ||
    0;

  let ib: IBApi | null = null;

  try {
    ib = await connectIbkr(host, port, clientId);
    const parentOrderId = await getNextOrderId(ib);
    const contract = buildContract(data);
    const secType = contract.secType === SecType.OPT ? "OPT" : "STK";
    const instrumentType = data.instrument_type || "Shares";
    const rightVal =
      instrumentType === "Options"
        ? data.direction === "Put"
          ? "P"
          : "C"
        : null;

    const hasChildren = (targets.length > 0 && entryPrice) || stopLoss;

    const parentOrder: any = {
      action: side === "BUY" ? OrderAction.BUY : OrderAction.SELL,
      orderType: OrderType.MKT,
      totalQuantity: quantity,
      tif: TimeInForce.DAY,
      transmit: !hasChildren,
    };

    console.log(
      `[TradeExecutor] Placing bracket: ${side} ${quantity} ${ticker} @ ${entryPrice ? `$${entryPrice}` : "MKT"} (parentId=${parentOrderId})`,
    );
    ib.placeOrder(parentOrderId, contract, parentOrder);

    const childOrders: {
      orderId: number;
      type: string;
      price: number;
      quantity: number;
    }[] = [];
    let nextId = parentOrderId + 1;

    const tpQuantities = splitQuantityByTargets(quantity, targets);
    for (let i = 0; i < targets.length; i++) {
      if (i >= tpQuantities.length || tpQuantities[i] <= 0) continue;
      const tp = targets[i];
      const isLast = !stopLoss && i === targets.length - 1;

      const tpOrder: any = {
        action: exitSide,
        orderType: OrderType.LMT,
        totalQuantity: tpQuantities[i],
        lmtPrice: tp.price,
        parentId: parentOrderId,
        tif: TimeInForce.GTC,
        transmit: isLast,
      };

      const exitLabel = exitSide === OrderAction.BUY ? "BUY" : "SELL";
      console.log(
        `[TradeExecutor]   TP${i + 1}: LMT ${exitLabel} ${tpQuantities[i]} @ $${tp.price} (orderId=${nextId})`,
      );
      ib.placeOrder(nextId, contract, tpOrder);
      childOrders.push({
        orderId: nextId,
        type: `TP${i + 1}`,
        price: tp.price,
        quantity: tpQuantities[i],
      });
      nextId++;
    }

    if (stopLoss) {
      const slOrder: any = {
        action: exitSide,
        orderType: OrderType.STP,
        totalQuantity: quantity,
        auxPrice: stopLoss,
        parentId: parentOrderId,
        tif: TimeInForce.GTC,
        transmit: true,
      };

      const exitLabel = exitSide === OrderAction.BUY ? "BUY" : "SELL";
      console.log(
        `[TradeExecutor]   SL: STP ${exitLabel} ${quantity} @ $${stopLoss} (orderId=${nextId})`,
      );
      ib.placeOrder(nextId, contract, slOrder);
      childOrders.push({
        orderId: nextId,
        type: "SL",
        price: stopLoss,
        quantity,
      });
      nextId++;
    }

    const parentStatus = await waitForOrderStatus(ib, parentOrderId);

    if (parentStatus.rejected) {
      const reason = parentStatus.rejectReason || "Unknown rejection reason";
      console.error(`[TradeExecutor] Order REJECTED for ${ticker}: ${reason}`);

      storage.upsertIbkrOrder(String(parentOrderId), ibkrIntegration.id, {
        integrationId: ibkrIntegration.id,
        signalId: signal.id,
        orderId: String(parentOrderId),
        symbol: ticker,
        secType,
        expiration: data.expiration || null,
        strike: data.strike ? Number(data.strike) : null,
        right: rightVal,
        conId: null,
        side: side.toLowerCase(),
        orderType: entryPrice ? "limit" : "market",
        quantity,
        entryPrice: entryPrice ? String(entryPrice) : null,
        stopPrice: null,
        filledQuantity: 0,
        avgFillPrice: null,
        lastPrice: null,
        status: "rejected",
        timeInForce: "DAY",
        commission: null,
        submittedAt: new Date(),
        filledAt: null,
        sourceAppId: app.id,
        sourceAppName: app.name,
      }).catch(() => {});

      storage.createActivity({
        type: "trade_error",
        title: `IBKR order rejected: ${side} ${ticker}`,
        description: reason,
        symbol: ticker,
        signalId: signal.id,
        metadata: { orderId: parentOrderId, status: parentStatus.status, rejectReason: reason, sourceApp: app.name },
      }).catch(() => {});

      return { executed: false, trade: null, error: reason };
    }

    const result: TradeResult = {
      orderId: parentOrderId,
      status: parentStatus.status,
      symbol: ticker,
      side,
      quantity: parentStatus.filled || quantity,
      avgFillPrice: parentStatus.avgFillPrice || undefined,
      childOrders,
    };

    await storage.upsertIbkrOrder(String(parentOrderId), ibkrIntegration.id, {
      integrationId: ibkrIntegration.id,
      signalId: signal.id,
      orderId: String(parentOrderId),
      symbol: ticker,
      secType,
      expiration: data.expiration || null,
      strike: data.strike ? Number(data.strike) : null,
      right: rightVal,
      conId: null,
      side: side.toLowerCase(),
      orderType: entryPrice ? "limit" : "market",
      quantity,
      entryPrice: entryPrice ? String(entryPrice) : null,
      stopPrice: null,
      filledQuantity: parentStatus.filled || 0,
      avgFillPrice: parentStatus.avgFillPrice || null,
      lastPrice: null,
      status: parentStatus.status === "FILLED" ? "filled" : "submitted",
      timeInForce: "DAY",
      commission: null,
      submittedAt: new Date(),
      filledAt: parentStatus.status === "FILLED" ? new Date() : null,
      sourceAppId: app.id,
      sourceAppName: app.name,
    });

    for (const child of childOrders) {
      await storage.upsertIbkrOrder(String(child.orderId), ibkrIntegration.id, {
        integrationId: ibkrIntegration.id,
        signalId: signal.id,
        orderId: String(child.orderId),
        symbol: ticker,
        secType,
        expiration: data.expiration || null,
        strike: data.strike ? Number(data.strike) : null,
        right: rightVal,
        conId: null,
        side: exitSide === OrderAction.BUY ? "buy" : "sell",
        orderType: child.type === "SL" ? "stop" : "limit",
        quantity: child.quantity,
        limitPrice: child.type !== "SL" ? String(child.price) : null,
        stopPrice: child.type === "SL" ? String(child.price) : null,
        filledQuantity: 0,
        avgFillPrice: null,
        lastPrice: null,
        status: "submitted",
        timeInForce: "GTC",
        commission: null,
        submittedAt: new Date(),
        filledAt: null,
        sourceAppId: app.id,
        sourceAppName: app.name,
      });
    }

    const orderSummary = childOrders
      .map((c) => `${c.type}@$${c.price}`)
      .join(", ");
    console.log(
      `[TradeExecutor] Bracket placed: ${result.orderId} ${result.status} for ${ticker} [${orderSummary}]`,
    );

    storage
      .createActivity({
        type: "trade_executed",
        title: `IBKR bracket trade: ${side} ${ticker}`,
        description: `Entry #${result.orderId} ${result.status} - ${side} ${result.quantity} ${ticker}${orderSummary ? ` | ${orderSummary}` : ""}`,
        symbol: ticker,
        signalId: signal.id,
        metadata: {
          orderId: result.orderId,
          status: result.status,
          childOrders,
          sourceApp: app.name,
        },
      })
      .catch(() => {});

    return { executed: true, trade: result, error: null };
  } catch (err: any) {
    console.error(`[TradeExecutor] Trade execution error: ${err.message}`);

    storage
      .createActivity({
        type: "trade_error",
        title: `IBKR trade failed for ${ticker}`,
        description: `IBKR trade execution failed: ${err.message}`,
        symbol: ticker,
        signalId: signal.id,
        metadata: { sourceApp: app.name, error: err.message },
      })
      .catch(() => {});

    return { executed: false, trade: null, error: err.message };
  } finally {
    if (ib) {
      try {
        ib.disconnect();
      } catch {}
    }
  }
}
