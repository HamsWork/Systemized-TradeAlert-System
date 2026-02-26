import { type ConnectedApp, type InsertConnectedApp, connectedApps } from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";

export const appMethods = {
  async getConnectedApps(): Promise<ConnectedApp[]> {
    return db.select().from(connectedApps).orderBy(desc(connectedApps.createdAt));
  },

  async getConnectedApp(id: string): Promise<ConnectedApp | undefined> {
    const [app] = await db.select().from(connectedApps).where(eq(connectedApps.id, id));
    return app;
  },

  async getConnectedAppByApiKey(apiKey: string): Promise<ConnectedApp | undefined> {
    const [app] = await db.select().from(connectedApps).where(eq(connectedApps.apiKey, apiKey));
    return app;
  },

  async createConnectedApp(app: InsertConnectedApp): Promise<ConnectedApp> {
    const [created] = await db.insert(connectedApps).values(app).returning();
    return created;
  },

  async updateConnectedApp(id: string, data: Partial<InsertConnectedApp>): Promise<ConnectedApp | undefined> {
    const [updated] = await db.update(connectedApps).set(data).where(eq(connectedApps.id, id)).returning();
    return updated;
  },

  async deleteConnectedApp(id: string): Promise<boolean> {
    const result = await db.delete(connectedApps).where(eq(connectedApps.id, id)).returning();
    return result.length > 0;
  },
};
