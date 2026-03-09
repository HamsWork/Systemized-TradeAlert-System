import { IBApi, EventName, Contract, Order, OrderState, IBApiTickType, MarketDataType, BarSizeSetting } from "@stoqey/ib";
import type { Integration } from "@shared/schema";

export interface IbkrConnectionConfig {
  host: string;
  port: number;
  clientId: number;
}

export interface IbkrOpenOrder {
  orderId: number;
  contract: Contract;
  order: Order;
  orderState: OrderState;
}

export interface IbkrOrderStatus {
  orderId: number;
  status: string;
  filled: number;
  remaining: number;
  avgFillPrice: number;
  lastFillPrice: number;
  whyHeld: string;
}

export interface IbkrPosition {
  account: string;
  contract: Contract;
  position: number;
  avgCost: number;
}

export type OrderStatusCallback = (data: {
  orderId: number;
  status: string;
  filled: number;
  remaining: number;
  avgFillPrice: number;
  lastFillPrice: number;
  whyHeld: string;
}) => void;

export class IbkrClient {
  private ib: IBApi;
  private connected = false;
  private integrationId: string;
  private config: IbkrConnectionConfig;
  private orderStatusCallbacks: OrderStatusCallback[] = [];

  constructor(integration: Integration) {
    this.integrationId = integration.id;
    const cfg = integration.config as Record<string, any>;
    this.config = {
      host: cfg?.host || "127.0.0.1",
      port: Number(cfg?.port) || 7497,
      clientId: Number(cfg?.clientId) || 0,
    };
    this.ib = new IBApi({
      host: this.config.host,
      port: this.config.port,
      clientId: this.config.clientId,
    });
  }

  get id(): string {
    return this.integrationId;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  onOrderStatus(cb: OrderStatusCallback): void {
    this.orderStatusCallbacks.push(cb);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout to IBKR at ${this.config.host}:${this.config.port}`));
      }, 10000);

      this.ib.once(EventName.connected, () => {
        clearTimeout(timeout);
        this.connected = true;
        this.ib.reqMarketDataType(MarketDataType.DELAYED_FROZEN);

        (this.ib.on as (ev: string, cb: (...args: any[]) => void) => void)(EventName.orderStatus, (
          orderId: number,
          status: string,
          filled: number,
          remaining: number,
          avgFillPrice: number,
          _permId: number,
          _parentId: number,
          lastFillPrice: number,
          _clientId: number,
          whyHeld: string,
        ) => {
          for (const cb of this.orderStatusCallbacks) {
            try {
              cb({ orderId, status, filled, remaining, avgFillPrice, lastFillPrice, whyHeld });
            } catch {}
          }
        });

        console.log(`[IBKR] Connected to ${this.config.host}:${this.config.port} (client ${this.config.clientId}), market data type set to DELAYED`);
        resolve();
      });

      this.ib.once(EventName.error, (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ib.connect();
    });
  }

  disconnect(): void {
    if (this.connected) {
      this.ib.disconnect();
      this.connected = false;
      console.log(`[IBKR] Disconnected from ${this.config.host}:${this.config.port}`);
    }
  }

  async fetchOpenOrders(): Promise<IbkrOpenOrder[]> {
    return new Promise((resolve, reject) => {
      const orders: IbkrOpenOrder[] = [];
      const timeout = setTimeout(() => resolve(orders), 8000);

      const onOpenOrder = (orderId: number, contract: Contract, order: Order, orderState: OrderState) => {
        orders.push({ orderId, contract, order, orderState });
      };

      const onOpenOrderEnd = () => {
        clearTimeout(timeout);
        cleanup();
        resolve(orders);
      };

      const onError = (err: Error, code: number) => {
        if (code === 200 || code === 162) return;
        clearTimeout(timeout);
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        this.ib.off(EventName.openOrder, onOpenOrder);
        this.ib.off(EventName.openOrderEnd, onOpenOrderEnd);
        this.ib.off(EventName.error, onError);
      };

      this.ib.on(EventName.openOrder, onOpenOrder);
      this.ib.once(EventName.openOrderEnd, onOpenOrderEnd);
      this.ib.on(EventName.error, onError);

      this.ib.reqAllOpenOrders();
    });
  }

  async fetchPositions(): Promise<IbkrPosition[]> {
    return new Promise((resolve, reject) => {
      const positions: IbkrPosition[] = [];
      const timeout = setTimeout(() => resolve(positions), 8000);

      const onPosition = (account: string, contract: Contract, position: number, avgCost: number) => {
        positions.push({ account, contract, position, avgCost });
      };

      const onPositionEnd = () => {
        clearTimeout(timeout);
        cleanup();
        resolve(positions);
      };

      const onError = (err: Error, code: number) => {
        if (code === 200 || code === 162) return;
        clearTimeout(timeout);
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        (this.ib.off as (ev: string, cb: (...args: any[]) => void) => void)(EventName.position, onPosition);
        this.ib.off(EventName.positionEnd, onPositionEnd);
        this.ib.off(EventName.error, onError);
      };

      (this.ib.on as (ev: string, cb: (...args: any[]) => void) => void)(EventName.position, onPosition);
      this.ib.once(EventName.positionEnd, onPositionEnd);
      this.ib.on(EventName.error, onError);

      this.ib.reqPositions();
    });
  }

  fetchPnLSingle(account: string, conId: number, reqId: number): Promise<{ marketPrice: number; marketValue: number; unrealizedPnl: number; realizedPnl: number } | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 5000);

      const onPnlSingle = (
        _reqId: number,
        _pos: number,
        dailyPnL: number,
        unrealizedPnL: number,
        realizedPnL: number,
        value: number,
      ) => {
        if (_reqId !== reqId) return;
        clearTimeout(timeout);
        cleanup();
        this.ib.cancelPnLSingle(reqId);
        resolve({
          marketPrice: 0,
          marketValue: value,
          unrealizedPnl: unrealizedPnL,
          realizedPnl: realizedPnL,
        });
      };

      const cleanup = () => {
        (this.ib.off as (ev: string, cb: (...args: any[]) => void) => void)(EventName.pnlSingle, onPnlSingle);
      };

      (this.ib.on as (ev: string, cb: (...args: any[]) => void) => void)(EventName.pnlSingle, onPnlSingle);
      this.ib.reqPnLSingle(reqId, account, "", conId);
    });
  }

  fetchMarketPrice(contract: Contract, reqId: number): Promise<number | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        doResolve();
      }, 3000);

      let lastPrice: number | null = null;

      let resolved = false;
      const doResolve = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        this.ib.cancelMktData(reqId);
        resolve(lastPrice);
      };

      const onTickPrice = (_reqId: number, field: number, value: number) => {
        if (_reqId !== reqId) return;
        const isLast = field === IBApiTickType.LAST || field === IBApiTickType.DELAYED_LAST;
        const isClose = field === IBApiTickType.CLOSE || field === IBApiTickType.DELAYED_CLOSE;
        const isBidAsk = field === IBApiTickType.BID || field === IBApiTickType.ASK ||
                         field === IBApiTickType.DELAYED_BID || field === IBApiTickType.DELAYED_ASK;
        if ((isLast || isClose || isBidAsk) && value > 0) {
          if (isLast || lastPrice === null) lastPrice = value;
          if (isLast) doResolve();
        }
      };

      const onSnapshotEnd = (_reqId: number) => {
        if (_reqId !== reqId) return;
        doResolve();
      };

      const onError = (...args: any[]) => {
        const errReqId = args[2] as number;
        if (errReqId !== undefined && errReqId !== reqId) return;
        doResolve();
      };

      const cleanup = () => {
        this.ib.off(EventName.tickPrice, onTickPrice);
        this.ib.off(EventName.tickSnapshotEnd, onSnapshotEnd);
        this.ib.off(EventName.error, onError);
      };

      this.ib.on(EventName.tickPrice, onTickPrice);
      this.ib.on(EventName.tickSnapshotEnd, onSnapshotEnd);
      this.ib.on(EventName.error, onError);

      this.ib.reqMktData(reqId, contract, "", false, false);
    });
  }

  fetchHistoricalData(contract: Contract, reqId: number, durationStr: string = "30 D", barSize: BarSizeSetting = BarSizeSetting.DAYS_ONE): Promise<{ time: string; open: number; high: number; low: number; close: number; volume: number }[]> {
    return new Promise((resolve) => {
      const bars: { time: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
      const timeout = setTimeout(() => {
        cleanup();
        resolve(bars);
      }, 5000);

      const onHistoricalData = (_reqId: number, time: string, open: number, high: number, low: number, close: number, volume: number | any, ...rest: any[]) => {
        if (_reqId !== reqId) return;
        if (time.startsWith("finished") || open === -1) {
          clearTimeout(timeout);
          cleanup();
          resolve(bars);
          return;
        }
        const vol = typeof volume === "number" ? volume : Number(volume) || 0;
        bars.push({ time, open, high, low, close, volume: vol });
      };

      const onError = (...args: any[]) => {
        const errReqId = args[2] as number;
        if (errReqId !== undefined && errReqId !== reqId) return;
        clearTimeout(timeout);
        cleanup();
        resolve(bars);
      };

      const cleanup = () => {
        this.ib.off(EventName.historicalData, onHistoricalData);
        this.ib.off(EventName.error, onError);
      };

      this.ib.on(EventName.historicalData, onHistoricalData);
      this.ib.on(EventName.error, onError);

      const whatToShow = contract.secType === "OPT" ? "MIDPOINT" : "TRADES";

      this.ib.reqHistoricalData(
        reqId,
        contract,
        "",
        durationStr,
        barSize,
        whatToShow,
        1,
        1,
        false,
      );
    });
  }

  cancelPositions(): void {
    this.ib.cancelPositions();
  }

  fetchAccountSummary(reqId: number): Promise<Record<string, Record<string, string>>> {
    return new Promise((resolve) => {
      const data: Record<string, Record<string, string>> = {};
      const timeout = setTimeout(() => {
        cleanup();
        this.ib.cancelAccountSummary(reqId);
        resolve(data);
      }, 8000);

      const onAccountSummary = (_reqId: number, account: string, tag: string, value: string, _currency: string) => {
        if (_reqId !== reqId) return;
        if (!data[account]) data[account] = {};
        data[account][tag] = value;
      };

      const onAccountSummaryEnd = (_reqId: number) => {
        if (_reqId !== reqId) return;
        clearTimeout(timeout);
        cleanup();
        this.ib.cancelAccountSummary(reqId);
        resolve(data);
      };

      const onError = (_err: Error, code: number, errReqId: number) => {
        if (errReqId !== reqId) return;
        clearTimeout(timeout);
        cleanup();
        this.ib.cancelAccountSummary(reqId);
        resolve(data);
      };

      const cleanup = () => {
        (this.ib.off as (ev: string, cb: (...args: any[]) => void) => void)(EventName.accountSummary, onAccountSummary);
        (this.ib.off as (ev: string, cb: (...args: any[]) => void) => void)(EventName.accountSummaryEnd, onAccountSummaryEnd);
        this.ib.off(EventName.error, onError);
      };

      (this.ib.on as (ev: string, cb: (...args: any[]) => void) => void)(EventName.accountSummary, onAccountSummary);
      (this.ib.on as (ev: string, cb: (...args: any[]) => void) => void)(EventName.accountSummaryEnd, onAccountSummaryEnd);
      this.ib.on(EventName.error, onError);

      this.ib.reqAccountSummary(reqId, "All", "$LEDGER:ALL,NetLiquidation,TotalCashValue,BuyingPower,GrossPositionValue,AvailableFunds,ExcessLiquidity,SettledCash,AccruedCash,Cushion,MaintMarginReq,InitMarginReq,UnrealizedPnL,RealizedPnL");
    });
  }

  fetchAccountPnL(account: string, reqId: number): Promise<{ dailyPnL: number; unrealizedPnL: number; realizedPnL: number } | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        this.ib.cancelPnL(reqId);
        resolve(null);
      }, 5000);

      const onPnL = (_reqId: number, dailyPnL: number, unrealizedPnL?: number, realizedPnL?: number) => {
        if (_reqId !== reqId) return;
        clearTimeout(timeout);
        cleanup();
        this.ib.cancelPnL(reqId);
        resolve({
          dailyPnL: dailyPnL || 0,
          unrealizedPnL: unrealizedPnL || 0,
          realizedPnL: realizedPnL || 0,
        });
      };

      const onError = (_err: Error, code: number, errReqId: number) => {
        if (errReqId !== reqId) return;
        clearTimeout(timeout);
        cleanup();
        this.ib.cancelPnL(reqId);
        resolve(null);
      };

      const cleanup = () => {
        (this.ib.off as (ev: string, cb: (...args: any[]) => void) => void)(EventName.pnl, onPnL);
        this.ib.off(EventName.error, onError);
      };

      (this.ib.on as (ev: string, cb: (...args: any[]) => void) => void)(EventName.pnl, onPnL);
      this.ib.on(EventName.error, onError);

      this.ib.reqPnL(reqId, account);
    });
  }
}
