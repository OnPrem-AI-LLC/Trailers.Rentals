import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatTypeLabel } from "@/lib/trailer-utils";
import { compareNewestFirst } from "@shared/trailer-format";
import {
  Plus,
  Pencil,
  QrCode,
  RotateCcw,
  Trash2,
  ArrowLeft,
  Thermometer,
  Package,
  Truck,
  Clock,
  CheckCircle,
} from "lucide-react";
import type { TrailerWithPhotos } from "@shared/schema";

function formatPrice(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

function trailerLabel(t: TrailerWithPhotos) {
  if (t.make && t.model) return `${t.year || ""} ${t.make} ${t.model}`.trim();
  const typeMap: Record<string, string> = {
    reefer: "Reefer", dry_van: "Dry Van", flatbed: "Flatbed",
    chassis: "Chassis", specialized: "Specialized",
  };
  return typeMap[t.type] ?? t.type;
}

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-950 text-green-400 border-green-800",
  rented: "bg-yellow-950 text-yellow-400 border-yellow-800",
  maintenance: "bg-orange-950 text-orange-400 border-orange-800",
  inactive: "bg-zinc-900 text-zinc-500 border-zinc-700",
};

export default function AdminInventory() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");

  const { data: trailers = [], isLoading } = useQuery<TrailerWithPhotos[]>({
    queryKey: ["/api/admin/trailers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/trailers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trailers");
      return res.json();
    },
    enabled: !!user && user.role === "admin",
  });

  const retireMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/trailers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trailers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trailers"] });
      toast({ title: "Trailer retired", description: "Status set to inactive." });
    },
    onError: () => toast({ title: "Error", description: "Could not retire trailer.", variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/trailers/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trailers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trailers"] });
      toast({ title: "Trailer restored", description: "Status set to available." });
    },
    onError: () => toast({ title: "Error", description: "Could not restore trailer.", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/trailers/${id}`, { status }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trailers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trailers"] });
      toast(
        vars.status === "available"
          ? { title: "Published to site", description: "The unit is listed as available to rent." }
          : { title: "Hidden from site", description: "The unit is in service and no longer listed." },
      );
    },
    onError: () => toast({ title: "Error", description: "Could not update status.", variant: "destructive" }),
  });

  const downloadQR = (id: string, vin: string) => {
    const a = document.createElement("a");
    a.href = `/api/admin/trailers/${id}/qr`;
    a.download = `trailer-${vin}-qr.png`;
    a.click();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  const FILTER_OPTS = [
    { label: "All", value: "all" },
    { label: "Available", value: "available" },
    { label: "Rented", value: "rented" },
    { label: "Maintenance", value: "maintenance" },
    { label: "Inactive", value: "inactive" },
  ];

  // Same order as the public site: newest model year first, no-year units last.
  const filtered = (filter === "all" ? trailers : trailers.filter((t) => t.status === filter))
    .slice()
    .sort(compareNewestFirst);

  const counts = {
    total: trailers.filter(t => t.status !== "inactive").length,
    available: trailers.filter(t => t.status === "available").length,
    rented: trailers.filter(t => t.status === "rented").length,
    inactive: trailers.filter(t => t.status === "inactive").length,
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-8">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 -ml-1">
              <ArrowLeft className="w-4 h-4" />
              Admin Portal
            </Button>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-semibold">Inventory</span>
        </div>

        {/* Header row */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Trailer Inventory</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {counts.total} active units · {counts.available} available · {counts.rented} rented
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Only units marked <span className="text-green-400 font-semibold">available</span> appear on the public site.
              Rented and in-service units are hidden automatically; use Hide / Publish to switch a unit.
            </p>
          </div>
          <Link href="/admin/inventory/new">
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold gap-2">
              <Plus className="w-4 h-4" />
              Add Trailer
            </Button>
          </Link>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active", value: counts.total, icon: Truck, color: "text-foreground" },
            { label: "Available", value: counts.available, icon: CheckCircle, color: "text-green-400" },
            { label: "Rented", value: counts.rented, icon: Clock, color: "text-yellow-400" },
            { label: "Inactive", value: counts.inactive, icon: Trash2, color: "text-zinc-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {FILTER_OPTS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                filter === opt.value
                  ? "bg-primary text-white"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
              {opt.value === "all"
                ? ` (${trailers.length})`
                : ` (${trailers.filter(t => t.status === opt.value).length})`}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl py-16 text-center">
            <Truck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No trailers found</p>
            <Link href="/admin/inventory/new">
              <Button variant="outline" size="sm" className="mt-4 gap-2">
                <Plus className="w-3 h-3" />
                Add your first trailer
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((trailer) => {
              const primary = trailer.photos.find(p => p.isPrimary) ?? trailer.photos[0];
              return (
                <div
                  key={trailer.id}
                  className={`bg-card border rounded-xl p-4 flex items-center gap-4 ${
                    trailer.status === "inactive" ? "border-border opacity-60" : "border-border"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden border border-border">
                    {primary ? (
                      <img src={primary.url} alt="trailer" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {trailer.type === "reefer"
                          ? <Thermometer className="w-6 h-6 text-muted-foreground/30" />
                          : <Package className="w-6 h-6 text-muted-foreground/30" />
                        }
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{trailerLabel(trailer)}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLORS[trailer.status] ?? STATUS_COLORS.maintenance}`}>
                        {trailer.status}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {formatTypeLabel(trailer.type)}
                      </span>
                      {trailer.status !== "inactive" && (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            trailer.status === "available"
                              ? "bg-green-950/60 text-green-400"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {trailer.status === "available" ? "Listed on site" : "Hidden from site"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                      VIN: {trailer.vin}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatPrice(trailer.priceMonthly)}/mo
                      {trailer.engineHourRate ? ` · +${formatPrice(trailer.engineHourRate)}/hr` : ""}
                      {" · "}{trailer.photos.length} photo{trailer.photos.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    <Link href={`/admin/inventory/${trailer.id}`}>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                        <Pencil className="w-3 h-3" />
                        Edit
                      </Button>
                    </Link>

                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => downloadQR(trailer.id, trailer.vin ?? trailer.id)}
                    >
                      <QrCode className="w-3 h-3" />
                      QR
                    </Button>

                    {trailer.status === "available" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: trailer.id, status: "maintenance" })}
                      >
                        Hide from site
                      </Button>
                    )}
                    {trailer.status === "maintenance" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-green-400 border-green-800 hover:bg-green-950"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: trailer.id, status: "available" })}
                      >
                        Publish to site
                      </Button>
                    )}

                    {trailer.status === "inactive" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs text-green-400 border-green-800 hover:bg-green-950"
                        disabled={restoreMutation.isPending}
                        onClick={() => restoreMutation.mutate(trailer.id)}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </Button>
                    ) : trailer.status !== "rented" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={retireMutation.isPending}
                        onClick={() => {
                          if (confirm(`Retire trailer ${trailer.vin}? It will be hidden from public inventory.`)) {
                            retireMutation.mutate(trailer.id);
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                        Retire
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
