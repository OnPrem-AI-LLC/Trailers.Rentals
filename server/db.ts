import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Railway Postgres uses standard TCP. Neon's serverless WS driver does not work here.
// Use node-postgres (`pg`) for any standard Postgres host.
//
// Notes:
// - Railway internal hostnames (e.g. *.railway.internal) do NOT serve TLS — disable SSL.
// - External Postgres URLs (Neon, Supabase, AWS RDS, etc.) require SSL.
const isRailwayInternal =
  /\.railway\.internal/i.test(process.env.DATABASE_URL ?? "");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRailwayInternal ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
