import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Thermometer, Package, ArrowRight, Clock, MapPin, Info } from "lucide-react";
import type { PublicTrailer } from "@shared/schema";
import { formatTypeLabel, formatTrailerName, formatPrice } from "@/lib/trailer-utils";
import { isRepresentativePhoto } from "@shared/trailer-format";

function TrailerTypeBadge({ type }: { type: string }) {
  if (type === "reefer") {
    return (
      <span className="type-badge-reefer flex items-center gap-1">
        <Thermometer className="w-3 h-3" />
        Reefer
      </span>
    );
  }
  if (type === "dry_van") {
    return (
      <span className="type-badge-dry_van flex items-center gap-1">
        <Package className="w-3 h-3" />
        Dry Van
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-secondary text-secondary-foreground">
      {formatTypeLabel(type)}
    </span>
  );
}

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  rented: "Rented",
  maintenance: "In Service",
  inactive: "Retired",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "available") {
    return (
      <span className="badge-available">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        Available
      </span>
    );
  }
  if (status === "rented") {
    return (
      <span className="badge-rented">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        Rented
      </span>
    );
  }
  return (
    <span className="badge-maintenance">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

interface TrailerCardProps {
  trailer: PublicTrailer;
  // Opens the expanded details dialog. Without it, the card opens the unit page.
  onQuickView?: (trailer: PublicTrailer) => void;
}

export default function TrailerCard({ trailer, onQuickView }: TrailerCardProps) {
  const [, navigate] = useLocation();
  const primaryPhoto = trailer.photos.find((p) => p.isPrimary) || trailer.photos[0];
  const isAvailable = trailer.status === "available";
  const name = formatTrailerName(trailer);
  const representative = isRepresentativePhoto(primaryPhoto?.url);
  const openDetails = () => (onQuickView ? onQuickView(trailer) : navigate(`/trailers/${trailer.id}`));

  return (
    <div className="trailer-card bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Photo + headline open the expanded details */}
      <button
        type="button"
        onClick={openDetails}
        aria-label={`View details for ${name}`}
        className="text-left w-full group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="relative h-48 bg-muted flex items-center justify-center overflow-hidden">
          {primaryPhoto ? (
            <img
              src={primaryPhoto.url}
              alt={representative ? `${name}, representative fleet photo` : name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              {trailer.type === "reefer" ? (
                <Thermometer className="w-10 h-10 opacity-30" />
              ) : (
                <Package className="w-10 h-10 opacity-30" />
              )}
              <span className="text-xs">Photos coming soon</span>
            </div>
          )}
          <div className="absolute top-3 left-3">
            <StatusBadge status={trailer.status} />
          </div>
          <div className="absolute top-3 right-3">
            <TrailerTypeBadge type={trailer.type} />
          </div>
          {representative && (
            <div className="absolute bottom-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded bg-black/60 text-white/90">
              Representative fleet photo
            </div>
          )}
        </div>

        <div className="p-5 pb-0">
          <h3 className="font-bold text-foreground text-base leading-tight group-hover:text-primary transition-colors">
            {name}
          </h3>
          {(trailer.unitNumber || trailer.vinLast6) && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {[trailer.unitNumber ? `Unit ${trailer.unitNumber}` : null, trailer.vinLast6 ? `VIN ending ${trailer.vinLast6}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {trailer.description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{trailer.description}</p>
          )}
          {trailer.location && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {trailer.location}
            </div>
          )}
        </div>
      </button>

      <div className="p-5 pt-4 flex flex-col flex-1 gap-4">
        {/* Pricing */}
        <div className="space-y-1">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-foreground">{formatPrice(trailer.priceMonthly)}</span>
            <span className="text-muted-foreground text-sm">/month</span>
          </div>
          {trailer.type === "reefer" && trailer.engineHourRate ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              + {formatPrice(trailer.engineHourRate)}/engine hour
            </div>
          ) : null}
          <p className="text-[11px] text-muted-foreground font-medium">
            {trailer.type === "reefer"
              ? trailer.engineHourRate
                ? "No mileage fees. Reefer engine hours billed at the rate above."
                : "Reefer engine hours included. No mileage fees."
              : "No mileage fees. No hidden fees."}
          </p>
        </div>

        {/* CTAs */}
        <div className="mt-auto flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={openDetails}>
            <Info className="w-3.5 h-3.5" />
            Details
          </Button>
          {isAvailable ? (
            <Link href={`/apply/${trailer.id}`} className="flex-1">
              <Button className="w-full bg-primary hover:bg-primary/90 text-white font-semibold gap-2" size="sm">
                Apply to Rent
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <Button className="flex-1" variant="outline" size="sm" disabled>
              Currently Unavailable
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
