import { type Alert, type InsertAlert, alerts } from "@shared/schema";
import { createCrudMethods } from "./crud-helpers";

const crud = createCrudMethods<typeof alerts, Alert, InsertAlert>(alerts, alerts.createdAt);

export const alertMethods = {
  getAlerts: crud.getAll,
  getAlert: crud.getById,
  createAlert: crud.create,
  updateAlert: crud.update,
  deleteAlert: crud.remove,
};
