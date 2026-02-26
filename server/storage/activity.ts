import { type ActivityLogEntry, type InsertActivityLog, activityLog } from "@shared/schema";
import { db } from "../db";
import { desc, eq } from "drizzle-orm";

export const activityMethods = {
  async getActivityLog(): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(50);
  },

  async getActivityBySymbol(symbol: string): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog).where(eq(activityLog.symbol, symbol)).orderBy(desc(activityLog.createdAt));
  },

  async createActivity(entry: InsertActivityLog): Promise<ActivityLogEntry> {
    const [created] = await db.insert(activityLog).values(entry).returning();
    return created;
  },
};
