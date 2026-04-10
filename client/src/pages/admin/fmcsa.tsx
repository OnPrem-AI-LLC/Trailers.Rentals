import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Search, Truck, AlertCircle, CheckCircle, XCircle, Building2 } from "lucide-react";

interface SaferResult {
  success: boolean;
  error?: string;
  data?: {
    dotNumber?: string;
    legalName?: string;
    dbaName?: string;
    carrierOperation?: string;
    entityType?: string;
    operatingStatus?: string;
    mcNumber?: string;
    totalPowerUnits?: number;
    totalDrivers?: number;
    safetyRating?: string;
    safetyRatingDate?: string;
    mcs150Date?: string;
    physicalAddress?: string;
    phoneNumber?: string;
    crashTotal?: number;
    fatalCrash?: number;
    injCrash?: number;
    towCrash?: number;
    inspTotal?: number;
    inspDriverOos?: number;
    inspVehicleOos?: number;
  };
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === "AUTHORIZED FOR HM INSURANCE" || s.includes("ACTIVE") || s === "AUTHORIZED FOR PROPERTY") {
    return <Badge className="bg-green-950 border-green-800 text-green-400 text-xs">{status}</Badge>;
  }
  if (s.includes("NOT") || s.includes("INACTIVE") || s.includes("REVOKED")) {
    return <Badge className="bg-red-950 border-red-800 text-red-400 text-xs">{status}</Badge>;
  }
  return <Badge className="bg-yellow-950 border-yellow-800 text-yellow-400 text-xs">{status}</Badge>;
}

export default function AdminFMCSAPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [dot, setDot] = useState("");
  const [mc, setMc] = useState("");
  const [queryParams, setQueryParams] = useState<{ dot?: string; mc?: string } | null>(null);

  const { data: result, isLoading, isFetching, isError } = useQuery<SaferResult>({
    queryKey: ["/api/admin/fmcsa", queryParams],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (queryParams?.dot) params.set("dot", queryParams.dot);
      if (queryParams?.mc) params.set("mc", queryParams.mc);
      const res = await fetch(`/api/admin/fmcsa?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Lookup failed");
      return res.json();
    },
    enabled: !!queryParams && !!user,
    retry: false,
  });

  if (authLoading || !user) return null;
  if (user.role !== "admin") { navigate("/dashboard"); return null; }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!dot.trim() && !mc.trim()) return;
    setQueryParams({ dot: dot.trim() || undefined, mc: mc.trim() || undefined });
  }

  const d = result?.data;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-4 h-4" />Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Search className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Admin Tool</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">FMCSA SAFER Carrier Lookup</h1>
          </div>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="bg-card border border-border rounded-xl p-5 mb-6">
          <p className="text-sm text-muted-foreground mb-4">
            Look up any carrier in the FMCSA SAFER database by DOT number or MC number.
            Leave one blank to search by only one identifier.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">DOT Number</label>
              <Input
                placeholder="e.g. 1234567"
                value={dot}
                onChange={(e) => setDot(e.target.value.replace(/\D/g, ""))}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">MC Number</label>
              <Input
                placeholder="e.g. 987654"
                value={mc}
                onChange={(e) => setMc(e.target.value.replace(/\D/g, ""))}
                className="h-9"
              />
            </div>
          </div>
          <Button
            type="submit"
            className="bg-primary hover:bg-primary/90 text-white gap-2"
            disabled={isLoading || isFetching || (!dot.trim() && !mc.trim())}
          >
            <Search className="w-4 h-4" />
            {isLoading || isFetching ? "Looking up…" : "Look Up Carrier"}
          </Button>
        </form>

        {/* Results */}
        {isError && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-5 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">Lookup failed. The FMCSA API may be unavailable or the carrier was not found.</p>
          </div>
        )}

        {result && !result.success && !isLoading && (
          <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-5 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-yellow-400">No carrier found. Check the DOT or MC number and try again.</p>
          </div>
        )}

        {result?.success && d && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Building2 className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-black">{d.legalName ?? "Unknown Carrier"}</h2>
                </div>
                {d.dbaName && d.dbaName !== d.legalName && (
                  <p className="text-sm text-muted-foreground italic">DBA: {d.dbaName}</p>
                )}
              </div>
              <StatusBadge status={d.operatingStatus} />
            </div>

            {/* Identity grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "DOT Number", value: d.dotNumber },
                { label: "MC Number", value: d.mcNumber || "N/A" },
                { label: "Entity Type", value: d.entityType },
                { label: "Carrier Operation", value: d.carrierOperation },
                { label: "Safety Rating", value: d.safetyRating || "Not Rated" },
                { label: "Safety Rating Date", value: d.safetyRatingDate ? new Date(d.safetyRatingDate).toLocaleDateString() : "N/A" },
                { label: "Power Units", value: d.totalPowerUnits?.toString() ?? "N/A" },
                { label: "Drivers", value: d.totalDrivers?.toString() ?? "N/A" },
                { label: "MCS-150 Date", value: d.mcs150Date ? new Date(d.mcs150Date).toLocaleDateString() : "N/A" },
              ].filter(row => row.value).map(row => (
                <div key={row.label} className="bg-secondary/30 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{row.label}</p>
                  <p className="text-sm font-semibold">{row.value}</p>
                </div>
              ))}
            </div>

            {/* Contact */}
            {(d.physicalAddress || d.phoneNumber) && (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Contact</p>
                <div className="space-y-1 text-sm">
                  {d.physicalAddress && <p>{d.physicalAddress}</p>}
                  {d.phoneNumber && <p className="text-muted-foreground">{d.phoneNumber}</p>}
                </div>
              </div>
            )}

            {/* Safety stats */}
            {(d.crashTotal != null || d.inspTotal != null) && (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Safety Stats</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Crashes", value: d.crashTotal, warn: (d.crashTotal ?? 0) > 5 },
                    { label: "Fatal Crashes", value: d.fatalCrash, warn: (d.fatalCrash ?? 0) > 0 },
                    { label: "Injury Crashes", value: d.injCrash, warn: false },
                    { label: "Tow Crashes", value: d.towCrash, warn: false },
                    { label: "Total Inspections", value: d.inspTotal, warn: false },
                    { label: "Driver OOS", value: d.inspDriverOos, warn: (d.inspDriverOos ?? 0) > 0 },
                    { label: "Vehicle OOS", value: d.inspVehicleOos, warn: (d.inspVehicleOos ?? 0) > 0 },
                  ].filter(s => s.value != null).map(s => (
                    <div key={s.label} className={`rounded-lg p-3 ${s.warn ? "bg-red-950/50 border border-red-800/50" : "bg-secondary/30"}`}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{s.label}</p>
                      <p className={`text-lg font-black ${s.warn ? "text-red-400" : ""}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
