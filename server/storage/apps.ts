import { type ConnectedApp, type InsertConnectedApp, connectedApps } from "@shared/schema";
import { createCrudMethods } from "./crud-helpers";
import { db } from "../db";
import { eq } from "drizzle-orm";

const crud = createCrudMethods<typeof connectedApps, ConnectedApp, InsertConnectedApp>(connectedApps, connectedApps.createdAt);

export const appMethods = {
  getConnectedApps: crud.getAll,
  getConnectedApp: crud.getById,
  createConnectedApp: crud.create,
  updateConnectedApp: crud.update,
  deleteConnectedApp: crud.remove,

  async getConnectedAppByApiKey(apiKey: string): Promise<ConnectedApp | undefined> {
    const [app] = await db.select().from(connectedApps).where(eq(connectedApps.apiKey, apiKey));
    return app;
  },
};
