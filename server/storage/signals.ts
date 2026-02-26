import {
  type SignalType, type InsertSignalType, signalTypes,
  type Signal, type InsertSignal, signals,
} from "@shared/schema";
import { createCrudMethods } from "./crud-helpers";
import { db } from "../db";
import { eq } from "drizzle-orm";

const signalTypeCrud = createCrudMethods<typeof signalTypes, SignalType, InsertSignalType>(signalTypes, signalTypes.createdAt);
const signalCrud = createCrudMethods<typeof signals, Signal, InsertSignal>(signals, signals.createdAt);

export const signalMethods = {
  getSignalTypes: signalTypeCrud.getAll,
  getSignalType: signalTypeCrud.getById,
  createSignalType: signalTypeCrud.create,
  deleteSignalType: signalTypeCrud.remove,

  async getSignalTypeByName(name: string): Promise<SignalType | undefined> {
    const [st] = await db.select().from(signalTypes).where(eq(signalTypes.name, name));
    return st;
  },

  async updateSignalType(id: string, data: Partial<InsertSignalType>): Promise<SignalType | undefined> {
    const [updated] = await db.update(signalTypes).set({ ...data, updatedAt: new Date() }).where(eq(signalTypes.id, id)).returning();
    return updated;
  },

  getSignals: signalCrud.getAll,
  getSignal: signalCrud.getById,
  createSignal: signalCrud.create,
  updateSignal: signalCrud.update,
  deleteSignal: signalCrud.remove,
};
