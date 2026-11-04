// One-time production data fixes that ship with a deploy.
//
// Each fix is keyed in site_content so it runs exactly once per database,
// and every change is logged with the unit numbers it touched so it can be
// reversed by hand from the admin inventory page if needed.

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { trailers } from "@shared/schema";
import { storage } from "./storage";

const FIX_KEY = "datafix:2026-11-04-reprice-and-unlist";

const NEW_PRICE_CENTS = 169900; // $1,699/month, the list price from Nov 2026
const OLD_DEFAULT_CENTS = 150000; // the seed default every unit still carried
const RENTABLE_TYPES = ["reefer", "dry_van"];

// Units that need service before they can be rented. They stay in the admin
// inventory and come back with one click ("Publish to site") once repaired.
//   5074: 2010 Utility reefer, unit not cooling, does not start
//   5201: 2014 Utility reefer, needs reefer unit replacement
//   3772: 2022 Kenworth tractor, needs $10-15K repair
const NEEDS_SERVICE_UNITS = ["5074", "5201", "3772"];

const DEFAULT_LOCATION = "Martinsburg, WV";

export async function runDataFixes(): Promise<void> {
  try {
    if (await storage.getSiteContent(FIX_KEY)) return;

    const repriced = await db
      .update(trailers)
      .set({ priceMonthly: NEW_PRICE_CENTS })
      .where(and(inArray(trailers.type, RENTABLE_TYPES), eq(trailers.priceMonthly, OLD_DEFAULT_CENTS)))
      .returning({ unitNumber: trailers.unitNumber });

    const hidden = await db
      .update(trailers)
      .set({ status: "maintenance" })
      .where(and(inArray(trailers.unitNumber, NEEDS_SERVICE_UNITS), eq(trailers.status, "available")))
      .returning({ unitNumber: trailers.unitNumber });

    const located = await db
      .update(trailers)
      .set({ location: DEFAULT_LOCATION })
      .where(isNull(trailers.location))
      .returning({ unitNumber: trailers.unitNumber });

    const summary = {
      ranAt: new Date().toISOString(),
      repricedTo: NEW_PRICE_CENTS,
      repriced: repriced.map((r) => r.unitNumber),
      hidden: hidden.map((r) => r.unitNumber),
      located: located.map((r) => r.unitNumber),
    };
    await storage.setSiteContent(FIX_KEY, JSON.stringify(summary));
    console.log(`[datafix] applied ${FIX_KEY}: ${JSON.stringify(summary)}`);
  } catch (err) {
    console.error("[datafix] failed; it will run again on the next start:", err);
  }
}
