const TYPE_LABELS: Record<string, string> = {
  dry_van: "Dry Van",
  reefer: "Refrigerated",
  flatbed: "Flatbed",
  chassis: "Chassis",
  specialized: "Specialized",
  tractor: "Tractor",
  box_truck: "Box Truck",
  trailer_jockey: "Trailer Jockey",
};

export function formatTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type.replace("_", " ");
}

export function formatTrailerName(trailer: { type: string; make?: string | null; model?: string | null; year?: string | number | null }): string {
  if (trailer.make && trailer.model) {
    return `${trailer.year || ""} ${trailer.make} ${trailer.model}`.trim();
  }
  return `${formatTypeLabel(trailer.type)} Trailer`;
}
