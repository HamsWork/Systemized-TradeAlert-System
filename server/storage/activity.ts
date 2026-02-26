import { type ActivityLogEntry, type InsertActivityLog, activityLog } from "@shared/schema";
import { db } from "../db";
import { desc } from "drizzle-orm";

export const activityMethods = {
  async getActivityLog(): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(50);
  },

  async createActivity(entry: InsertActivityLog): Promise<ActivityLogEntry> {
    const [created] = await db.insert(activityLog).values(entry).returning();
    return created;
  },
};
