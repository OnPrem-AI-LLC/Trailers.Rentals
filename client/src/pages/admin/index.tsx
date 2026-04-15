import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Truck, ClipboardList, BarChart3, Plus, Settings, LogOut,
  FileSignature, CreditCard, Gauge, Search, QrCode, TrendingUp, Shield, Users, Mail, Briefcase,
} from "lucide-react";

interface DashboardSummary {
  totalTrailers: number;
  availableTrailers: number;
  rentedTrailers: number;
  pendingApplications: number;
  activeRentals: number;
  mrr: number;
  pendingPickups: number;
  utilizationRate: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  highlight,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  highlight?: boolean;
  sub?: string;
}) {
  return (
    <div className={`bg-card border rounded-xl p-4 ${highlight ? "border-primary" : "border-border"}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className={`text-2xl font-black ${highlight ? "text-primary" : "text-foreground"}`}>
            {value}
          </p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg flex-shrink-0 ml-2 ${highlight ? "bg-primary/15" : "bg-secondary"}`}>
          <Icon className={`w-4 h-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
        </div>
      </div>
    </div>
  );
}

interface QuickLinkCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  cta: string;
  badge?: string;
  badgeHighlight?: boolean;
  action?: { label: string; href: string; icon: React.ElementType };
}

function QuickLinkCard({ icon: Icon, title, description, href, cta, badge, badgeHighlight, action }: QuickLinkCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">{title}</h2>
        </div>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeHighlight ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4 flex-1">{description}</p>
      <div className="flex flex-col gap-2">
        <Link href={href}>
          <Button variant="outline" size="sm" className="w-full text-xs">{cta}</Button>
        </Link>
        {action && (
          <Link href={action.href}>
            <Button size="sm" className="w-full bg-primary hover:bg-primary/90 text-white gap-1.5 text-xs">
              <action.icon className="w-3 h-3" />{action.label}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function AdminPortal() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/login");
    else if (user.role !== "admin") navigate("/dashboard");
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
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Settings className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Admin Portal</span>
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

        {/* Stats row */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
            <StatCard label="Monthly Revenue" value={`$${(summary.mrr / 100).toLocaleString()}`} icon={TrendingUp} highlight />
            <StatCard label="Active Rentals" value={summary.activeRentals} icon={BarChart3} />
            <StatCard label="Available Trailers" value={summary.availableTrailers} icon={Truck} highlight={summary.availableTrailers > 0} />
            <StatCard label="Utilization" value={`${summary.utilizationRate}%`} icon={Gauge} />
            <StatCard label="Pending Apps" value={summary.pendingApplications} icon={ClipboardList} highlight={summary.pendingApplications > 0} />
            <StatCard label="Pending Pickups" value={summary.pendingPickups} icon={QrCode} highlight={summary.pendingPickups > 0} sub="Active, no QR scan yet" />
          </div>
        ) : null}

        {/* Quick action grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickLinkCard
            icon={Truck}
            title="Trailer Inventory"
            description="Manage your fleet — add units, update status, upload photos, set pricing."
            href="/admin/inventory"
            cta="View Inventory"
            badge={summary ? `${summary.totalTrailers} total` : undefined}
            action={{ label: "Add Trailer", href: "/admin/inventory/new", icon: Plus }}
          />

          <QuickLinkCard
            icon={ClipboardList}
            title="Rental Applications"
            description="Review incoming applications, check FMCSA SAFER data, approve or deny."
            href="/admin/requests"
            cta="View Applications"
            badge={summary?.pendingApplications ? `${summary.pendingApplications} pending` : undefined}
            badgeHighlight={!!summary?.pendingApplications}
          />

          <QuickLinkCard
            icon={FileSignature}
            title="Rentals & Payments"
            description="View all rental contracts, manage billing, generate QR codes, review Stripe history."
            href="/admin/rentals"
            cta="Manage Rentals"
            badge={summary?.activeRentals ? `${summary.activeRentals} active` : undefined}
            badgeHighlight={!!summary?.activeRentals}
          />

          <QuickLinkCard
            icon={Gauge}
            title="Engine Hours"
            description="Submit and review reefer engine hours. Bill surcharges directly via Stripe."
            href="/admin/rentals"
            cta="Go to Rentals → Engine Hours"
          />

          <QuickLinkCard
            icon={QrCode}
            title="QR Pickup & Return"
            description="Generate QR codes for trailer pickup and return confirmation. Track scan status."
            href="/admin/rentals"
            cta="Go to Rentals → QR Codes"
          />

          <QuickLinkCard
            icon={Search}
            title="FMCSA SAFER Lookup"
            description="Look up any carrier in the FMCSA database by DOT or MC number."
            href="/admin/fmcsa"
            cta="Open FMCSA Lookup"
          />

          <QuickLinkCard
            icon={Truck}
            title="Driver Applications"
            description="Review incoming driver job applications, update status, and add internal notes."
            href="/admin/driver-applications"
            cta="View Applications"
          />

          <QuickLinkCard
            icon={Shield}
            title="Audit Log"
            description="Full trail of every admin action — approvals, edits, billing events, status changes."
            href="/admin/audit"
            cta="View Audit Log"
          />

          <QuickLinkCard
            icon={Users}
            title="User Management"
            description="Invite admin accounts, deactivate users, and view all platform users."
            href="/admin/users"
            cta="Manage Users"
          />

          <QuickLinkCard
            icon={ClipboardList}
            title="Contact Inquiries"
            description="Review messages from the website contact form. Mark as read or replied."
            href="/admin/contacts"
            cta="View Contacts"
          />

          <QuickLinkCard
            icon={BarChart3}
            title="Content Management"
            description="Manage customer testimonials shown on the website."
            href="/admin/content"
            cta="Manage Content"
          />

          <QuickLinkCard
            icon={Mail}
            title="Email Logs"
            description="View all outbound emails sent by the platform including invites, reminders, and notifications."
            href="/admin/email-logs"
            cta="View Email Logs"
          />

          <QuickLinkCard
            icon={Briefcase}
            title="Job Listings"
            description="Create, edit, and deactivate open driving positions shown on the public Jobs page."
            href="/admin/jobs"
            cta="Manage Job Listings"
          />
        </div>
      </div>

      <Footer />
    </div>
  );
}
