import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Truck, Thermometer, ArrowRight, CheckCircle2 } from "lucide-react";
import { REEFER_UNIT, REEFER_UNIT_NOTE, SERVICE_PLAN, formatCents } from "@shared/pricing";

const TRAILER_TYPES = [
  {
    id: "reefers",
    icon: Thermometer,
    name: "Refrigerated (Reefer) Trailers",
    tagline: "Temperature-controlled freight, all year long.",
    description:
      `Produce, meat, dairy, frozen. Every reefer on the lot runs a ${REEFER_UNIT} unit, and the engine hours are included in the rate, so run it the way the load needs.`,
    specs: [
      `${REEFER_UNIT} reefer unit on every trailer`,
      REEFER_UNIT_NOTE.replace(/\.$/, ""),
      "Reefer engine hours included in the monthly rate",
      "Utility 3000R, Hyundai and Wabash bodies",
      "Roll-up or swing rear doors",
    ],
    useCases: ["Produce & fresh food", "Frozen goods", "Pharmaceutical/cold-chain", "Dairy & meat transport"],
  },
  {
    id: "dry-vans",
    icon: Truck,
    name: "Dry Van Trailers",
    tagline: "The workhorse of freight — ready when you are.",
    description:
      "Standard 53' dry vans for general freight at the same flat rate as the reefers. No frills, no surprises: unlimited miles, month to month. Ideal for box goods, palletized freight, and general merchandise.",
    specs: [
      "53' standard length",
      "Wabash bodies, DuraPlate composite sidewalls on select units",
      "Swing rear doors",
      "Unlimited miles, no mileage fees",
    ],
    useCases: ["General merchandise", "Palletized freight", "Box goods", "LTL and FTL loads"],
  },
];

const WHY_LIST = [
  "One flat monthly rate. Reefer engine hours and unlimited miles included",
  "No mileage fees, no hour meter, no fuel surcharges, no admin fees",
  "Month to month with 30 days' notice. No multi-year lease, no fleet minimum",
  `Optional ${SERVICE_PLAN.name}, ${formatCents(SERVICE_PLAN.monthlyCents)}/month: ${SERVICE_PLAN.summary.toLowerCase()}`,
  `${REEFER_UNIT} units on every reefer`,
  "Apply online in about ten minutes; most applications answered within 24 hours",
  "Pick up in Inwood, WV, right off I-81 at exit 5",
];

export default function ServicesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      {/* Hero */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-16 pb-16 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(352 65% 20% / 0.3), transparent)",
          }}
        />
        <div className="max-w-7xl mx-auto relative">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-px bg-primary" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">
              Equipment & Services
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight tracking-tight mb-5 max-w-3xl">
            The right trailer for{" "}
            <span className="text-primary">your load.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed mb-8">
            Reefers and dry vans at one flat monthly rate. Reefer hours included.
            No mileage fees. No BS.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#reefers">
              <Button variant="outline" size="sm" className="gap-2">
                <Thermometer className="w-3.5 h-3.5" /> Reefers
              </Button>
            </a>
            <a href="#dry-vans">
              <Button variant="outline" size="sm" className="gap-2">
                <Truck className="w-3.5 h-3.5" /> Dry Vans
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Trailer Types */}
      <section className="border-t border-border py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-20">
          {TRAILER_TYPES.map(({ id, icon: Icon, name, tagline, description, specs, useCases }, idx) => (
            <div
              key={id}
              id={id}
              className={`grid lg:grid-cols-2 gap-10 items-start ${idx % 2 === 1 ? "lg:flex-row-reverse" : ""}`}
            >
              {/* Visual */}
              <div className={`bg-card border border-border rounded-2xl p-10 flex items-center justify-center min-h-[200px] ${idx % 2 === 1 ? "lg:order-2" : ""}`}>
                <Icon className="w-20 h-20 text-primary/20" strokeWidth={1} />
              </div>

              {/* Info */}
              <div className={idx % 2 === 1 ? "lg:order-1" : ""}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">
                    {name}
                  </span>
                </div>
                <h2 className="text-2xl font-black tracking-tight mb-3">{tagline}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">{description}</p>

                <div className="grid sm:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Specifications</h4>
                    <ul className="space-y-1.5">
                      {specs.map((s) => (
                        <li key={s} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Common Uses</h4>
                    <ul className="space-y-1.5">
                      {useCases.map((u) => (
                        <li key={u} className="flex items-start gap-2 text-sm">
                          <ArrowRight className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                          {u}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <Link href="/#trailers">
                  <Button className="bg-primary hover:bg-primary/90 text-white gap-2">
                    <Truck className="w-4 h-4" />
                    Browse Available Units
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why Deluxe */}
      <section className="border-t border-border py-16 px-4 sm:px-6 lg:px-8 bg-card">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-px bg-primary" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Why Deluxe</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight mb-6">One rate. One invoice. No surprises.</h2>
            <ul className="space-y-3 mb-8">
              {WHY_LIST.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link href="/#trailers">
                <Button className="bg-primary hover:bg-primary/90 text-white gap-2">
                  <Truck className="w-4 h-4" /> Browse Inventory
                </Button>
              </Link>
              <a href="/#contact">
                <Button variant="outline" className="gap-2">
                  Contact Us
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
