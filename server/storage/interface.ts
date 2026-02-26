import {
  type User, type InsertUser,
  type Alert, type InsertAlert,
  type SignalType, type InsertSignalType,
  type Signal, type InsertSignal,
  type ActivityLogEntry, type InsertActivityLog,
  type ConnectedApp, type InsertConnectedApp,
  type SystemSetting, type InsertSystemSetting,
  type Integration, type InsertIntegration,
  type IbkrOrder, type InsertIbkrOrder,
  type IbkrPosition, type InsertIbkrPosition,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAlerts(): Promise<Alert[]>;
  getAlert(id: string): Promise<Alert | undefined>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  updateAlert(id: string, data: Partial<InsertAlert>): Promise<Alert | undefined>;
  deleteAlert(id: string): Promise<boolean>;

  getSignalTypes(): Promise<SignalType[]>;
  getSignalType(id: string): Promise<SignalType | undefined>;
  getSignalTypeByName(name: string): Promise<SignalType | undefined>;
  createSignalType(signalType: InsertSignalType): Promise<SignalType>;
  updateSignalType(id: string, data: Partial<InsertSignalType>): Promise<SignalType | undefined>;
  deleteSignalType(id: string): Promise<boolean>;

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
