import {
  type SignalType, type InsertSignalType, signalTypes,
  type Signal, type InsertSignal, signals,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";

export const signalMethods = {
  async getSignalTypes(): Promise<SignalType[]> {
    return db.select().from(signalTypes).orderBy(desc(signalTypes.createdAt));
  },

  async getSignalType(id: string): Promise<SignalType | undefined> {
    const [st] = await db.select().from(signalTypes).where(eq(signalTypes.id, id));
    return st;
  },

  async getSignalTypeByName(name: string): Promise<SignalType | undefined> {
    const [st] = await db.select().from(signalTypes).where(eq(signalTypes.name, name));
    return st;
  },

  async createSignalType(signalType: InsertSignalType): Promise<SignalType> {
    const [created] = await db.insert(signalTypes).values(signalType).returning();
    return created;
  },

  async updateSignalType(id: string, data: Partial<InsertSignalType>): Promise<SignalType | undefined> {
    const [updated] = await db.update(signalTypes).set({ ...data, updatedAt: new Date() }).where(eq(signalTypes.id, id)).returning();
    return updated;
  },

  async deleteSignalType(id: string): Promise<boolean> {
    const result = await db.delete(signalTypes).where(eq(signalTypes.id, id)).returning();
    return result.length > 0;
  },

  async getSignals(): Promise<Signal[]> {
    return db.select().from(signals).orderBy(desc(signals.createdAt));
  },

  async getSignal(id: string): Promise<Signal | undefined> {
    const [signal] = await db.select().from(signals).where(eq(signals.id, id));
    return signal;
  },

  async createSignal(signal: InsertSignal): Promise<Signal> {
    const [created] = await db.insert(signals).values(signal).returning();
    return created;
  },

  async updateSignal(id: string, data: Partial<InsertSignal>): Promise<Signal | undefined> {
    const [updated] = await db.update(signals).set(data).where(eq(signals.id, id)).returning();
    return updated;
  },

  async deleteSignal(id: string): Promise<boolean> {
    const result = await db.delete(signals).where(eq(signals.id, id)).returning();
    return result.length > 0;
  },
};
