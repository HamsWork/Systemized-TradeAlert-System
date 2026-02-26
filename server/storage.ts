import {
  type User, type InsertUser,
  type Alert, type InsertAlert,
  type Signal, type InsertSignal,
  type WatchlistItem, type InsertWatchlistItem,
  type ActivityLogEntry, type InsertActivityLog,
  users, alerts, signals, watchlist, activityLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAlerts(): Promise<Alert[]>;
  getAlert(id: string): Promise<Alert | undefined>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  updateAlert(id: string, data: Partial<InsertAlert>): Promise<Alert | undefined>;
  deleteAlert(id: string): Promise<boolean>;

  getSignals(): Promise<Signal[]>;
  getSignal(id: string): Promise<Signal | undefined>;
  createSignal(signal: InsertSignal): Promise<Signal>;
  updateSignal(id: string, data: Partial<InsertSignal>): Promise<Signal | undefined>;
  deleteSignal(id: string): Promise<boolean>;

  getWatchlist(): Promise<WatchlistItem[]>;
  addToWatchlist(item: InsertWatchlistItem): Promise<WatchlistItem>;
  removeFromWatchlist(id: string): Promise<boolean>;

  getActivityLog(): Promise<ActivityLogEntry[]>;
  createActivity(entry: InsertActivityLog): Promise<ActivityLogEntry>;

  getDashboardStats(): Promise<{
    totalAlerts: number;
    activeAlerts: number;
    triggeredAlerts: number;
    totalSignals: number;
    activeSignals: number;
    watchlistCount: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAlerts(): Promise<Alert[]> {
    return db.select().from(alerts).orderBy(desc(alerts.createdAt));
  }

  async getAlert(id: string): Promise<Alert | undefined> {
    const [alert] = await db.select().from(alerts).where(eq(alerts.id, id));
    return alert;
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const [created] = await db.insert(alerts).values(alert).returning();
    return created;
  }

  async updateAlert(id: string, data: Partial<InsertAlert>): Promise<Alert | undefined> {
    const [updated] = await db.update(alerts).set(data).where(eq(alerts.id, id)).returning();
    return updated;
  }

  async deleteAlert(id: string): Promise<boolean> {
    const result = await db.delete(alerts).where(eq(alerts.id, id)).returning();
    return result.length > 0;
  }

  async getSignals(): Promise<Signal[]> {
    return db.select().from(signals).orderBy(desc(signals.createdAt));
  }

  async getSignal(id: string): Promise<Signal | undefined> {
    const [signal] = await db.select().from(signals).where(eq(signals.id, id));
    return signal;
  }

  async createSignal(signal: InsertSignal): Promise<Signal> {
    const [created] = await db.insert(signals).values(signal).returning();
    return created;
  }

  async updateSignal(id: string, data: Partial<InsertSignal>): Promise<Signal | undefined> {
    const [updated] = await db.update(signals).set(data).where(eq(signals.id, id)).returning();
    return updated;
  }

  async deleteSignal(id: string): Promise<boolean> {
    const result = await db.delete(signals).where(eq(signals.id, id)).returning();
    return result.length > 0;
  }

  async getWatchlist(): Promise<WatchlistItem[]> {
    return db.select().from(watchlist).orderBy(desc(watchlist.addedAt));
  }

  async addToWatchlist(item: InsertWatchlistItem): Promise<WatchlistItem> {
    const [created] = await db.insert(watchlist).values(item).returning();
    return created;
  }

  async removeFromWatchlist(id: string): Promise<boolean> {
    const result = await db.delete(watchlist).where(eq(watchlist.id, id)).returning();
    return result.length > 0;
  }

  async getActivityLog(): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(50);
  }

  async createActivity(entry: InsertActivityLog): Promise<ActivityLogEntry> {
    const [created] = await db.insert(activityLog).values(entry).returning();
    return created;
  }

  async getDashboardStats() {
    const allAlerts = await db.select().from(alerts);
    const allSignals = await db.select().from(signals);
    const allWatchlist = await db.select().from(watchlist);

    return {
      totalAlerts: allAlerts.length,
      activeAlerts: allAlerts.filter(a => a.status === "active").length,
      triggeredAlerts: allAlerts.filter(a => a.triggered).length,
      totalSignals: allSignals.length,
      activeSignals: allSignals.filter(s => s.status === "active").length,
      watchlistCount: allWatchlist.length,
    };
  }
}

export const storage = new DatabaseStorage();
