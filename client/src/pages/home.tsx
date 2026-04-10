import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/header";
import Footer from "@/components/footer";
import TrailerCard from "@/components/trailer-card";
import { ArrowDown, Zap, DollarSign, BadgeCheck, Truck } from "lucide-react";
import type { TrailerWithPhotos } from "@shared/schema";

const VALUE_PROPS = [
  {
    icon: DollarSign,
    label: "No BS Fees",
    detail: "What you see is what you pay",
  },
  {
    icon: Zap,
    label: "No Mileage Fees",
    detail: "Drive as far as you need",
  },
  {
    icon: BadgeCheck,
    label: "Simple & Fast",
    detail: "Apply in minutes, not days",
  },
];

export default function Home() {
  const { data: trailers = [], isLoading } = useQuery<TrailerWithPhotos[]>({
    queryKey: ["/api/trailers"],
    queryFn: async () => {
      const res = await fetch("/api/trailers");
      if (!res.ok) throw new Error("Failed to load trailers");
      return res.json();
    },
  });

  const available = trailers.filter((t) => t.status === "available");
  const other = trailers.filter((t) => t.status !== "available");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-16 pb-20 overflow-hidden">
        {/* Background accent */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(352 65% 20% / 0.35), transparent)",
          }}
        />

        <div className="max-w-7xl mx-auto relative">
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-px bg-primary" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">
              Deluxe Logistics Equipment Rental
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-none tracking-tight mb-6 max-w-3xl">
            Trailer rentals.{" "}
            <span className="text-primary">No BS.</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
            Reefers, dry vans, and more — available now at straightforward monthly rates.
            No mileage fees. No surprise charges. Just the trailer you need.
          </p>

          {/* Value props */}
          <div className="flex flex-wrap gap-3 mb-10">
            {VALUE_PROPS.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="value-pill gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-foreground text-xs">{label}</div>
                  <div className="text-[11px] text-muted-foreground">{detail}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-4">
            <a href="#trailers">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 h-12 px-8">
                <Truck className="w-5 h-5" />
                Browse Available Trailers
              </Button>
            </a>
            <a href="#trailers" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowDown className="w-4 h-4" />
              {available.length > 0 ? `${available.length} unit${available.length !== 1 ? "s" : ""} available now` : "See availability"}
            </a>
          </div>
        </div>
      </section>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div className="h-px bg-border mx-4 sm:mx-8 lg:mx-16" />

      {/* ── Trailer Inventory ─────────────────────────────────────── */}
      <section id="trailers" className="py-16 px-4 sm:px-6 lg:px-8 flex-1">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl font-black tracking-tight">
                Available Now
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                Ready to rent — apply online and get on the road fast
              </p>
            </div>
            {available.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {available.length} unit{available.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
                  <Skeleton className="h-48 w-full rounded-none" />
                  <div className="p-5 space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : available.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-xl">
              <Truck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground mb-1">
                No trailers available right now
              </h3>
              <p className="text-sm text-muted-foreground/70 mb-6">
                Check back soon or reach out to discuss your needs.
              </p>
              <a href="mailto:info@deluxelogistics.com">
                <Button variant="outline" size="sm">
                  Contact Us
                </Button>
              </a>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {available.map((trailer) => (
                <TrailerCard key={trailer.id} trailer={trailer} />
              ))}
            </div>
          )}

          {/* Other trailers (rented/maintenance) */}
          {!isLoading && other.length > 0 && (
            <div className="mt-14">
              <h3 className="text-lg font-bold text-muted-foreground mb-4">
                Other Units
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 opacity-60">
                {other.map((trailer) => (
                  <TrailerCard key={trailer.id} trailer={trailer} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────── */}
      <section className="border-t border-border py-16 px-4 sm:px-6 lg:px-8 bg-card">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-black tracking-tight mb-10">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Pick your trailer",
                detail: "Browse available inventory above. Select the unit that fits your operation.",
              },
              {
                step: "02",
                title: "Submit an application",
                detail: "Fill out a quick form. We'll review your MC/DOT and get back to you fast.",
              },
              {
                step: "03",
                title: "Sign & get rolling",
                detail: "Sign the agreement, pay the deposit, and pick up your trailer — all online.",
              },
            ].map(({ step, title, detail }) => (
              <div key={step} className="flex gap-4">
                <div className="text-4xl font-black text-primary/20 leading-none select-none">{step}</div>
                <div>
                  <h3 className="font-bold text-foreground mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
