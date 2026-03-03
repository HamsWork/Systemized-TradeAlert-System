import { db } from "../db";
import { eq, desc } from "drizzle-orm";

export function createCrudMethods<
  TSelect extends Record<string, any>,
  TInsert extends Record<string, any>,
>(table: any, orderByCol?: any) {
  return {
    async getAll(): Promise<TSelect[]> {
      const query = db.select().from(table);
      const rows = orderByCol ? await query.orderBy(desc(orderByCol)) : await query;
      return Array.isArray(rows) ? (rows as TSelect[]) : [];
    },

    async getById(id: string): Promise<TSelect | undefined> {
      const [row] = await db.select().from(table).where(eq(table.id, id));
      return row as TSelect | undefined;
    },

    async create(data: TInsert): Promise<TSelect> {
      const result = await db.insert(table).values(data).returning() as TSelect[];
      const created = result[0];
      if (!created) throw new Error("Insert did not return a row");
      return created;
    },

    async update(id: string, data: Partial<TInsert>): Promise<TSelect | undefined> {
      const result = await db.update(table).set(data).where(eq(table.id, id)).returning() as TSelect[];
      return result[0];
    },

    async remove(id: string): Promise<boolean> {
      const result = await db.delete(table).where(eq(table.id, id)).returning() as any[];
      return result.length > 0;
    },
  };
}
