import { type DiscordMessage, type InsertDiscordMessage, discordMessages } from "@shared/schema";
import { db } from "../db";
import { desc, eq } from "drizzle-orm";

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
};
