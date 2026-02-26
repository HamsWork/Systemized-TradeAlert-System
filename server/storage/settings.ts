import { type SystemSetting, type InsertSystemSetting, systemSettings } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

export const settingsMethods = {
  async getSystemSettings(): Promise<SystemSetting[]> {
    return db.select().from(systemSettings);
  },

  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting;
  },

  async upsertSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(setting.key);
    if (existing) {
      const [updated] = await db.update(systemSettings).set(setting).where(eq(systemSettings.key, setting.key)).returning();
      return updated;
    }
    const [created] = await db.insert(systemSettings).values(setting).returning();
    return created;
  },
};
