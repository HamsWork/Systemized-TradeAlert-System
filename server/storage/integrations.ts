import { type Integration, type InsertIntegration, integrations } from "@shared/schema";
import { createCrudMethods } from "./crud-helpers";

const crud = createCrudMethods<typeof integrations, Integration, InsertIntegration>(integrations, integrations.createdAt);

export const integrationMethods = {
  getIntegrations: crud.getAll,
  getIntegration: crud.getById,
  createIntegration: crud.create,
  updateIntegration: crud.update,
  deleteIntegration: crud.remove,
};
