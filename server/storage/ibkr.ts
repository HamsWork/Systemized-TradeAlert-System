import {
  type IbkrOrder, type InsertIbkrOrder, ibkrOrders,
  type IbkrPosition, type InsertIbkrPosition, ibkrPositions,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";

export const ibkrMethods = {
  async getIbkrOrders(): Promise<IbkrOrder[]> {
    return db.select().from(ibkrOrders).orderBy(desc(ibkrOrders.submittedAt));
  },

  async getIbkrOrdersByIntegration(integrationId: string): Promise<IbkrOrder[]> {
    return db.select().from(ibkrOrders).where(eq(ibkrOrders.integrationId, integrationId)).orderBy(desc(ibkrOrders.submittedAt));
  },

  async createIbkrOrder(order: InsertIbkrOrder): Promise<IbkrOrder> {
    const [created] = await db.insert(ibkrOrders).values(order).returning();
    return created;
  },

  async updateIbkrOrder(id: string, data: Partial<InsertIbkrOrder>): Promise<IbkrOrder | undefined> {
    const [updated] = await db.update(ibkrOrders).set(data).where(eq(ibkrOrders.id, id)).returning();
    return updated;
  },

  async getIbkrPositions(): Promise<IbkrPosition[]> {
    return db.select().from(ibkrPositions).orderBy(desc(ibkrPositions.lastUpdated));
  },

  async getIbkrPositionsByIntegration(integrationId: string): Promise<IbkrPosition[]> {
    return db.select().from(ibkrPositions).where(eq(ibkrPositions.integrationId, integrationId)).orderBy(desc(ibkrPositions.lastUpdated));
  },

  async createIbkrPosition(position: InsertIbkrPosition): Promise<IbkrPosition> {
    const [created] = await db.insert(ibkrPositions).values(position).returning();
    return created;
  },

  async updateIbkrPosition(id: string, data: Partial<InsertIbkrPosition>): Promise<IbkrPosition | undefined> {
    const [updated] = await db.update(ibkrPositions).set(data).where(eq(ibkrPositions.id, id)).returning();
    return updated;
  },
};
