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

  if (instrumentType === "Options" || instrumentType === "LETF Option") {
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

  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    return { side: "BUY", exitSide: OrderAction.SELL };
  }

  const isBullish = direction === "Long";
  return {
    side: isBullish ? "BUY" : "SELL",
    exitSide: isBullish ? OrderAction.SELL : OrderAction.BUY,
  };
}

let tradeClientIdCounter = 200;
let initialNextValidId = 0;

async function connectIbkr(
  host: string,
  port: number,
  clientId: number,
): Promise<IBApi> {
  const uniqueClientId = clientId + tradeClientIdCounter++;
  if (tradeClientIdCounter > 999) tradeClientIdCounter = 200;
  const ib = new IBApi({ host, port, clientId: uniqueClientId });

  const result = await new Promise<{ connected: boolean; nextId: number }>((resolve) => {
    let isConnected = false;
    let nextId = 0;
    const timeout = setTimeout(() => resolve({ connected: isConnected, nextId }), 10000);

    ib.once(EventName.nextValidId, (orderId: number) => {
      nextId = orderId;
      if (isConnected) {
        clearTimeout(timeout);
        resolve({ connected: true, nextId });
      }
    });

    ib.once(EventName.connected, () => {
      isConnected = true;
      if (nextId > 0) {
        clearTimeout(timeout);
        resolve({ connected: true, nextId });
      }
    });

    ib.once(EventName.error, () => {
      clearTimeout(timeout);
      resolve({ connected: false, nextId: 0 });
    });

    ib.connect();
  });

  if (!result.connected) {
    try {
      ib.disconnect();
    } catch {}
    throw new Error(`Failed to connect to IBKR at ${host}:${port}`);
  }

  if (result.nextId > 0) {
    initialNextValidId = result.nextId;
    console.log(`[TradeExecutor] Connected to IBKR (clientId=${uniqueClientId}), initial nextValidId=${result.nextId}`);
  }

  return ib;
}

function contractsMatch(a: Contract, b: Contract): boolean {
  if (a.symbol !== b.symbol || a.secType !== b.secType) return false;
  if (a.secType === SecType.OPT) {
    return a.lastTradeDateOrContractMonth === b.lastTradeDateOrContractMonth
      && a.strike === b.strike
      && a.right === b.right;
  }
  return true;
}

async function cancelExistingOrders(ib: IBApi, contract: Contract): Promise<number> {
  return new Promise((resolve) => {
    const matchingOrderIds: number[] = [];
    const timeout = setTimeout(() => { cleanup(); cancelMatched(); }, 5000);

    const onOpenOrder = (orderId: number, orderContract: Contract) => {
      if (contractsMatch(contract, orderContract)) {
        matchingOrderIds.push(orderId);
      }
    };

    const onOpenOrderEnd = () => { clearTimeout(timeout); cleanup(); cancelMatched(); };

    const cleanup = () => {
      ib.off(EventName.openOrder, onOpenOrder);
      ib.off(EventName.openOrderEnd, onOpenOrderEnd);
    };

    const cancelMatched = () => {
      for (const oid of matchingOrderIds) {
        console.log(`[TradeExecutor] Cancelling existing order ${oid} for ${contract.symbol}`);
        ib.cancelOrder(oid);
      }
      if (matchingOrderIds.length > 0) {
        console.log(`[TradeExecutor] Cancelled ${matchingOrderIds.length} existing order(s) for ${contract.symbol}`);
      }
      resolve(matchingOrderIds.length);
    };

    ib.on(EventName.openOrder, onOpenOrder);
    ib.once(EventName.openOrderEnd, onOpenOrderEnd);
    ib.reqAllOpenOrders();
  });
}

let lastUsedOrderId = 0;

async function getNextOrderId(
  ib: IBApi,
  childCount: number = 0,
): Promise<number> {
  let ibkrId = initialNextValidId;

  if (ibkrId <= 0) {
    ibkrId = await new Promise<number>((resolve) => {
      const timeout = setTimeout(() => resolve(0), 5000);
      ib.once(EventName.nextValidId, (orderId: number) => {
        clearTimeout(timeout);
        resolve(orderId);
      });
      ib.reqIds();
    });
  } else {
    initialNextValidId = 0;
  }

  // Use IBKR's assigned order ID when available; they require using their sequence.
  const startId = ibkrId > 0 ? ibkrId : lastUsedOrderId + 1;
  lastUsedOrderId = Math.max(lastUsedOrderId, startId + childCount);
  console.log(`[TradeExecutor] Next order ID: ${startId} (from IBKR: ${ibkrId > 0 ? ibkrId : "reqIds"})`);
  return startId;
}

interface OrderStatusResult {
  status: string;
  filled: number;
  avgFillPrice: number;
  rejected?: boolean;
  rejectReason?: string;
}

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const day = et.getDay();
  const hour = et.getHours();
  const min = et.getMinutes();
  const timeInMinutes = hour * 60 + min;
  if (day === 0 || day === 6) return false;
  return timeInMinutes >= 9 * 60 + 30 && timeInMinutes < 16 * 60;
}

function waitForOrderStatus(
  ib: IBApi,
  orderId: number,
  allOrderIds: number[],
  timeoutMs: number = 15000,
): Promise<OrderStatusResult> {
  return new Promise((resolve, reject) => {
    const collectedErrors: string[] = [];
    const orderIdSet = new Set(allOrderIds);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ status: "SUBMITTED", filled: 0, avgFillPrice: 0 });
    }, timeoutMs);

    const doResolve = (result: OrderStatusResult) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      cleanup();
      resolve(result);
    };

    const onStatus = (
      oid: number,
      status: string,
      filled: number,
      _rem: number,
      avgFillPrice: number,
    ) => {
      if (oid !== orderId) return;
      if (status === "Filled") {
        doResolve({ status: "FILLED", filled, avgFillPrice });
      } else if (status === "PreSubmitted" || status === "Submitted") {
        if (!isMarketOpen()) {
          console.log(`[TradeExecutor] Order ${orderId} ${status} (market closed) — bracket accepted, queued for market open`);
          doResolve({ status: "PENDING_OPEN", filled: 0, avgFillPrice: 0 });
        } else {
          console.log(`[TradeExecutor] Order ${orderId} status: ${status}`);
        }
      } else if (status === "Inactive") {
        if (!isMarketOpen() && collectedErrors.length === 0) {
          console.log(`[TradeExecutor] Order ${orderId} Inactive (market closed) — bracket queued for market open`);
          doResolve({ status: "PENDING_OPEN", filled: 0, avgFillPrice: 0 });
        } else {
          const reason = collectedErrors.length > 0
            ? collectedErrors.join(" | ")
            : "Order rejected by IBKR — check margin, trading permissions, or contract validity";
          console.error(`[TradeExecutor] Order ${orderId} Inactive (REJECTED). Errors: ${reason}`);
          doResolve({ status: "REJECTED", filled: 0, avgFillPrice: 0, rejected: true, rejectReason: reason });
        }
      } else if (status === "Cancelled" || status === "ApiCancelled") {
        const reason =
          collectedErrors.length > 0
            ? `Order cancelled: ${collectedErrors.join(" | ")}`
            : `Order ${oid} was cancelled`;
        doResolve({
          status: "CANCELLED",
          filled: 0,
          avgFillPrice: 0,
          rejected: true,
          rejectReason: reason,
        });
      } else if (status === "PreSubmitted" || status === "Submitted") {
        console.log(`[TradeExecutor] Order ${orderId} status: ${status}`);
      }
    };

    const onError = (err: Error, code: number, reqId: number) => {
      if (!orderIdSet.has(reqId) && reqId !== -1) return;

      if (code === 399) {
        console.log(`[TradeExecutor] Order ${reqId} info: ${err.message}`);
        return;
      }

      const reason = buildRejectReason(code, err.message);
      console.error(
        `[TradeExecutor] Order ${reqId} error: code=${code}, ${reason}`,
      );
      collectedErrors.push(`[Order ${reqId}] ${reason}`);

      if (isOrderRejectCode(code)) {
        doResolve({
          status: "REJECTED",
          filled: 0,
          avgFillPrice: 0,
          rejected: true,
          rejectReason: collectedErrors.join(" | "),
        });
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
    103, 104, 105, 106, 107, 109, 110, 111, 113, 116, 117, 118, 119, 120, 121,
    122, 123, 124, 125, 126, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140,
    141, 142, 143, 144, 145, 146, 147, 148, 151, 152, 153, 154, 155, 156, 157,
    158, 159, 160, 161, 163, 164, 165, 166, 167, 168, 169, 170, 171, 200, 201,
    202, 203, 309, 312, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 347,
    364, 404, 405, 406, 407, 408, 417, 418, 419, 420, 421, 422, 10003, 10005,
    10006, 10007, 10008, 10009, 10010, 10011, 10012, 10013, 10014, 10020, 10021,
    10022, 10023, 10024, 10025, 10026, 10027,
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
  const { side } = determineSide(data);
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
    const contract = buildContract(data);

    const cancelled = await cancelExistingOrders(ib, contract);
    if (cancelled > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }

    const entryOrderId = await getNextOrderId(ib, 0);
    const secType = contract.secType === SecType.OPT ? "OPT" : "STK";
    const instrumentType = data.instrument_type || "Shares";
    const rightVal =
      (instrumentType === "Options" || instrumentType === "LETF Option")
        ? data.direction === "Put"
          ? "P"
          : "C"
        : null;

    const entryOrder: any = {
      action: side === "BUY" ? OrderAction.BUY : OrderAction.SELL,
      orderType: OrderType.MKT,
      totalQuantity: quantity,
      tif: TimeInForce.DAY,
      transmit: true,
    };

    console.log(
      `[TradeExecutor] Placing entry order: ${side} ${quantity} ${ticker} @ MKT (orderId=${entryOrderId})`,
    );
    ib.placeOrder(entryOrderId, contract, entryOrder);

    const parentStatus = await waitForOrderStatus(
      ib,
      entryOrderId,
      [entryOrderId],
    );

    if (parentStatus.rejected) {
      const reason = parentStatus.rejectReason || "Unknown rejection reason";
      console.error(`[TradeExecutor] Order REJECTED for ${ticker}: ${reason}`);

      storage
        .upsertIbkrOrder(String(entryOrderId), ibkrIntegration.id, {
          integrationId: ibkrIntegration.id,
          signalId: signal.id,
          orderId: String(entryOrderId),
          symbol: ticker,
          secType,
          expiration: data.expiration || null,
          strike: data.strike ? Number(data.strike) : null,
          right: rightVal,
          conId: null,
          side: side.toLowerCase(),
          orderType: "market",
          quantity,
          stopPrice: null,
          filledQuantity: 0,
          avgFillPrice: null,
          lastPrice: null,
          status: "rejected",
          timeInForce: "DAY",
          commission: null,
          rejectReason: reason,
          submittedAt: new Date(),
          filledAt: null,
          sourceAppId: app.id,
          sourceAppName: app.name,
        })
        .catch(() => {});

      storage
        .createActivity({
          type: "trade_error",
          title: `IBKR order rejected: ${side} ${ticker}`,
          description: reason,
          symbol: ticker,
          signalId: signal.id,
          metadata: {
            orderId: entryOrderId,
            status: parentStatus.status,
            rejectReason: reason,
            sourceApp: app.name,
          },
        })
        .catch(() => {});

      return { executed: false, trade: null, error: reason };
    }

    const result: TradeResult = {
      orderId: entryOrderId,
      status: parentStatus.status,
      symbol: ticker,
      side,
      quantity: parentStatus.filled || quantity,
      avgFillPrice: parentStatus.avgFillPrice || undefined,
      childOrders: [],
    };

    await storage.upsertIbkrOrder(String(entryOrderId), ibkrIntegration.id, {
      integrationId: ibkrIntegration.id,
      signalId: signal.id,
      orderId: String(entryOrderId),
      symbol: ticker,
      secType,
      expiration: data.expiration || null,
      strike: data.strike ? Number(data.strike) : null,
      right: rightVal,
      conId: null,
      side: side.toLowerCase(),
      orderType: "market",
      quantity,
      stopPrice: null,
      filledQuantity: parentStatus.filled || 0,
      avgFillPrice: parentStatus.avgFillPrice || null,
      lastPrice: null,
      status:
        parentStatus.status === "FILLED"
          ? "filled"
          : parentStatus.status === "PENDING_OPEN"
            ? "pending"
            : "submitted",
      timeInForce: "DAY",
      commission: null,
      submittedAt: new Date(),
      filledAt: parentStatus.status === "FILLED" ? new Date() : null,
      sourceAppId: app.id,
      sourceAppName: app.name,
    });

    const isPending = parentStatus.status === "PENDING_OPEN";
    const statusLabel = isPending ? "PENDING (market closed)" : result.status;
    console.log(
      `[TradeExecutor] Entry order placed: ${result.orderId} ${statusLabel} for ${ticker}`,
    );

    storage
      .createActivity({
        type: isPending ? "trade_pending" : "trade_executed",
        title: isPending
          ? `IBKR bracket queued: ${side} ${ticker} (market closed)`
          : `IBKR bracket trade: ${side} ${ticker}`,
        description: `Entry #${result.orderId} ${statusLabel} - ${side} ${result.quantity} ${ticker}`,
        symbol: ticker,
        signalId: signal.id,
        metadata: {
          orderId: result.orderId,
          status: result.status,
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

export interface IbkrCloseResult {
  executed: boolean;
  orderId?: number;
  quantity?: number;
  error: string | null;
}

/**
 * Place a market order to close the position for a signal (opposite side of entry).
 * Uses filled entry order quantity for the signal. No-op if no filled position.
 */
export async function executeIbkrClose(
  signal: Signal,
  app: ConnectedApp | null,
): Promise<IbkrCloseResult> {
  if (!app) {
    return { executed: false, error: "No connected app provided" };
  }
  if (!app.executeIbkrTrades) {
    return { executed: false, error: `IBKR execution disabled for ${app.name}` };
  }

  const data = signal.data as Record<string, any>;
  const ticker = data.ticker;
  if (!ticker) return { executed: false, error: "Signal has no ticker" };

  const orders = await storage.getIbkrOrdersBySignal(signal.id);
  const filledEntries = orders.filter(
    (o) => o.status === "filled" && o.orderType === "market",
  );
  const totalQuantity = filledEntries.reduce(
    (sum, o) => sum + (o.filledQuantity ?? o.quantity ?? 0),
    0,
  );
  if (totalQuantity <= 0) {
    return { executed: false, error: "No filled position to close for this signal" };
  }

  const { exitSide } = determineSide(data);
  const integrations = await storage.getIntegrations();
  const ibkrIntegration = integrations.find(
    (i) => i.type === "ibkr" && i.enabled,
  );
  if (!ibkrIntegration) {
    return { executed: false, error: "No enabled IBKR integration found" };
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
  const isOption = data.instrument_type === "Options" || data.instrument_type === "LETF Option";
  const secType = isOption ? "OPT" : "STK";
  const rightVal =
    isOption
      ? data.direction === "Put"
        ? "P"
        : "C"
      : null;

  try {
    ib = await connectIbkr(host, port, clientId);
    const contract = buildContract(data);
    const closeOrderId = await getNextOrderId(ib, 0);

    const closeOrder: any = {
      action: exitSide,
      orderType: OrderType.MKT,
      totalQuantity,
      tif: TimeInForce.DAY,
      transmit: true,
    };

    console.log(
      `[TradeExecutor] Placing close order: ${exitSide} ${totalQuantity} ${ticker} @ MKT (orderId=${closeOrderId})`,
    );
    ib.placeOrder(closeOrderId, contract, closeOrder);

    const statusResult = await waitForOrderStatus(
      ib,
      closeOrderId,
      [closeOrderId],
    );

    await storage.upsertIbkrOrder(String(closeOrderId), ibkrIntegration.id, {
      integrationId: ibkrIntegration.id,
      signalId: signal.id,
      orderId: String(closeOrderId),
      symbol: ticker,
      secType,
      expiration: data.expiration || null,
      strike: data.strike ? Number(data.strike) : null,
      right: rightVal,
      conId: null,
      side: exitSide === OrderAction.SELL ? "sell" : "buy",
      orderType: "market",
      quantity: totalQuantity,
      stopPrice: null,
      filledQuantity: statusResult.filled || 0,
      avgFillPrice: statusResult.avgFillPrice || null,
      lastPrice: null,
      status:
        statusResult.status === "FILLED"
          ? "filled"
          : statusResult.status === "PENDING_OPEN"
            ? "pending"
            : statusResult.rejected
              ? "rejected"
              : "submitted",
      timeInForce: "DAY",
      commission: null,
      rejectReason: statusResult.rejected ? (statusResult.rejectReason || "Unknown rejection reason") : null,
      submittedAt: new Date(),
      filledAt: statusResult.status === "FILLED" ? new Date() : null,
      sourceAppId: app.id,
      sourceAppName: app.name,
    });

    if (statusResult.rejected) {
      console.error(
        `[TradeExecutor] Close order rejected for ${ticker}: ${statusResult.rejectReason}`,
      );
      return {
        executed: false,
        orderId: closeOrderId,
        quantity: totalQuantity,
        error: statusResult.rejectReason || "Order rejected",
      };
    }

    console.log(
      `[TradeExecutor] Close order placed: ${closeOrderId} ${statusResult.status} for ${ticker}`,
    );
    return {
      executed: true,
      orderId: closeOrderId,
      quantity: totalQuantity,
      error: null,
    };
  } catch (err: any) {
    console.error(`[TradeExecutor] Close order error: ${err.message}`);
    return { executed: false, error: err.message };
  } finally {
    if (ib) {
      try {
        ib.disconnect();
      } catch {}
    }
  }
}
