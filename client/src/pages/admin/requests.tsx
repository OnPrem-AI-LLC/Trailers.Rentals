import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  HelpCircle,
  Search,
  ChevronRight,
} from "lucide-react";
import type { RentalApplication } from "@shared/schema";

const STATUS_TABS = [
  { value: "all", label: "All", icon: FileText },
  { value: "pending", label: "Pending", icon: Clock },
  { value: "needs_info", label: "Needs Info", icon: HelpCircle },
  { value: "approved", label: "Approved", icon: CheckCircle },
  { value: "rejected", label: "Rejected", icon: XCircle },
];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-950 text-yellow-400 border-yellow-800",
  approved: "bg-green-950 text-green-400 border-green-800",
  rejected: "bg-red-950 text-red-400 border-red-800",
  needs_info: "bg-blue-950 text-blue-400 border-blue-800",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  needs_info: "Needs Info",
};

function formatDate(ts: string | Date): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminRequests() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  // Always call hooks first — redirect in effect
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  const { data: allApps, isLoading } = useQuery<RentalApplication[]>({
    queryKey: ["/api/admin/applications"],
    queryFn: async () => {
      const res = await fetch("/api/admin/applications", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load applications");
      return res.json() as Promise<RentalApplication[]>;
    },
    enabled: !!user && user.role === "admin",
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  const counts = {
    all: allApps?.length ?? 0,
    pending: allApps?.filter(a => a.status === "pending").length ?? 0,
    needs_info: allApps?.filter(a => a.status === "needs_info").length ?? 0,
    approved: allApps?.filter(a => a.status === "approved").length ?? 0,
    rejected: allApps?.filter(a => a.status === "rejected").length ?? 0,
  };

  const filtered = (allApps ?? []).filter((a) => {
    const matchTab = activeTab === "all" || a.status === activeTab;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      a.companyName.toLowerCase().includes(q) ||
      a.dotNumber.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.mcNumber ?? "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <ArrowLeft className="w-4 h-4" />
                Admin
              </Button>
            </Link>
            <span className="text-border">/</span>
            <h1 className="text-lg font-black tracking-tight">Rental Applications</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {STATUS_TABS.map(({ value, label, icon: Icon }) => {
            const count = counts[value as keyof typeof counts];
            const isActive = activeTab === value;
            return (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  isActive
                    ? "bg-primary text-white border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20" : "bg-muted"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by company, DOT, email, or MC number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No applications found</p>
            {search && <p className="text-sm mt-1">Try adjusting your search</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((app) => (
              <Link key={app.id} href={`/admin/requests/${app.id}`}>
                <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:bg-card/80 transition-colors cursor-pointer group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-black text-foreground truncate">{app.companyName}</span>
                        <Badge className={`text-xs border ${STATUS_STYLES[app.status] ?? ""} flex-shrink-0`}>
                          {STATUS_LABELS[app.status] ?? app.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>DOT: <span className="text-foreground font-mono">{app.dotNumber}</span></span>
                        {app.mcNumber && <span>MC: <span className="text-foreground font-mono">{app.mcNumber}</span></span>}
                        <span>{app.email}</span>
                        <span>{app.phone}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5">
                        Submitted {formatDate(app.createdAt)} · Use: {app.intendedUse}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground group-hover:text-foreground">
                        Review
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
