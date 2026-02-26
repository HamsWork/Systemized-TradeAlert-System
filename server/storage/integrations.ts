import { type Integration, type InsertIntegration, integrations } from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";

export const integrationMethods = {
  async getIntegrations(): Promise<Integration[]> {
    return db.select().from(integrations).orderBy(desc(integrations.createdAt));
  },

  async getIntegration(id: string): Promise<Integration | undefined> {
    const [integration] = await db.select().from(integrations).where(eq(integrations.id, id));
    return integration;
  },

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const [created] = await db.insert(integrations).values(integration).returning();
    return created;
  },

  async updateIntegration(id: string, data: Partial<InsertIntegration>): Promise<Integration | undefined> {
    const [updated] = await db.update(integrations).set(data).where(eq(integrations.id, id)).returning();
    return updated;
  },

  async deleteIntegration(id: string): Promise<boolean> {
    const result = await db.delete(integrations).where(eq(integrations.id, id)).returning();
    return result.length > 0;
  },
};
