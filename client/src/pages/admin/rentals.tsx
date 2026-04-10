import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Truck, Building2, CircleDollarSign, CheckCircle, Clock,
  ArrowRight, ChevronLeft, CreditCard
} from "lucide-react";
import type { Rental } from "@shared/schema";

interface EnrichedRental extends Rental {
  companyName: string;
  companyEmail: string;
  trailerVin: string;
  trailerType: string;
  trailerMake: string | null;
  trailerYear: string | null;
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending_agreement: { label: "Pending Agreement", cls: "text-yellow-400 bg-yellow-950 border-yellow-800" },
  pending_payment:   { label: "Pending Payment",   cls: "text-orange-400 bg-orange-950 border-orange-800" },
  active:            { label: "Active",             cls: "text-green-400 bg-green-950 border-green-800" },
  active_in_use:     { label: "In Use",             cls: "text-blue-400 bg-blue-950 border-blue-800" },
  completed:         { label: "Completed",          cls: "text-muted-foreground bg-muted border-border" },
  cancelled:         { label: "Cancelled",          cls: "text-red-400 bg-red-950 border-red-800" },
};

export default function AdminRentals() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/login");
    else if (user.role !== "admin") navigate("/dashboard");
  }, [user, authLoading, navigate]);

  const { data: rentals, isLoading } = useQuery<EnrichedRental[]>({
    queryKey: ["/api/admin/rentals"],
    queryFn: async () => {
      const res = await fetch("/api/admin/rentals", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load rentals");
      return res.json() as Promise<EnrichedRental[]>;
    },
    enabled: !!user && user.role === "admin",
  });

  const active   = rentals?.filter(r => r.status === "active" || r.status === "active_in_use") ?? [];
  const pending  = rentals?.filter(r => r.status === "pending_agreement" || r.status === "pending_payment") ?? [];
  const historic = rentals?.filter(r => r.status === "completed" || r.status === "cancelled") ?? [];

  function RentalRow({ r }: { r: EnrichedRental }) {
    const s = STATUS_STYLES[r.status] ?? { label: r.status, cls: "text-muted-foreground bg-muted border-border" };
    return (
      <Link href={`/admin/rentals/${r.id}`}>
        <div className="flex items-center gap-4 p-4 hover:bg-secondary/40 cursor-pointer rounded-lg transition-colors border border-transparent hover:border-border group">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Truck className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{r.companyName}</span>
              <span className="text-xs text-muted-foreground">#{r.id.slice(-8).toUpperCase()}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {r.trailerYear ? `${r.trailerYear} ` : ""}
              {r.trailerMake ? `${r.trailerMake} ` : ""}
              {r.trailerType.replace("_", " ")} — VIN {r.trailerVin}
            </div>
          </div>
          <div className="text-right flex-shrink-0 hidden sm:block">
            <div className="text-sm font-semibold">${(r.monthlyRate / 100).toLocaleString()}<span className="text-xs text-muted-foreground font-normal">/mo</span></div>
            <div className="flex items-center gap-1 justify-end mt-1">
              {r.depositPaid ? (
                <span className="text-xs text-green-400 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Deposit paid</span>
              ) : (
                <span className="text-xs text-muted-foreground flex items-center gap-0.5"><CreditCard className="w-3 h-3" /> No deposit</span>
              )}
            </div>
          </div>
          <Badge className={`text-xs border ${s.cls} flex-shrink-0`}>{s.label}</Badge>
          <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
        </div>
      </Link>
    );
  }

  function Section({ title, items, icon: Icon }: { title: string; items: EnrichedRental[]; icon: React.ElementType }) {
    if (!items.length) return null;
    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Icon className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm uppercase tracking-wider">{title}</h2>
          <span className="ml-auto text-xs text-muted-foreground font-mono">{items.length}</span>
        </div>
        <div className="divide-y divide-border/50 px-1 py-1">
          {items.map(r => <RentalRow key={r.id} r={r} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" /> Admin
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-black tracking-tight">Rentals & Agreements</h1>
            <p className="text-muted-foreground text-sm mt-1">All active contracts, payment status, and history</p>
          </div>
        </div>

        {/* Stats strip */}
        {!isLoading && rentals && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: "Active", count: active.length, icon: Truck, color: "text-green-400" },
              { label: "Awaiting Action", count: pending.length, icon: Clock, color: "text-orange-400" },
              { label: "Closed", count: historic.length, icon: CircleDollarSign, color: "text-muted-foreground" },
            ].map(({ label, count, icon: Icon, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
                <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                <div className="text-2xl font-black">{count}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : !rentals || rentals.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-16 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No rentals yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Approve applications to create rental contracts.</p>
          </div>
        ) : (
          <>
            <Section title="Active Rentals" items={active} icon={Truck} />
            <Section title="Awaiting Action" items={pending} icon={Clock} />
            <Section title="Closed Rentals" items={historic} icon={CircleDollarSign} />
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
