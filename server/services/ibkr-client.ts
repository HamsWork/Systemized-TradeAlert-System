import { IBApi, EventName, Contract, Order, OrderState } from "@stoqey/ib";
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

export class IbkrClient {
  private ib: IBApi;
  private connected = false;
  private integrationId: string;
  private config: IbkrConnectionConfig;

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

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout to IBKR at ${this.config.host}:${this.config.port}`));
      }, 10000);

      this.ib.once(EventName.connected, () => {
        clearTimeout(timeout);
        this.connected = true;
        console.log(`[IBKR] Connected to ${this.config.host}:${this.config.port} (client ${this.config.clientId})`);
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
        this.ib.off(EventName.position, onPosition);
        this.ib.off(EventName.positionEnd, onPositionEnd);
        this.ib.off(EventName.error, onError);
      };

      this.ib.on(EventName.position, onPosition);
      this.ib.once(EventName.positionEnd, onPositionEnd);
      this.ib.on(EventName.error, onError);

      this.ib.reqPositions();
    });
  }

  onOrderStatus(callback: (status: IbkrOrderStatus) => void): void {
    this.ib.on(EventName.orderStatus, (
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
      callback({ orderId, status, filled, remaining, avgFillPrice, lastFillPrice, whyHeld });
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
        this.ib.off(EventName.pnlSingle, onPnlSingle);
      };

      this.ib.on(EventName.pnlSingle, onPnlSingle);
      this.ib.reqPnLSingle(reqId, account, "", conId);
    });
  }

  cancelPositions(): void {
    this.ib.cancelPositions();
  }
}
