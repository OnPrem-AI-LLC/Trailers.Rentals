// Columns added after the database was first created.
//
// This deploy has no migration runner (drizzle-kit push was run by hand in the
// past), so a new column ships here and is added, idempotently, on every start
// before any query can touch it. Keep shared/schema.ts and this list in step;
// `npm run db:push` afterwards is a no-op for anything listed here.

import { pool } from "./db";

const STATEMENTS = [
  // 2026-11-05: the optional Service Plan, chosen on the application and billed with rent.
  "ALTER TABLE rental_applications ADD COLUMN IF NOT EXISTS service_plan boolean NOT NULL DEFAULT false",
  "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS service_plan_monthly integer NOT NULL DEFAULT 0",
];

export async function ensureSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await pool.query(statement);
    } catch (err) {
      // Logged, not fatal: the public listings do not touch these tables, and
      // a crash loop here would take them down too.
      console.error(`[schema] statement failed, will retry on next start: ${statement}`, err);
    }
  }
}
