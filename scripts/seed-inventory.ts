/**
 * seed-inventory.ts
 * Seeds the trailers table from the Deluxe Logistics equipment CSV.
 * Run: npx tsx scripts/seed-inventory.ts
 *
 * Status mapping:
 *   IN USE / In Use  → "rented"
 *   Sell or rent     → "available"
 *   Sell             → "inactive"  (tracked, not listed publicly)
 *   Find Driver / Sell or find driver → "maintenance"
 *   Not usable / Sell for parts       → "inactive"
 *   (blank)          → "available"
 */

import { db } from "../server/db";
import { trailers, trailerPhotos } from "../shared/schema";
import { eq } from "drizzle-orm";

type EquipmentRow = {
  unitNumber: string;
  vin: string;
  year: string;
  make: string;
  type: string;
  status: string;
  description: string;
  features: string[];
  priceMonthly: number;
  photos?: string[]; // relative paths from project root
};

function mapStatus(use: string): string {
  const u = (use || "").toLowerCase().trim();
  if (u.includes("in use")) return "rented";
  if (u.includes("sell or rent") || u.includes("sell or find driver")) return "available";
  if (u.includes("find driver")) return "maintenance";
  if (u.includes("not usable") || u.includes("sell for parts")) return "inactive";
  if (u.includes("sell")) return "inactive";
  return "available";
}

function mapType(rawType: string): string {
  const t = (rawType || "").toLowerCase().trim();
  if (t.includes("reefer")) return "reefer";
  if (t.includes("dry van")) return "dry_van";
  if (t.includes("flatbed")) return "flatbed";
  if (t.includes("tractor")) return "tractor";
  if (t.includes("box truck")) return "box_truck";
  if (t.includes("trailer jockey")) return "trailer_jockey";
  return "specialized";
}

const inventory: EquipmentRow[] = [
  // ── Tractors ──────────────────────────────────────────────
  {
    unitNumber: "9004",
    vin: "1XKYD49X0PJ244660",
    year: "2023",
    make: "Kenworth",
    type: "tractor",
    status: mapStatus("IN USE"),
    description: "2023 Kenworth T680 — currently in service.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/9007/9007-1.jpg"],
  },
  {
    unitNumber: "4659",
    vin: "IXKYD49X4PJ244659",
    year: "2023",
    make: "Kenworth",
    type: "tractor",
    status: mapStatus("Find Driver"),
    description: "2023 Kenworth T680 — available, seeking driver assignment.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/9007/9007-1.jpg"],
  },
  {
    unitNumber: "9007",
    vin: "1XKYD49X3LJ427836",
    year: "2020",
    make: "Kenworth",
    type: "tractor",
    status: mapStatus("Sell"),
    description: "2020 Kenworth T680 sleeper — striking orange finish. Full sleeper cab with upper/lower bunks, leather seats, fold-out table, storage cabinets. Gauge cluster in good condition. Currently needs battery. Available for sale.",
    features: ["T680 sleeper cab", "Upper & lower bunks", "Leather interior", "Fold-out table", "Full storage", "Needs battery"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/9007/9007-1.jpg",
      "/attached_assets/9007/9007-2.jpg",
      "/attached_assets/9007/9007-3.jpg",
      "/attached_assets/9007/9007-4.jpg",
      "/attached_assets/9007/9007-5.jpg",
      "/attached_assets/9007/9007-6.jpg",
      "/attached_assets/9007/9007-7.jpg",
      "/attached_assets/9007/9007-8.jpg",
      "/attached_assets/9007/9007-9.jpg",
    ],
  },
  {
    unitNumber: "3772",
    vin: "1XKYD49XXNJ493772",
    year: "2022",
    make: "Kenworth",
    type: "tractor",
    status: mapStatus("Sell or find driver"),
    description: "2022 Kenworth — needs $10-15K repair.",
    features: ["Needs repair ($10–15K)"],
    priceMonthly: 150000,
    photos: ["/attached_assets/9007/9007-1.jpg"],
  },
  {
    unitNumber: "9012",
    vin: "IXKYDP9X5KJ216640",
    year: "2019",
    make: "Kenworth",
    type: "tractor",
    status: mapStatus("Sell for parts"),
    description: "2019 Kenworth T660 sleeper — available for parts. Cab interior stripped (dash removed, wiring exposed). Sleeper bunk intact. Engine present and accessible. Good source for drivetrain and sleeper components.",
    features: ["T660 sleeper cab", "Engine present", "Sleeper bunk intact", "Stripped interior — parts only"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/9012/9012-1.jpg",
      "/attached_assets/9012/9012-2.jpg",
      "/attached_assets/9012/9012-3.jpg",
      "/attached_assets/9012/9012-4.jpg",
      "/attached_assets/9012/9012-5.jpg",
      "/attached_assets/9012/9012-6.jpg",
    ],
  },
  // ── Box Truck ─────────────────────────────────────────────
  {
    unitNumber: "3",
    vin: "WDXPF445899406961",
    year: "2009",
    make: "Dodge",
    type: "box_truck",
    status: mapStatus("Sell or use"),
    description: "2009 Dodge Sprinter box truck — needs alternator, currently not running.",
    features: ["Needs alternator"],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  // ── Trailer Jockey ────────────────────────────────────────
  {
    unitNumber: "4",
    vin: "4LMBR211BL022481",
    year: "2011",
    make: "Trailer Jockey",
    type: "trailer_jockey",
    status: mapStatus("Sell"),
    description: "2011 Trailer Jockey yard spotter — usable condition. Simple cab interior with manual controls and fifth wheel coupling. Surface rust on body panels. 11R22.5 tires. Available for sale.",
    features: ["Yard spotter / hostler", "Fifth wheel coupling", "Manual controls", "11R22.5 tires", "Usable condition"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/unit4/unit4-1.jpg",
      "/attached_assets/unit4/unit4-2.jpg",
      "/attached_assets/unit4/unit4-3.jpg",
      "/attached_assets/unit4/unit4-4.jpg",
      "/attached_assets/unit4/unit4-5.jpg",
    ],
  },
  // ── Reefers ───────────────────────────────────────────────
  {
    unitNumber: "5061",
    vin: "IUYVS25327M160206",
    year: "2007",
    make: "Utility",
    type: "reefer",
    status: mapStatus("Sell or rent"),
    description: "2007 Utility reefer — usable, decent condition.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "5062",
    vin: "1UYVS25347M160207",
    year: "2007",
    make: "Utility",
    type: "reefer",
    status: mapStatus("IN USE"),
    description: "2007 Utility 3000R reefer — Carrier Precedent S-700 refrigeration unit. CARB 2026 compliant. Mfg 08/2006. Federal inspection March 2023, Ashburn VA. Currently in service.",
    features: ["Utility 3000R", "Carrier Precedent S-700", "CARB 2026 compliant", "Interior liner intact"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/5062/5062-1.jpg",
      "/attached_assets/5062/5062-2.jpg",
      "/attached_assets/5062/5062-3.jpg",
      "/attached_assets/5062/5062-4.jpg",
      "/attached_assets/5062/5062-5.jpg",
      "/attached_assets/5062/5062-6.jpg",
    ],
  },
  {
    unitNumber: "5074",
    vin: "1UYVS2539AM887902",
    year: "2010",
    make: "Utility",
    type: "reefer",
    status: mapStatus("Sell or rent"),
    description: "2010 Utility reefer — reefer unit not cooling, does not start.",
    features: ["Reefer unit needs service", "Does not start"],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "5086",
    vin: "1UYVS2534BM152620",
    year: "2011",
    make: "Utility",
    type: "reefer",
    status: mapStatus("Sell"),
    description: "2011 Utility reefer.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "5120",
    vin: "IUYVS2535GM663308",
    year: "2016",
    make: "Utility",
    type: "reefer",
    status: mapStatus("Sell"),
    description: "2016 Utility reefer — air ride suspension.",
    features: ["Air Ride"],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "5201",
    vin: "1UYVS2533EU857509",
    year: "2014",
    make: "Utility",
    type: "reefer",
    status: mapStatus("Sell or rent"),
    description: "2014 Utility reefer — needs reefer unit replacement.",
    features: ["Needs reefer unit"],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "5202",
    vin: "1UYVS2535FM226004",
    year: "2015",
    make: "Utility",
    type: "reefer",
    status: mapStatus("In Use"),
    description: "2015 Utility 3000R reefer — Thermo King reefer unit. Clean interior with aluminum T-floor. Currently in service.",
    features: ["Utility 3000R", "Thermo King reefer unit", "Aluminum T-floor", "Clean interior"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/5202/5202-1.jpg",
      "/attached_assets/5202/5202-2.jpg",
      "/attached_assets/5202/5202-3.jpg",
      "/attached_assets/5202/5202-4.jpg",
      "/attached_assets/5202/5202-5.jpg",
      "/attached_assets/5202/5202-6.jpg",
      "/attached_assets/5202/5202-7.jpg",
      "/attached_assets/5202/5202-8.jpg",
      "/attached_assets/5202/5202-9.jpg",
      "/attached_assets/5202/5202-10.jpg",
    ],
  },
  {
    unitNumber: "5225",
    vin: "IJJV532B3BL382184",
    year: "2011",
    make: "WANC",
    type: "reefer",
    status: mapStatus("Sell or rent"),
    description: "2011 WANC reefer.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "8",
    vin: "IDW1A5327JS807613",
    year: "2013",
    make: "Utility",
    type: "reefer",
    status: mapStatus("Sell"),
    description: "2013 Utility reefer.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "11",
    vin: "3H3V532C0ET144001",
    year: "2014",
    make: "Hyundai",
    type: "reefer",
    status: mapStatus("Sell or Rent"),
    description: "2014 Hyundai reefer — roll-up doors.",
    features: ["Roll-up doors"],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "2",
    vin: "1UYVS2539CU257039",
    year: "2012",
    make: "Utility",
    type: "reefer",
    status: mapStatus("Sell"),
    description: "2012 Utility reefer.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "5",
    vin: "IJJV532B2AL328406",
    year: "2010",
    make: "Wabash",
    type: "reefer",
    status: mapStatus("Sell"),
    description: "2010 Wabash reefer.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  {
    unitNumber: "14",
    vin: "1GRAP0628FK243468",
    year: "2015",
    make: "Great Dane",
    type: "reefer",
    status: mapStatus("Sell"),
    description: "2015 Great Dane reefer.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/5213/5213-1.jpg"],
  },
  // ── Wabash Dry Vans (photos on file) ────────────────────────
  {
    unitNumber: "5821",
    vin: "UNKNOWN-5821",
    year: "",
    make: "Wabash",
    type: "dry_van",
    status: "available",
    description: "Wabash National 53' dry van — Unit #5821. FMCSA inspected June 2024.",
    features: ["53 ft", "FMCSA inspected June 2024"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/5821/5821-1.jpg",
      "/attached_assets/5821/5821-2.jpg",
      "/attached_assets/5821/5821-3.jpg",
    ],
  },
  {
    unitNumber: "5686",
    vin: "UNKNOWN-5686",
    year: "",
    make: "Wabash",
    type: "dry_van",
    status: "available",
    description: "Wabash National Duraplate dry van — Unit #5686. Good condition.",
    features: ["Duraplate sidewalls"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/5686/5686-1.jpg",
      "/attached_assets/5686/5686-2.jpg",
      "/attached_assets/5686/5686-3.jpg",
      "/attached_assets/5686/5686-4.jpg",
    ],
  },
  // ── New units from July 6/14 photo batch ────────────────
  {
    unitNumber: "5213",
    vin: "1UYVS2535J6121007",
    year: "2018",
    make: "Utility",
    type: "reefer",
    status: "available",
    description: "2018 Utility 3000R reefer — 53', Carrier Precedent reefer unit. Deluxe Logistics branding. Mfg 06/2017.",
    features: ["53 ft", "Utility 3000R", "Carrier Precedent reefer unit"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/5213/5213-1.jpg",
      "/attached_assets/5213/5213-2.jpg",
      "/attached_assets/5213/5213-3.jpg",
      "/attached_assets/5213/5213-4.jpg",
      "/attached_assets/5213/5213-5.jpg",
      "/attached_assets/5213/5213-6.jpg",
    ],
  },
  {
    unitNumber: "5221",
    vin: "UNKNOWN-5221",
    year: "",
    make: "Utility",
    type: "reefer",
    status: "available",
    description: "Utility 3000R reefer — Carrier Precedent reefer unit. Deluxe Logistics branding.",
    features: ["Utility 3000R", "Carrier Precedent reefer unit"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/5221/5221-1.jpg",
      "/attached_assets/5221/5221-2.jpg",
      "/attached_assets/5221/5221-3.jpg",
      "/attached_assets/5221/5221-4.jpg",
    ],
  },
  {
    unitNumber: "5216",
    vin: "1UYVS253XL2875112",
    year: "2020",
    make: "Utility",
    type: "reefer",
    status: "available",
    description: "2020 Utility 3000R reefer — Thermo King reefer unit. Mfg 06/2019.",
    features: ["Utility 3000R", "Thermo King reefer unit"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/5216/5216-1.jpg",
      "/attached_assets/5216/5216-2.jpg",
      "/attached_assets/5216/5216-3.jpg",
      "/attached_assets/5216/5216-4.jpg",
      "/attached_assets/5216/5216-5.jpg",
      "/attached_assets/5216/5216-6.jpg",
    ],
  },
  {
    unitNumber: "5121",
    vin: "1UYVS2537GM663309",
    year: "2016",
    make: "Utility",
    type: "reefer",
    status: "available",
    description: "2016 Utility 3000R reefer — Deluxe Logistics branding. Plate 533-2124.",
    features: ["Utility 3000R", "Deluxe Logistics branding"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/5121/5121-1.jpg",
    ],
  },
  {
    unitNumber: "5708",
    vin: "1JJV532D3EL791503",
    year: "2014",
    make: "Wabash",
    type: "dry_van",
    status: "available",
    description: "2014 Wabash dry van — Unit #5708. White. Clean interior, minor exterior scratches.",
    features: ["White", "Clean interior"],
    priceMonthly: 150000,
    photos: [
      "/attached_assets/5708/5708-1.jpg",
      "/attached_assets/5708/5708-2.jpg",
    ],
  },
  // ── Dry Van ───────────────────────────────────────────────
  {
    unitNumber: "5093",
    vin: "1GRAA06269W700079",
    year: "2009",
    make: "Great Dane",
    type: "dry_van",
    status: mapStatus("Sell"),
    description: "2009 Great Dane dry van.",
    features: [],
    priceMonthly: 150000,
    photos: ["/attached_assets/5686/5686-1.jpg"],
  },
];

async function main() {
  console.log(`Seeding ${inventory.length} equipment records...`);

  for (const item of inventory) {
    const existing = item.vin
      ? await db.select().from(trailers).where(eq(trailers.vin, item.vin))
      : await db.select().from(trailers).where(eq(trailers.unitNumber, item.unitNumber));

    let trailerId: string;

    if (existing.length > 0) {
      trailerId = existing[0].id;
      await db
        .update(trailers)
        .set({
          unitNumber: item.unitNumber,
          year: item.year,
          make: item.make,
          type: item.type,
          status: item.status,
          description: item.description,
          features: JSON.stringify(item.features),
          priceMonthly: item.priceMonthly,
        })
        .where(eq(trailers.id, trailerId));
      console.log(`  Updated: Unit #${item.unitNumber} (${item.vin})`);
    } else {
      const [inserted] = await db.insert(trailers).values({
        unitNumber: item.unitNumber,
        vin: item.vin,
        year: item.year,
        make: item.make,
        type: item.type,
        status: item.status,
        description: item.description,
        features: JSON.stringify(item.features),
        priceMonthly: item.priceMonthly,
      }).returning();
      trailerId = inserted.id;
      console.log(`  Inserted: Unit #${item.unitNumber} (${item.vin})`);
    }

    // Seed photos if provided
    if (item.photos && item.photos.length > 0) {
      // Clear existing photos for this trailer first
      await db.delete(trailerPhotos).where(eq(trailerPhotos.trailerId, trailerId));
      for (let i = 0; i < item.photos.length; i++) {
        await db.insert(trailerPhotos).values({
          trailerId,
          url: item.photos[i],
          isPrimary: i === 0,
          displayOrder: i,
        });
      }
      console.log(`    → ${item.photos.length} photo(s) linked`);
    }
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
