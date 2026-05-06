import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Thermometer,
  Package,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { TrailerWithPhotos } from "@shared/schema";
import { formatTypeLabel, formatTrailerName } from "@/lib/trailer-utils";

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

export default function TrailerDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [activeIdx, setActiveIdx] = useState(0);

  const { data: trailer, isLoading, isError } = useQuery<TrailerWithPhotos>({
    queryKey: ["/api/trailers", id],
    queryFn: async () => {
      const res = await fetch(`/api/trailers/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-4xl mx-auto w-full px-4 py-12 space-y-6">
          <Skeleton className="h-[360px] w-full rounded-xl" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !trailer) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Trailer not found</h2>
            <Link href="/">
              <Button variant="outline">Back to inventory</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const sortedPhotos = [...trailer.photos].sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    return a.displayOrder - b.displayOrder;
  });

  const activePhoto = sortedPhotos[activeIdx] ?? null;
  const isAvailable = trailer.status === "available";
  const features: string[] = trailer.features ? JSON.parse(trailer.features) : [];

  const prev = () => setActiveIdx((i) => (i - 1 + sortedPhotos.length) % sortedPhotos.length);
  const next = () => setActiveIdx((i) => (i + 1) % sortedPhotos.length);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Back */}
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 mb-6 -ml-1">
            <ArrowLeft className="w-4 h-4" />
            All trailers
          </Button>
        </Link>

        <div className="grid lg:grid-cols-2 gap-10">
          {/* Photos */}
          <div className="space-y-3">
            {/* Main image */}
            <div className="relative aspect-[4/3] bg-card border border-border rounded-xl overflow-hidden group">
              {activePhoto ? (
                <img
                  src={activePhoto.url}
                  alt="Trailer"
                  className="w-full h-full object-cover transition-all duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  {trailer.type === "reefer" ? (
                    <Thermometer className="w-16 h-16 opacity-20" />
                  ) : (
                    <Package className="w-16 h-16 opacity-20" />
                  )}
                </div>
              )}
              {/* Nav arrows (only if multiple photos) */}
              {sortedPhotos.length > 1 && (
                <>
                  <button
                    onClick={prev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={next}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  {/* Dot indicators */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {sortedPhotos.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveIdx(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          i === activeIdx ? "bg-white" : "bg-white/40"
                        }`}
                        aria-label={`Photo ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {sortedPhotos.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {sortedPhotos.map((photo, i) => (
                  <button
                    key={photo.id}
                    onClick={() => setActiveIdx(i)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                      i === activeIdx ? "border-primary" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <img src={photo.url} alt={`View ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  trailer.type === "reefer" ? "bg-blue-950 text-blue-400" : "bg-red-950 text-red-400"
                }`}>
                  {formatTypeLabel(trailer.type)}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isAvailable ? "bg-green-950 text-green-400" : "bg-yellow-950 text-yellow-400"
                }`}>
                  {isAvailable ? "Available" : trailer.status}
                </span>
              </div>

              <h1 className="text-3xl font-black tracking-tight">
                {formatTrailerName(trailer)}
              </h1>

              {trailer.vin && (
                <p className="text-sm text-muted-foreground font-mono mt-1">VIN: {trailer.vin}</p>
              )}
            </div>

            {/* Pricing */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black">{formatPrice(trailer.priceMonthly)}</span>
                <span className="text-muted-foreground text-base">/month</span>
              </div>
              {trailer.type === "reefer" && trailer.engineHourRate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  + {formatPrice(trailer.engineHourRate)} per engine hour (billed separately)
                </div>
              )}
              <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
                No mileage fees · No hidden costs · Security deposit = 2 months rent
              </p>
            </div>

            {/* Description */}
            {trailer.description && (
              <p className="text-muted-foreground text-sm leading-relaxed">{trailer.description}</p>
            )}

            {/* Features */}
            {features.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                  Features
                </h3>
                <ul className="space-y-1.5">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA */}
            {isAvailable ? (
              <Button
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12"
                onClick={() => navigate(`/apply/${trailer.id}`)}
              >
                Apply to Rent This Trailer
              </Button>
            ) : (
              <Button size="lg" className="w-full" variant="outline" disabled>
                Currently Unavailable
              </Button>
            )}
            <p className="text-xs text-center text-muted-foreground">
              Application typically reviewed within 24 hours
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
