import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Clock, CheckCircle, AlertCircle } from "lucide-react";
import TrailerGallery from "@/components/trailer-gallery";
import type { PublicTrailer } from "@shared/schema";
import { formatTypeLabel, formatTrailerName, formatPrice } from "@/lib/trailer-utils";
import { SERVICE_PLAN, formatCents } from "@shared/pricing";

export default function TrailerDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: trailer, isLoading, isError } = useQuery<PublicTrailer>({
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
            <h2 className="text-xl font-bold">This unit isn't listed right now</h2>
            <p className="text-muted-foreground text-sm">It may have been rented or taken in for service.</p>
            <Link href="/#trailers">
              <Button variant="outline">See available trailers</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const isAvailable = trailer.status === "available";
  const features = trailer.features;
  const name = formatTrailerName(trailer);


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
          <TrailerGallery photos={trailer.photos} name={name} type={trailer.type} />

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

              <h1 className="text-3xl font-black tracking-tight">{name}</h1>

              {(trailer.unitNumber || trailer.vinLast6 || trailer.location) && (
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  {[
                    trailer.unitNumber ? `Unit ${trailer.unitNumber}` : null,
                    trailer.vinLast6 ? `VIN ending ${trailer.vinLast6}` : null,
                    trailer.location,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            {/* Pricing */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black">{formatPrice(trailer.priceMonthly)}</span>
                <span className="text-muted-foreground text-base">/month</span>
              </div>
              {trailer.type === "reefer" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  {trailer.engineHourRate
                    ? `+ ${formatPrice(trailer.engineHourRate)} per reefer engine hour (billed separately)`
                    : "Reefer engine hours included"}
                </div>
              )}
              <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
                No mileage fees · {trailer.type === "reefer" ? "Engine hours included" : "No hidden fees"} · Optional {formatCents(SERVICE_PLAN.monthlyCents)}/mo {SERVICE_PLAN.name.toLowerCase()} · Deposit = 2 months rent
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
              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12"
                  onClick={() => navigate(`/apply/${trailer.id}`)}
                  disabled={authLoading}
                >
                  Apply to Rent This Trailer
                </Button>
                {!authLoading && !user && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-12 font-bold"
                    onClick={() => navigate(`/login?redirect=/trailers/${trailer.id}`)}
                  >
                    Sign In to Rent This Trailer
                  </Button>
                )}
              </div>
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
