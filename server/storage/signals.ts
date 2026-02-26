import {
  type Signal, type InsertSignal, signals,
} from "@shared/schema";
import { createCrudMethods } from "./crud-helpers";

const signalCrud = createCrudMethods<typeof signals, Signal, InsertSignal>(signals, signals.createdAt);

export const signalMethods = {
  getSignals: signalCrud.getAll,
  getSignal: signalCrud.getById,
  createSignal: signalCrud.create,
  updateSignal: signalCrud.update,
  deleteSignal: signalCrud.remove,
};
