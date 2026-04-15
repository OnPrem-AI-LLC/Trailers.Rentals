import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import Header from "@/components/header";
import Footer from "@/components/footer";
import TrailerCard from "@/components/trailer-card";
import { ArrowDown, Zap, DollarSign, BadgeCheck, Truck, Star, Send, CheckCircle2, Phone, Mail, MapPin, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TrailerWithPhotos, Testimonial } from "@shared/schema";

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

const contactSchema = z.object({
  name: z.string().min(2, "Name required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  subject: z.string().min(2, "Subject required"),
  message: z.string().min(10, "Please include a message (at least 10 characters)"),
});
type ContactForm = z.infer<typeof contactSchema>;

function StarRating({ rating = 5 }: { rating?: number | null }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < (rating ?? 5) ? "fill-primary text-primary" : "fill-muted text-muted"}`}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const { toast } = useToast();
  const [contactSent, setContactSent] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");

  const { data: trailers = [], isLoading } = useQuery<TrailerWithPhotos[]>({
    queryKey: ["/api/trailers"],
    queryFn: async () => {
      const res = await fetch("/api/trailers");
      if (!res.ok) throw new Error("Failed to load trailers");
      return res.json();
    },
  });

  const { data: testimonials = [] } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials"],
    queryFn: async () => {
      const res = await fetch("/api/testimonials");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const allAvailable = trailers.filter((t) => t.status === "available");
  const other = trailers.filter((t) => t.status !== "available");

  const locations = useMemo(() => {
    const locs = allAvailable
      .map((t) => (t as TrailerWithPhotos & { location?: string | null }).location)
      .filter((l): l is string => !!l);
    return [...new Set(locs)].sort();
  }, [allAvailable]);

  const available = useMemo(() => {
    return allAvailable.filter((t) => {
      const tWithLoc = t as TrailerWithPhotos & { location?: string | null };
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterLocation !== "all" && tWithLoc.location !== filterLocation) return false;
      return true;
    });
  }, [allAvailable, filterType, filterLocation]);

  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", phone: "", subject: "", message: "" },
  });

  const contactMut = useMutation({
    mutationFn: (data: ContactForm) => apiRequest("POST", "/api/contact", data),
    onSuccess: () => {
      setContactSent(true);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-16 pb-20 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(352 65% 20% / 0.35), transparent)",
          }}
        />

        <div className="max-w-7xl mx-auto relative">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-px bg-primary" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">
              Deluxe Logistics Equipment Rental
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-none tracking-tight mb-6 max-w-3xl">
            Trailer rentals.{" "}
            <span className="text-primary">No BS.</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
            Reefers, dry vans, and more — available now at straightforward monthly rates.
            No mileage fees. No surprise charges. Just the trailer you need.
          </p>

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

      <div className="h-px bg-border mx-4 sm:mx-8 lg:mx-16" />

      {/* ── Trailer Inventory ─────────────────────────────────────── */}
      <section id="trailers" className="py-16 px-4 sm:px-6 lg:px-8 flex-1">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-3xl font-black tracking-tight">Available Now</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Ready to rent — apply online and get on the road fast
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {allAvailable.length > 0 && (
                <span className="text-xs text-muted-foreground mr-1">
                  <Filter className="w-3 h-3 inline mr-1" />
                  Filter:
                </span>
              )}
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="reefer">Reefer</SelectItem>
                  <SelectItem value="dry_van">Dry Van</SelectItem>
                  <SelectItem value="flatbed">Flatbed</SelectItem>
                  <SelectItem value="chassis">Chassis</SelectItem>
                  <SelectItem value="specialized">Specialized</SelectItem>
                </SelectContent>
              </Select>
              {locations.length > 1 && (
                <Select value={filterLocation} onValueChange={setFilterLocation}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {allAvailable.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {available.length} of {allAvailable.length} unit{allAvailable.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
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
                {filterType !== "all" || filterLocation !== "all"
                  ? "No trailers match your filters"
                  : "No trailers available right now"}
              </h3>
              <p className="text-sm text-muted-foreground/70 mb-6">
                {filterType !== "all" || filterLocation !== "all"
                  ? "Try changing your filter selections."
                  : "Check back soon or reach out to discuss your needs."}
              </p>
              {filterType !== "all" || filterLocation !== "all" ? (
                <Button variant="outline" size="sm" onClick={() => { setFilterType("all"); setFilterLocation("all"); }}>
                  Clear Filters
                </Button>
              ) : (
                <a href="#contact">
                  <Button variant="outline" size="sm">Contact Us</Button>
                </a>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {available.map((trailer) => (
                <TrailerCard key={trailer.id} trailer={trailer} />
              ))}
            </div>
          )}

          {!isLoading && other.length > 0 && (
            <div className="mt-14">
              <h3 className="text-lg font-bold text-muted-foreground mb-4">Other Units</h3>
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

      {/* ── Testimonials ─────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="border-t border-border py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-px bg-primary" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">What carriers say</span>
              </div>
              <h2 className="text-2xl font-black tracking-tight">Trusted by operators</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <div key={t.id} className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4">
                  <StarRating rating={t.rating} />
                  <blockquote className="text-sm text-foreground leading-relaxed flex-1">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div className="pt-2 border-t border-border">
                    <p className="font-bold text-sm">{t.customerName}</p>
                    {t.companyName && (
                      <p className="text-xs text-muted-foreground">{t.companyName}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Contact ──────────────────────────────────────────────── */}
      <section id="contact" className="border-t border-border py-16 px-4 sm:px-6 lg:px-8 bg-card">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Left: info */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-px bg-primary" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Get in touch</span>
              </div>
              <h2 className="text-3xl font-black tracking-tight mb-4">
                Questions? We'll get back to you fast.
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-8">
                Not sure what trailer fits your operation? Want to know more about our rates or availability?
                Drop us a message and we'll respond within one business day.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <a href="mailto:info@deluxelogistics.com" className="hover:text-primary transition-colors">
                    info@deluxelogistics.com
                  </a>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 text-primary" />
                  </div>
                  <a href="tel:+18005550100" className="hover:text-primary transition-colors">
                    (800) 555-0100
                  </a>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-muted-foreground">818 Corning Way, Martinsburg, WV 25401</span>
                </div>
              </div>
            </div>

            {/* Right: form */}
            <div className="bg-background border border-border rounded-xl p-6">
              {contactSent ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                  <CheckCircle2 className="w-12 h-12 text-primary" />
                  <h3 className="text-lg font-bold">Message sent!</h3>
                  <p className="text-sm text-muted-foreground">
                    We'll get back to you within one business day.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setContactSent(false)} className="mt-2">
                    Send another message
                  </Button>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((d) => contactMut.mutate(d))} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Full Name</FormLabel>
                            <FormControl>
                              <Input placeholder="John Smith" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Email</FormLabel>
                            <FormControl>
                              <Input placeholder="john@example.com" type="email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Phone (optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="(555) 000-0000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="subject"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Subject</FormLabel>
                            <FormControl>
                              <Input placeholder="Trailer availability" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Message</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Tell us what you're looking for..."
                              rows={4}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      disabled={contactMut.isPending}
                      className="w-full bg-primary hover:bg-primary/90 text-white gap-2"
                    >
                      <Send className="w-4 h-4" />
                      {contactMut.isPending ? "Sending..." : "Send Message"}
                    </Button>
                  </form>
                </Form>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
