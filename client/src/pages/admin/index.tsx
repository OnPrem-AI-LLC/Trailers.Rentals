import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, ClipboardList, BarChart3, Plus, Settings, LogOut } from "lucide-react";

interface DashboardSummary {
  totalTrailers: number;
  availableTrailers: number;
  rentedTrailers: number;
  pendingApplications: number;
  activeRentals: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-card border rounded-xl p-5 ${highlight ? "border-primary" : "border-border"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`text-3xl font-black mt-1 ${highlight ? "text-primary" : "text-foreground"}`}>
            {value}
          </p>
        </div>
        <div className={`p-2 rounded-lg ${highlight ? "bg-primary/15" : "bg-secondary"}`}>
          <Icon className={`w-5 h-5 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
        </div>
      </div>
    </div>
  );
}

export default function AdminPortal() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
    if (!authLoading && user && user.role !== "admin") navigate("/dashboard");
  }, [user, authLoading, navigate]);

  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/admin/dashboard"],
    enabled: !!user && user.role === "admin",
    queryFn: async () => {
      const res = await fetch("/api/admin/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Settings className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Admin Portal
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout().then(() => navigate("/"))}
            className="text-muted-foreground gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>

        {/* Stats */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
            <StatCard label="Total Trailers" value={summary.totalTrailers} icon={Truck} />
            <StatCard label="Available" value={summary.availableTrailers} icon={Truck} highlight />
            <StatCard label="Rented" value={summary.rentedTrailers} icon={Truck} />
            <StatCard label="Pending Apps" value={summary.pendingApplications} icon={ClipboardList} highlight={summary.pendingApplications > 0} />
            <StatCard label="Active Rentals" value={summary.activeRentals} icon={BarChart3} />
          </div>
        ) : null}

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Trailer Management */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                <h2 className="font-bold">Trailer Inventory</h2>
              </div>
              <Link href="/admin/trailers/new">
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-white gap-2">
                  <Plus className="w-4 h-4" />
                  Add Trailer
                </Button>
              </Link>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Manage your trailer fleet — add units, update status, upload photos.
            </p>
            <Link href="/admin/trailers">
              <Button variant="outline" size="sm" className="w-full">
                Manage Trailers
              </Button>
            </Link>
          </div>

          {/* Applications */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="w-5 h-5 text-primary" />
              <h2 className="font-bold">Rental Applications</h2>
              {summary && summary.pendingApplications > 0 && (
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  {summary.pendingApplications} pending
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Review incoming applications, check FMCSA SAFER data, approve or deny.
            </p>
            <Link href="/admin/applications">
              <Button variant="outline" size="sm" className="w-full">
                View Applications
              </Button>
            </Link>
          </div>
        </div>

        {/* More admin sections (coming soon placeholders) */}
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {[
            { label: "Rentals & Agreements", desc: "Active contracts, signatures, pickup codes" },
            { label: "Payments & Billing", desc: "Stripe subscriptions, deposits, invoices" },
            { label: "Engine Hour Logs", desc: "Submit and review reefer engine hours" },
          ].map(({ label, desc }) => (
            <div
              key={label}
              className="bg-card border border-border border-dashed rounded-xl p-5 opacity-60"
            >
              <h3 className="font-semibold text-sm mb-1">{label}</h3>
              <p className="text-xs text-muted-foreground">{desc}</p>
              <div className="mt-3 text-xs text-muted-foreground/60 font-mono">Coming soon</div>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}
