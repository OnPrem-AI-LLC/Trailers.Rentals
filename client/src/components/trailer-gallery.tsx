import { useState } from "react";
import { Thermometer, Package, ChevronLeft, ChevronRight } from "lucide-react";
import type { TrailerPhoto } from "@shared/schema";

interface TrailerGalleryProps {
  photos: TrailerPhoto[];
  name: string;
  type: string;
}

// Main image with arrows, dots and thumbnails. Shared by the unit page and
// the quick-view dialog on the home page.
export default function TrailerGallery({ photos, name, type }: TrailerGalleryProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  const sorted = [...photos].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.displayOrder - b.displayOrder;
  });
  const active = sorted[activeIdx] ?? sorted[0] ?? null;
  const prev = () => setActiveIdx((i) => (i - 1 + sorted.length) % sorted.length);
  const next = () => setActiveIdx((i) => (i + 1) % sorted.length);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] bg-card border border-border rounded-xl overflow-hidden group">
        {active ? (
          <img src={active.url} alt={name} className="w-full h-full object-cover transition-all duration-300" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {type === "reefer" ? (
              <Thermometer className="w-16 h-16 opacity-20" />
            ) : (
              <Package className="w-16 h-16 opacity-20" />
            )}
            <span className="text-xs">Photos coming soon</span>
          </div>
        )}
        {sorted.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              aria-label="Next photo"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {sorted.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === activeIdx ? "bg-white" : "bg-white/40"}`}
                  aria-label={`Photo ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {sorted.length > 1 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {sorted.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                i === activeIdx ? "border-primary" : "border-border hover:border-primary/50"
              }`}
            >
              <img src={photo.url} alt={`${name}, view ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
