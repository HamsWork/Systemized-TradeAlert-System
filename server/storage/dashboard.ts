import { alerts, signals } from "@shared/schema";
import { db } from "../db";

export const dashboardMethods = {
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
  },
};
