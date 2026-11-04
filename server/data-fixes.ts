// One-time production data fixes that ship with a deploy.
//
// Each fix is keyed in site_content so it runs exactly once per database,
// and every change is logged with the unit numbers it touched so it can be
// reversed by hand from the admin inventory page if needed.

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { trailers } from "@shared/schema";
import { storage } from "./storage";

interface DataFix {
  key: string;
  run: () => Promise<Record<string, unknown>>;
}

// ── 2026-11-04: reprice to $1,699, hide units that need service ───────────

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

async function repriceAndUnlist() {
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

  return {
    repricedTo: NEW_PRICE_CENTS,
    repriced: repriced.map((r) => r.unitNumber),
    hidden: hidden.map((r) => r.unitNumber),
    located: located.map((r) => r.unitNumber),
  };
}

// ── 2026-11-04: listing copy ──────────────────────────────────────────────
//
// Descriptions and features become short, factual spec lines. Condition
// adjectives ("clean interior", "good condition"), branding notes, plate
// numbers, stale inspection dates and anything the headline or status
// already says are dropped. Model and make are filled in where the old text
// named them, so the headline reads "2020 Utility 3000R Reefer".

interface ListingCopy {
  make?: string;
  model?: string;
  description: string | null;
  features: string[];
}

const LISTING_COPY: Record<string, ListingCopy> = {
  "5216": { model: "3000R", description: "Refrigerated trailer with a Thermo King reefer unit. Built 06/2019.", features: ["Thermo King reefer unit"] },
  "5213": { model: "3000R", description: "53-foot refrigerated trailer with a Carrier Precedent reefer unit. Built 06/2017.", features: ["53 ft", "Carrier Precedent reefer unit"] },
  "5121": { model: "3000R", description: null, features: [] },
  "11": { description: "Refrigerated trailer with a roll-up rear door.", features: ["Roll-up rear door"] },
  "5708": { description: "White dry van with minor cosmetic wear on the exterior.", features: [] },
  "5225": { make: "Wabash", description: null, features: [] }, // VIN prefix 1JJ is Wabash National; "WANC" was shorthand
  "5061": { description: null, features: [] },
  "5221": { model: "3000R", description: "Refrigerated trailer with a Carrier Precedent reefer unit.", features: ["Carrier Precedent reefer unit"] },
  "5686": { model: "DuraPlate", description: "Dry van with DuraPlate composite sidewalls.", features: ["DuraPlate composite sidewalls"] },
  "5821": { description: "53-foot dry van.", features: ["53 ft"] },
  "5202": { model: "3000R", description: "Refrigerated trailer with a Thermo King reefer unit and aluminum T-floor.", features: ["Thermo King reefer unit", "Aluminum T-floor"] },
  "5062": { model: "3000R", description: "Refrigerated trailer with a Carrier Precedent S-700 reefer unit. CARB 2026 compliant. Built 08/2006.", features: ["Carrier Precedent S-700 reefer unit", "CARB 2026 compliant"] },
  "5074": { description: "Reefer unit not cooling; does not start. Needs service before rental.", features: [] },
  "5201": { description: "Needs reefer unit replacement before rental.", features: [] },
  "3772": { description: "Needs major repair (estimated $10-15K) before use.", features: [] },
  "4659": { model: "T680", description: null, features: [] },
  "9004": { model: "T680", description: null, features: [] },
};

async function listingCopy() {
  const updated: string[] = [];
  for (const [unitNumber, copy] of Object.entries(LISTING_COPY)) {
    const rows = await db
      .update(trailers)
      .set({
        description: copy.description,
        features: JSON.stringify(copy.features),
        ...(copy.model !== undefined ? { model: copy.model } : {}),
        ...(copy.make !== undefined ? { make: copy.make } : {}),
      })
      .where(eq(trailers.unitNumber, unitNumber))
      .returning({ unitNumber: trailers.unitNumber });
    if (rows.length) updated.push(unitNumber);
  }
  return { updated };
}

const FIXES: DataFix[] = [
  { key: "datafix:2026-11-04-reprice-and-unlist", run: repriceAndUnlist },
  { key: "datafix:2026-11-04-listing-copy", run: listingCopy },
];

export async function runDataFixes(): Promise<void> {
  for (const fix of FIXES) {
    try {
      if (await storage.getSiteContent(fix.key)) continue;
      const summary = { ranAt: new Date().toISOString(), ...(await fix.run()) };
      await storage.setSiteContent(fix.key, JSON.stringify(summary));
      console.log(`[datafix] applied ${fix.key}: ${JSON.stringify(summary)}`);
    } catch (err) {
      console.error(`[datafix] ${fix.key} failed; it will run again on the next start:`, err);
    }
  }
}
