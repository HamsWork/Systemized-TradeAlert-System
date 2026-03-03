import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { registerDashboardRoutes } from "./dashboard";
import { registerAlertRoutes } from "./alerts";
import { registerSignalRoutes } from "./signals";
import { registerActivityRoutes } from "./activity";
import { registerAppRoutes } from "./apps";
import { registerSettingsRoutes } from "./settings";
import { registerIntegrationRoutes } from "./integrations";
import { registerIbkrRoutes } from "./ibkr";
import { registerTestRoutes } from "./test";

function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status || (err.issues ? 400 : 500);
  const message = err.message || "Internal server error";
  res.status(status).json({ message });
}

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
  registerTestRoutes(app);

  app.use(errorHandler);

  return httpServer;
}
