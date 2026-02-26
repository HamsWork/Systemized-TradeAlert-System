import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import type { PgTableWithColumns, TableConfig } from "drizzle-orm/pg-core";

export function createCrudMethods<
  TTable extends PgTableWithColumns<TableConfig>,
  TSelect extends Record<string, any>,
  TInsert extends Record<string, any>,
>(table: TTable, orderByCol?: any) {
  return {
    async getAll(): Promise<TSelect[]> {
      const query = db.select().from(table);
      return (orderByCol ? query.orderBy(desc(orderByCol)) : query) as any;
    },

    async getById(id: string): Promise<TSelect | undefined> {
      const [row] = await db.select().from(table).where(eq((table as any).id, id));
      return row as TSelect | undefined;
    },

    async create(data: TInsert): Promise<TSelect> {
      const [created] = await db.insert(table).values(data as any).returning();
      return created as TSelect;
    },

    async update(id: string, data: Partial<TInsert>): Promise<TSelect | undefined> {
      const [updated] = await db.update(table).set(data as any).where(eq((table as any).id, id)).returning();
      return updated as TSelect | undefined;
    },

    async remove(id: string): Promise<boolean> {
      const result = await db.delete(table).where(eq((table as any).id, id)).returning();
      return result.length > 0;
    },
  };
}
