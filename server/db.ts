import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

// Ensure environment variables from .env are loaded even if this module
// is imported before the main server entry point.
if (!process.env.REPL_ID) {
  dotenv.config();
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err.message);
});

export const db = drizzle(pool, { schema });
