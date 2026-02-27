import { type IStorage } from "./interface";
import { userMethods } from "./users";
import { alertMethods } from "./alerts";
import { signalMethods } from "./signals";
import { activityMethods } from "./activity";
import { appMethods } from "./apps";
import { settingsMethods } from "./settings";
import { integrationMethods } from "./integrations";
import { ibkrMethods } from "./ibkr";
import { discordMethods } from "./discord";
import { dashboardMethods } from "./dashboard";

export { type IStorage } from "./interface";

export class DatabaseStorage implements IStorage {
  getUser = userMethods.getUser;
  getUserByUsername = userMethods.getUserByUsername;
  createUser = userMethods.createUser;

  getAlerts = alertMethods.getAlerts;
  getAlert = alertMethods.getAlert;
  createAlert = alertMethods.createAlert;
  updateAlert = alertMethods.updateAlert;
  deleteAlert = alertMethods.deleteAlert;

  getSignals = signalMethods.getSignals;
  getSignal = signalMethods.getSignal;
  createSignal = signalMethods.createSignal;
  updateSignal = signalMethods.updateSignal;
  deleteSignal = signalMethods.deleteSignal;

  getActivityLog = activityMethods.getActivityLog;
  getActivityBySymbol = activityMethods.getActivityBySymbol;
  getActivityBySignal = activityMethods.getActivityBySignal;
  createActivity = activityMethods.createActivity;

  getConnectedApps = appMethods.getConnectedApps;
  getConnectedApp = appMethods.getConnectedApp;
  getConnectedAppByApiKey = appMethods.getConnectedAppByApiKey;
  createConnectedApp = appMethods.createConnectedApp;
  updateConnectedApp = appMethods.updateConnectedApp;
  deleteConnectedApp = appMethods.deleteConnectedApp;

  getSystemSettings = settingsMethods.getSystemSettings;
  getSystemSetting = settingsMethods.getSystemSetting;
  upsertSystemSetting = settingsMethods.upsertSystemSetting.bind(settingsMethods);

  getIntegrations = integrationMethods.getIntegrations;
  getIntegration = integrationMethods.getIntegration;
  createIntegration = integrationMethods.createIntegration;
  updateIntegration = integrationMethods.updateIntegration;
  deleteIntegration = integrationMethods.deleteIntegration;

  getIbkrOrders = ibkrMethods.getIbkrOrders;
  getIbkrOrdersBySymbol = ibkrMethods.getIbkrOrdersBySymbol;
  getIbkrOrdersByIntegration = ibkrMethods.getIbkrOrdersByIntegration;
  getIbkrOrdersBySignal = ibkrMethods.getIbkrOrdersBySignal;
  getIbkrOrderByOrderId = ibkrMethods.getIbkrOrderByOrderId;
  createIbkrOrder = ibkrMethods.createIbkrOrder;
  updateIbkrOrder = ibkrMethods.updateIbkrOrder;
  upsertIbkrOrder = ibkrMethods.upsertIbkrOrder;
  updateIbkrOrderPrice = ibkrMethods.updateIbkrOrderPrice;

  getIbkrPositions = ibkrMethods.getIbkrPositions;
  getIbkrPositionsByIntegration = ibkrMethods.getIbkrPositionsByIntegration;
  getIbkrPositionBySymbol = ibkrMethods.getIbkrPositionBySymbol;
  createIbkrPosition = ibkrMethods.createIbkrPosition;
  updateIbkrPosition = ibkrMethods.updateIbkrPosition;
  upsertIbkrPosition = ibkrMethods.upsertIbkrPosition;
  deleteIbkrPositionsByIntegration = ibkrMethods.deleteIbkrPositionsByIntegration;

  getDiscordMessages = discordMethods.getDiscordMessages;
  getDiscordMessagesBySignal = discordMethods.getDiscordMessagesBySignal;
  createDiscordMessage = discordMethods.createDiscordMessage;

  getDashboardStats = dashboardMethods.getDashboardStats;
}

export const storage = new DatabaseStorage();
