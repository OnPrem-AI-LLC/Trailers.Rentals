// The public (unauthenticated) view of inventory.
//
// Rules:
//  - Only units with status "available" are ever served publicly. Rented and
//    maintenance units are hidden until an admin publishes them again.
//  - The full VIN and the registration document never leave the server.
//  - Reads are cached for a short time so crawlers and agents hitting the
//    home page, /sitemap.xml, /llms.txt and /api/trailers don't each query
//    Postgres.

import { storage } from "./storage";
import type { TrailerWithPhotos, PublicTrailer } from "@shared/schema";

export function parseFeatures(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

// Last six characters of a real VIN; placeholders like "UNKNOWN-5221" are dropped.
export function vinLast6(vin: string | null | undefined): string | null {
  if (!vin) return null;
  const v = vin.trim();
  if (v.length < 6 || /^unknown/i.test(v)) return null;
  return v.slice(-6).toUpperCase();
}

export function toPublicTrailer(t: TrailerWithPhotos): PublicTrailer {
  const { vin, registrationUrl: _registrationUrl, features, ...rest } = t;
  return { ...rest, vinLast6: vinLast6(vin), features: parseFeatures(features) };
}

// Newest units first; ties broken by unit number so the order is stable.
export function sortForListing(a: PublicTrailer, b: PublicTrailer): number {
  const ya = parseInt(a.year ?? "", 10) || 0;
  const yb = parseInt(b.year ?? "", 10) || 0;
  if (yb !== ya) return yb - ya;
  return (a.unitNumber ?? "").localeCompare(b.unitNumber ?? "", undefined, { numeric: true });
}

const TTL_MS = 30_000;
let cache: { at: number; list: PublicTrailer[] } | null = null;

export async function getPublicTrailers(): Promise<PublicTrailer[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
  const rows = await storage.getTrailers("available");
  const list = rows.map(toPublicTrailer).sort(sortForListing);
  cache = { at: Date.now(), list };
  return list;
}

export function invalidatePublicTrailers(): void {
  cache = null;
}

export async function getPublicTrailer(id: string): Promise<PublicTrailer | undefined> {
  const t = await storage.getTrailer(id);
  if (!t || t.status !== "available") return undefined;
  return toPublicTrailer(t);
}
