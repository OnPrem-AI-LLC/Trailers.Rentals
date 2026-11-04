// Shared display helpers for trailers. Used by the React client and by the
// server when it pre-renders listing pages, so a unit is named the same way
// everywhere a person or an agent might read it.

export const TYPE_LABELS: Record<string, string> = {
  dry_van: "Dry Van",
  reefer: "Refrigerated",
  flatbed: "Flatbed",
  chassis: "Chassis",
  specialized: "Specialized",
  tractor: "Tractor",
  box_truck: "Box Truck",
  trailer_jockey: "Trailer Jockey",
};

// Shorter form used inside a unit's headline ("2020 Utility 3000R Reefer").
const HEADLINE_TYPE: Record<string, string> = {
  reefer: "Reefer",
  dry_van: "Dry Van",
  tractor: "Tractor",
};

export function formatTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type.replace(/_/g, " ");
}

export interface TrailerNameParts {
  type: string;
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
}

// "2020 Utility 3000R Reefer", "2014 Wabash Dry Van", "Utility Reefer",
// or "Reefer Trailer" when nothing but the type is known.
export function formatTrailerName(t: TrailerNameParts): string {
  const parts = [t.year, t.make, t.model]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter((p) => p.length > 0);
  const typeName = HEADLINE_TYPE[t.type] ?? formatTypeLabel(t.type);
  return parts.length ? `${parts.join(" ")} ${typeName}` : `${typeName} Trailer`;
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

// Collages composed from other units of the same model line in the fleet live
// under this path. Every surface that shows one labels it, so nobody mistakes
// it for a photo of the listed unit.
export const REPRESENTATIVE_PHOTO_PATH = "/attached_assets/representative/";
export const REPRESENTATIVE_PHOTO_NOTE =
  "Representative photos from the Deluxe Logistics fleet. The listed unit may differ in details.";

export function isRepresentativePhoto(url: string | null | undefined): boolean {
  return !!url && url.includes(REPRESENTATIVE_PHOTO_PATH);
}

// Newest model year first; units with no year on file sort last; ties broken
// by unit number so the order is stable. Used by the public listing, the
// pre-rendered pages, llms.txt and the admin inventory.
export function compareNewestFirst(
  a: { year?: string | null; unitNumber?: string | null },
  b: { year?: string | null; unitNumber?: string | null },
): number {
  const ya = parseInt(a.year ?? "", 10) || 0;
  const yb = parseInt(b.year ?? "", 10) || 0;
  if (yb !== ya) return yb - ya;
  return (a.unitNumber ?? "").localeCompare(b.unitNumber ?? "", undefined, { numeric: true });
}
