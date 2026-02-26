import {
  type User, type InsertUser,
  type Alert, type InsertAlert,
  type Signal, type InsertSignal,
  type ActivityLogEntry, type InsertActivityLog,
  type ConnectedApp, type InsertConnectedApp,
  type SystemSetting, type InsertSystemSetting,
  type Integration, type InsertIntegration,
  type IbkrOrder, type InsertIbkrOrder,
  type IbkrPosition, type InsertIbkrPosition,
  users, alerts, signals, activityLog, connectedApps,
  systemSettings, integrations, ibkrOrders, ibkrPositions,
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

  getActivityLog(): Promise<ActivityLogEntry[]>;
  createActivity(entry: InsertActivityLog): Promise<ActivityLogEntry>;

  getConnectedApps(): Promise<ConnectedApp[]>;
  getConnectedApp(id: string): Promise<ConnectedApp | undefined>;
  getConnectedAppByApiKey(apiKey: string): Promise<ConnectedApp | undefined>;
  createConnectedApp(app: InsertConnectedApp): Promise<ConnectedApp>;
  updateConnectedApp(id: string, data: Partial<InsertConnectedApp>): Promise<ConnectedApp | undefined>;
  deleteConnectedApp(id: string): Promise<boolean>;

  getSystemSettings(): Promise<SystemSetting[]>;
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  upsertSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting>;

  getIntegrations(): Promise<Integration[]>;
  getIntegration(id: string): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: string, data: Partial<InsertIntegration>): Promise<Integration | undefined>;
  deleteIntegration(id: string): Promise<boolean>;

  getIbkrOrders(): Promise<IbkrOrder[]>;
  getIbkrOrdersByIntegration(integrationId: string): Promise<IbkrOrder[]>;
  createIbkrOrder(order: InsertIbkrOrder): Promise<IbkrOrder>;
  updateIbkrOrder(id: string, data: Partial<InsertIbkrOrder>): Promise<IbkrOrder | undefined>;

  getIbkrPositions(): Promise<IbkrPosition[]>;
  getIbkrPositionsByIntegration(integrationId: string): Promise<IbkrPosition[]>;
  createIbkrPosition(position: InsertIbkrPosition): Promise<IbkrPosition>;
  updateIbkrPosition(id: string, data: Partial<InsertIbkrPosition>): Promise<IbkrPosition | undefined>;

  getDashboardStats(): Promise<{
    totalAlerts: number;
    activeAlerts: number;
    triggeredAlerts: number;
    totalSignals: number;
    activeSignals: number;
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

  async getActivityLog(): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(50);
  }

  async createActivity(entry: InsertActivityLog): Promise<ActivityLogEntry> {
    const [created] = await db.insert(activityLog).values(entry).returning();
    return created;
  }

  async getConnectedApps(): Promise<ConnectedApp[]> {
    return db.select().from(connectedApps).orderBy(desc(connectedApps.createdAt));
  }

  async getConnectedApp(id: string): Promise<ConnectedApp | undefined> {
    const [app] = await db.select().from(connectedApps).where(eq(connectedApps.id, id));
    return app;
  }

  async getConnectedAppByApiKey(apiKey: string): Promise<ConnectedApp | undefined> {
    const [app] = await db.select().from(connectedApps).where(eq(connectedApps.apiKey, apiKey));
    return app;
  }

  async createConnectedApp(app: InsertConnectedApp): Promise<ConnectedApp> {
    const [created] = await db.insert(connectedApps).values(app).returning();
    return created;
  }

  async updateConnectedApp(id: string, data: Partial<InsertConnectedApp>): Promise<ConnectedApp | undefined> {
    const [updated] = await db.update(connectedApps).set(data).where(eq(connectedApps.id, id)).returning();
    return updated;
  }

  async deleteConnectedApp(id: string): Promise<boolean> {
    const result = await db.delete(connectedApps).where(eq(connectedApps.id, id)).returning();
    return result.length > 0;
  }

  async getSystemSettings(): Promise<SystemSetting[]> {
    return db.select().from(systemSettings);
  }

  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting;
  }

  async upsertSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(setting.key);
    if (existing) {
      const [updated] = await db.update(systemSettings).set(setting).where(eq(systemSettings.key, setting.key)).returning();
      return updated;
    }
    const [created] = await db.insert(systemSettings).values(setting).returning();
    return created;
  }

  async getIntegrations(): Promise<Integration[]> {
    return db.select().from(integrations).orderBy(desc(integrations.createdAt));
  }

  async getIntegration(id: string): Promise<Integration | undefined> {
    const [integration] = await db.select().from(integrations).where(eq(integrations.id, id));
    return integration;
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const [created] = await db.insert(integrations).values(integration).returning();
    return created;
  }

  async updateIntegration(id: string, data: Partial<InsertIntegration>): Promise<Integration | undefined> {
    const [updated] = await db.update(integrations).set(data).where(eq(integrations.id, id)).returning();
    return updated;
  }

  async deleteIntegration(id: string): Promise<boolean> {
    const result = await db.delete(integrations).where(eq(integrations.id, id)).returning();
    return result.length > 0;
  }

  async getIbkrOrders(): Promise<IbkrOrder[]> {
    return db.select().from(ibkrOrders).orderBy(desc(ibkrOrders.submittedAt));
  }

  async getIbkrOrdersByIntegration(integrationId: string): Promise<IbkrOrder[]> {
    return db.select().from(ibkrOrders).where(eq(ibkrOrders.integrationId, integrationId)).orderBy(desc(ibkrOrders.submittedAt));
  }

  async createIbkrOrder(order: InsertIbkrOrder): Promise<IbkrOrder> {
    const [created] = await db.insert(ibkrOrders).values(order).returning();
    return created;
  }

  async updateIbkrOrder(id: string, data: Partial<InsertIbkrOrder>): Promise<IbkrOrder | undefined> {
    const [updated] = await db.update(ibkrOrders).set(data).where(eq(ibkrOrders.id, id)).returning();
    return updated;
  }

  async getIbkrPositions(): Promise<IbkrPosition[]> {
    return db.select().from(ibkrPositions).orderBy(desc(ibkrPositions.lastUpdated));
  }

  async getIbkrPositionsByIntegration(integrationId: string): Promise<IbkrPosition[]> {
    return db.select().from(ibkrPositions).where(eq(ibkrPositions.integrationId, integrationId)).orderBy(desc(ibkrPositions.lastUpdated));
  }

  async createIbkrPosition(position: InsertIbkrPosition): Promise<IbkrPosition> {
    const [created] = await db.insert(ibkrPositions).values(position).returning();
    return created;
  }

  async updateIbkrPosition(id: string, data: Partial<InsertIbkrPosition>): Promise<IbkrPosition | undefined> {
    const [updated] = await db.update(ibkrPositions).set(data).where(eq(ibkrPositions.id, id)).returning();
    return updated;
  }

  async getDashboardStats() {
    const allAlerts = await db.select().from(alerts);
    const allSignals = await db.select().from(signals);

    return {
      totalAlerts: allAlerts.length,
      activeAlerts: allAlerts.filter(a => a.status === "active").length,
      triggeredAlerts: allAlerts.filter(a => a.triggered).length,
      totalSignals: allSignals.length,
      activeSignals: allSignals.filter(s => s.status === "active").length,
    };
  }
}

export const storage = new DatabaseStorage();
