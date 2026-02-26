import type { Express } from "express";
import type { Server } from "http";
import { registerDashboardRoutes } from "./dashboard";
import { registerAlertRoutes } from "./alerts";
import { registerSignalRoutes } from "./signals";
import { registerActivityRoutes } from "./activity";
import { registerAppRoutes } from "./apps";
import { registerSettingsRoutes } from "./settings";
import { registerIntegrationRoutes } from "./integrations";
import { registerIbkrRoutes } from "./ibkr";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerDashboardRoutes(app);
  registerAlertRoutes(app);
  registerSignalRoutes(app);
  registerActivityRoutes(app);
  registerAppRoutes(app);
  registerSettingsRoutes(app);
  registerIntegrationRoutes(app);
  registerIbkrRoutes(app);

  return httpServer;
}
