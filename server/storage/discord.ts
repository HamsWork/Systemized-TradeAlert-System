import {
  type DiscordMessage, type InsertDiscordMessage, discordMessages,
  type DiscordTemplate, type InsertDiscordTemplate, discordTemplates,
} from "@shared/schema";
import { db } from "../db";
import { desc, eq, and } from "drizzle-orm";

export const discordMethods = {
  async getDiscordMessages(): Promise<DiscordMessage[]> {
    return db.select().from(discordMessages).orderBy(desc(discordMessages.createdAt)).limit(100);
  },

  async getDiscordMessagesBySignal(signalId: string): Promise<DiscordMessage[]> {
    return db.select().from(discordMessages).where(eq(discordMessages.signalId, signalId)).orderBy(desc(discordMessages.createdAt));
  },

  async createDiscordMessage(message: InsertDiscordMessage): Promise<DiscordMessage> {
    const [created] = await db.insert(discordMessages).values(message).returning();
    return created;
  },

  async getDiscordTemplatesByApp(appId: string): Promise<DiscordTemplate[]> {
    return db.select().from(discordTemplates).where(eq(discordTemplates.appId, appId));
  },

  async upsertDiscordTemplate(template: InsertDiscordTemplate): Promise<DiscordTemplate> {
    const [result] = await db
      .insert(discordTemplates)
      .values(template)
      .onConflictDoUpdate({
        target: [discordTemplates.appId, discordTemplates.instrumentType, discordTemplates.messageType],
        set: {
          label: template.label,
          content: template.content,
          embedJson: template.embedJson,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  },

  async deleteDiscordTemplatesByApp(appId: string, instrumentType?: string): Promise<void> {
    if (instrumentType) {
      await db.delete(discordTemplates).where(
        and(eq(discordTemplates.appId, appId), eq(discordTemplates.instrumentType, instrumentType))
      );
    } else {
      await db.delete(discordTemplates).where(eq(discordTemplates.appId, appId));
    }
  },
};
