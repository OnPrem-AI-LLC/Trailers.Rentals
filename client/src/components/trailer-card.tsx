import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Thermometer, Package, ArrowRight, Clock, MapPin } from "lucide-react";
import type { PublicTrailer } from "@shared/schema";
import { formatTypeLabel, formatTrailerName, formatPrice } from "@/lib/trailer-utils";

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
}

export default function TrailerCard({ trailer }: TrailerCardProps) {
  const primaryPhoto = trailer.photos.find((p) => p.isPrimary) || trailer.photos[0];
  const isAvailable = trailer.status === "available";
  const name = formatTrailerName(trailer);

  return (
    <div className="trailer-card bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Photo */}
      <div className="relative h-48 bg-muted flex items-center justify-center overflow-hidden">
        {primaryPhoto ? (
          <img
            src={primaryPhoto.url}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            {trailer.type === "reefer" ? (
              <Thermometer className="w-10 h-10 opacity-30" />
            ) : (
              <Package className="w-10 h-10 opacity-30" />
            )}
            <span className="text-xs">No photo yet</span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <StatusBadge status={trailer.status} />
        </div>
        <div className="absolute top-3 right-3">
          <TrailerTypeBadge type={trailer.type} />
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1 gap-4">
        <div>
          <h3 className="font-bold text-foreground text-base leading-tight">{name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {trailer.unitNumber ? `Unit ${trailer.unitNumber}` : null}
            {trailer.unitNumber && trailer.vinLast6 ? " · " : null}
            {trailer.vinLast6 ? `VIN ending ${trailer.vinLast6}` : null}
          </p>

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

        {/* Pricing */}
        <div className="space-y-1">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-foreground">
              {formatPrice(trailer.priceMonthly)}
            </span>
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
              ? "No mileage fees. Reefer engine hours billed separately."
              : "No mileage fees. No hidden costs."}
          </p>
        </div>

        {/* CTA */}
        <div className="mt-auto">
          {isAvailable ? (
            <Link href={`/trailers/${trailer.id}`}>
              <Button className="w-full bg-primary hover:bg-primary/90 text-white font-semibold gap-2" size="sm">
                Apply to Rent
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <Button className="w-full" variant="outline" size="sm" disabled>
              Currently Unavailable
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
