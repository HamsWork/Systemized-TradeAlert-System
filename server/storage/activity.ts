import { type ActivityLogEntry, type InsertActivityLog, activityLog } from "@shared/schema";
import { db } from "../db";
import { desc, eq, sql } from "drizzle-orm";

export const activityMethods = {
  async getActivityLog(page = 1, pageSize = 50): Promise<{ data: ActivityLogEntry[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(activityLog);
    const total = countResult.count;
    const data = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(pageSize).offset(offset);
    return { data, total };
  },

  async getActivityBySymbol(symbol: string): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog).where(eq(activityLog.symbol, symbol)).orderBy(desc(activityLog.createdAt));
  },

  async getActivityBySignal(signalId: string): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog).where(eq(activityLog.signalId, signalId)).orderBy(desc(activityLog.createdAt));
  },

  async createActivity(entry: InsertActivityLog): Promise<ActivityLogEntry> {
    const [created] = await db.insert(activityLog).values(entry).returning();
    return created;
  },
};
