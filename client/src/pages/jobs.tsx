import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Truck, MapPin, Clock, DollarSign, CheckCircle } from "lucide-react";

const REQUIREMENTS = [
  "Valid Class A CDL",
  "Clean MVR (Motor Vehicle Record)",
  "Minimum 2 years OTR experience",
  "No DUI/DWI convictions",
  "Ability to pass DOT physical",
  "Must be authorized to work in the US",
];

const BENEFITS = [
  "Competitive per-mile rates",
  "No-touch freight available",
  "Consistent home-time schedule",
  "Late-model equipment",
  "Fuel card & ELD provided",
  "Direct deposit weekly",
];

export default function Jobs() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-14 pb-16 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(352 65% 20% / 0.35), transparent)",
          }}
        />
        <div className="max-w-5xl mx-auto relative">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-px bg-primary" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">
              Now Hiring
            </span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-black leading-none tracking-tight mb-5">
            Drive for{" "}
            <span className="text-primary">Deluxe.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mb-8 leading-relaxed">
            We're looking for professional Class A CDL drivers who take pride in their work.
            Good equipment, fair pay, and a company that treats you like a professional.
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Martinsburg, WV area
            </div>
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              OTR & Regional routes
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Full-time positions
            </div>
          </div>
        </div>
      </section>

      <div className="h-px bg-border mx-4 sm:mx-8 lg:mx-16" />

      {/* Main content */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 mb-14">
            {/* Requirements */}
            <div>
              <h2 className="text-xl font-black mb-5">Requirements</h2>
              <ul className="space-y-3">
                {REQUIREMENTS.map((req) => (
                  <li key={req} className="flex items-start gap-3 text-sm text-foreground">
                    <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>

            {/* Benefits */}
            <div>
              <h2 className="text-xl font-black mb-5">What We Offer</h2>
              <ul className="space-y-3">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-sm text-foreground">
                    <DollarSign className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Application CTA */}
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <h2 className="text-2xl font-black mb-2">Ready to apply?</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
              Send us your resume and a brief introduction. We review every application
              and will be in touch within 2 business days.
            </p>
            <a href="mailto:jobs@deluxelogistics.com?subject=Driver Application">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 h-12 px-8"
              >
                <Truck className="w-5 h-5" />
                Email Your Application
              </Button>
            </a>
            <p className="text-xs text-muted-foreground mt-4">
              Send resume to: jobs@deluxelogistics.com
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
