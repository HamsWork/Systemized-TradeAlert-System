import {
  type IbkrOrder, type InsertIbkrOrder, ibkrOrders,
  type IbkrPosition, type InsertIbkrPosition, ibkrPositions,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";

export const ibkrMethods = {
  async getIbkrOrders(): Promise<IbkrOrder[]> {
    return db.select().from(ibkrOrders).orderBy(desc(ibkrOrders.submittedAt));
  },

  async getIbkrOrdersBySymbol(symbol: string): Promise<IbkrOrder[]> {
    return db.select().from(ibkrOrders).where(eq(ibkrOrders.symbol, symbol)).orderBy(desc(ibkrOrders.submittedAt));
  },

  async getIbkrOrdersByIntegration(integrationId: string): Promise<IbkrOrder[]> {
    return db.select().from(ibkrOrders).where(eq(ibkrOrders.integrationId, integrationId)).orderBy(desc(ibkrOrders.submittedAt));
  },

  async getIbkrOrderByOrderId(orderId: string, integrationId: string): Promise<IbkrOrder | undefined> {
    const [order] = await db.select().from(ibkrOrders)
      .where(and(eq(ibkrOrders.orderId, orderId), eq(ibkrOrders.integrationId, integrationId)));
    return order;
  },

  async createIbkrOrder(order: InsertIbkrOrder): Promise<IbkrOrder> {
    const [created] = await db.insert(ibkrOrders).values(order).returning();
    return created;
  },

  async updateIbkrOrder(id: string, data: Partial<InsertIbkrOrder>): Promise<IbkrOrder | undefined> {
    const [updated] = await db.update(ibkrOrders).set(data).where(eq(ibkrOrders.id, id)).returning();
    return updated;
  },

  async upsertIbkrOrder(orderId: string, integrationId: string, data: InsertIbkrOrder): Promise<IbkrOrder> {
    const existing = await ibkrMethods.getIbkrOrderByOrderId(orderId, integrationId);
    if (existing) {
      const [updated] = await db.update(ibkrOrders).set(data).where(eq(ibkrOrders.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(ibkrOrders).values(data).returning();
    return created;
  },

  async getIbkrPositions(): Promise<IbkrPosition[]> {
    return db.select().from(ibkrPositions).orderBy(desc(ibkrPositions.lastUpdated));
  },

  async getIbkrPositionsByIntegration(integrationId: string): Promise<IbkrPosition[]> {
    return db.select().from(ibkrPositions).where(eq(ibkrPositions.integrationId, integrationId)).orderBy(desc(ibkrPositions.lastUpdated));
  },

  async getIbkrPositionBySymbol(symbol: string, integrationId: string): Promise<IbkrPosition | undefined> {
    const [pos] = await db.select().from(ibkrPositions)
      .where(and(eq(ibkrPositions.symbol, symbol), eq(ibkrPositions.integrationId, integrationId)));
    return pos;
  },

  async createIbkrPosition(position: InsertIbkrPosition): Promise<IbkrPosition> {
    const [created] = await db.insert(ibkrPositions).values(position).returning();
    return created;
  },

  async updateIbkrPosition(id: string, data: Partial<InsertIbkrPosition>): Promise<IbkrPosition | undefined> {
    const [updated] = await db.update(ibkrPositions).set(data).where(eq(ibkrPositions.id, id)).returning();
    return updated;
  },

  async upsertIbkrPosition(symbol: string, integrationId: string, data: InsertIbkrPosition): Promise<IbkrPosition> {
    const existing = await ibkrMethods.getIbkrPositionBySymbol(symbol, integrationId);
    if (existing) {
      const [updated] = await db.update(ibkrPositions).set(data).where(eq(ibkrPositions.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(ibkrPositions).values(data).returning();
    return created;
  },

  async updateIbkrOrderPrice(orderId: string, integrationId: string, price: number): Promise<void> {
    await db.update(ibkrOrders)
      .set({ lastPrice: price })
      .where(and(eq(ibkrOrders.orderId, orderId), eq(ibkrOrders.integrationId, integrationId)));
  },

  async deleteIbkrPositionsByIntegration(integrationId: string): Promise<void> {
    await db.delete(ibkrPositions).where(eq(ibkrPositions.integrationId, integrationId));
  },
};
