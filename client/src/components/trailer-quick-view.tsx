import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TrailerGallery from "@/components/trailer-gallery";
import { ArrowRight, Clock, ExternalLink, CheckCircle } from "lucide-react";
import type { PublicTrailer } from "@shared/schema";
import { formatTypeLabel, formatTrailerName, formatPrice } from "@/lib/trailer-utils";
import { REEFER_UNIT, SERVICE_PLAN, formatCents } from "@shared/pricing";

interface TrailerQuickViewProps {
  trailer: PublicTrailer | null;
  onClose: () => void;
}

// Expanded unit details in a dialog, opened by clicking a card on the home
// page. The full page at /trailers/:id stays the shareable, crawlable version.
export default function TrailerQuickView({ trailer, onClose }: TrailerQuickViewProps) {
  return (
    <Dialog open={trailer !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {trailer && <QuickViewBody trailer={trailer} />}
    </Dialog>
  );
}

function QuickViewBody({ trailer }: { trailer: PublicTrailer }) {
  const name = formatTrailerName(trailer);
  const isReefer = trailer.type === "reefer";
  const specLine = [
    trailer.unitNumber ? `Unit ${trailer.unitNumber}` : null,
    trailer.vinLast6 ? `VIN ending ${trailer.vinLast6}` : null,
    trailer.location,
  ]
    .filter(Boolean)
    .join(" · ");

  const specs: [string, string | null | undefined][] = [
    ["Equipment", formatTypeLabel(trailer.type)],
    ["Year", trailer.year],
    ["Make", trailer.make],
    ["Model", trailer.model],
    ["Unit", trailer.unitNumber],
    ["VIN ending", trailer.vinLast6],
    ["Location", trailer.location],
    ["Monthly rate", `${formatPrice(trailer.priceMonthly)}/month`],
    ["Reefer unit", isReefer ? REEFER_UNIT : null],
    [
      "Reefer engine hours",
      isReefer ? (trailer.engineHourRate ? `${formatPrice(trailer.engineHourRate)}/hour` : "Included in the rate") : null,
    ],
    ["Mileage fees", "None"],
    [SERVICE_PLAN.name, `Optional, ${formatCents(SERVICE_PLAN.monthlyCents)}/month`],
    ["Security deposit", `${formatPrice(trailer.priceMonthly * 2)} (2 months)`],
  ];

  return (
    <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0">
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <div className="p-4 md:p-5 bg-muted/20 border-b md:border-b-0 md:border-r border-border">
          <TrailerGallery key={trailer.id} photos={trailer.photos} name={name} type={trailer.type} />
        </div>

        <div className="p-5 md:p-6 space-y-5">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  isReefer ? "bg-blue-950 text-blue-400" : "bg-red-950 text-red-400"
                }`}
              >
                {formatTypeLabel(trailer.type)}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-950 text-green-400">
                Available
              </span>
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight leading-tight">{name}</DialogTitle>
            {specLine ? (
              <DialogDescription className="font-mono text-xs">{specLine}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">Unit details</DialogDescription>
            )}
          </DialogHeader>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black">{formatPrice(trailer.priceMonthly)}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            {isReefer && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Clock className="w-4 h-4" />
                {trailer.engineHourRate
                  ? `+ ${formatPrice(trailer.engineHourRate)} per reefer engine hour (billed separately)`
                  : "Reefer engine hours included"}
              </div>
            )}
            <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
              No mileage fees · {isReefer ? "Engine hours included" : "No hidden fees"} · Optional {formatCents(SERVICE_PLAN.monthlyCents)}/mo {SERVICE_PLAN.name.toLowerCase()} · Deposit = 2 months rent
            </p>
          </div>

          {trailer.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{trailer.description}</p>
          )}

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Specifications</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {specs
                .filter((row): row is [string, string] => !!row[1])
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b border-border/60 py-1">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium text-right">{value}</dd>
                  </div>
                ))}
            </dl>
          </div>

          {trailer.features.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Features</h4>
              <ul className="space-y-1.5">
                {trailer.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Link href={`/apply/${trailer.id}`} className="flex-1">
              <Button className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11 gap-2">
                Apply to Rent
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href={`/trailers/${trailer.id}`}>
              <Button variant="outline" className="w-full h-11 gap-2">
                <ExternalLink className="w-4 h-4" />
                Full listing
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground text-center">Application typically reviewed within 24 hours</p>
        </div>
      </div>
    </DialogContent>
  );
}
