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
