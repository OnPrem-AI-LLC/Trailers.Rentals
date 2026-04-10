import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Truck,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  Clock,
  XCircle,
  Phone,
  Mail,
  Calendar,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import type { DriverApplication } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  reviewed: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  interview: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  hired: "bg-green-500/20 text-green-400 border-green-500/40",
  rejected: "bg-red-500/20 text-red-400 border-red-500/40",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  interview: "Interview",
  hired: "Hired",
  rejected: "Rejected",
};

function ApplicationRow({ app }: { app: DriverApplication }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(app.adminNotes ?? "");
  const [status, setStatus] = useState(app.status);

  const updateMut = useMutation({
    mutationFn: (data: { status?: string; adminNotes?: string }) =>
      apiRequest("PATCH", `/api/admin/driver-applications/${app.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/driver-applications"] });
      toast({ title: "Application updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function saveChanges() {
    updateMut.mutate({ status, adminNotes: notes });
  }

  const endorsements = [
    app.hasTwic && "TWIC",
    app.hasHazmat && "Hazmat",
    app.hasTanker && "Tanker",
  ].filter(Boolean);

  const posLabel = app.desiredPosition === "otr" ? "OTR" : app.desiredPosition === "regional" ? "Regional" : app.desiredPosition === "local" ? "Local" : "—";

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-sm">{app.fullName}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[app.status] ?? STATUS_COLORS.pending}`}>
              {STATUS_LABELS[app.status] ?? app.status}
            </span>
            <span className="text-xs text-muted-foreground">Class {app.cdlClass} CDL — {app.cdlState}</span>
            <span className="text-xs text-muted-foreground">{app.yearsExperience} yr exp</span>
            {endorsements.length > 0 && (
              <span className="text-xs text-primary">{endorsements.join(", ")}</span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{app.email}</span>
            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{app.phone}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(app.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border px-5 py-5 space-y-5">
          {/* Details grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Desired Position</p>
              <p className="font-medium">{posLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">CDL Number</p>
              <p className="font-medium font-mono">{app.cdlNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Endorsements</p>
              <p className="font-medium">{endorsements.length ? endorsements.join(", ") : "None"}</p>
            </div>
          </div>

          {app.coverLetter && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Introduction</p>
              <p className="text-sm bg-muted/30 rounded-md p-3 whitespace-pre-wrap">{app.coverLetter}</p>
            </div>
          )}

          {app.references && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">References</p>
              <p className="text-sm bg-muted/30 rounded-md p-3 whitespace-pre-wrap">{app.references}</p>
            </div>
          )}

          {/* Admin actions */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Admin Actions</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="interview">Interview</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-[2]">
                <p className="text-xs text-muted-foreground mb-1">Admin Notes</p>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes…"
                  className="min-h-[64px] resize-none text-sm"
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={saveChanges}
              disabled={updateMut.isPending}
              className="mt-3 bg-primary hover:bg-primary/90 text-white font-bold"
            >
              {updateMut.isPending ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDriverApplications() {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: applications, isLoading } = useQuery<DriverApplication[]>({
    queryKey: ["/api/admin/driver-applications", statusFilter !== "all" ? statusFilter : undefined],
    queryFn: async () => {
      const url = statusFilter !== "all"
        ? `/api/admin/driver-applications?status=${statusFilter}`
        : "/api/admin/driver-applications";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const counts = applications ? {
    all: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    interview: applications.filter((a) => a.status === "interview").length,
    hired: applications.filter((a) => a.status === "hired").length,
  } : { all: 0, pending: 0, interview: 0, hired: 0 };

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Admin
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Truck className="w-6 h-6 text-primary" /> Driver Applications
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Review and manage driver applications</p>
          </div>
        </div>

        {/* Stat pills */}
        <div className="flex flex-wrap gap-3 mb-6">
          {[
            { key: "all", label: "All", count: counts.all, icon: Truck },
            { key: "pending", label: "Pending", count: counts.pending, icon: Clock },
            { key: "interview", label: "Interview", count: counts.interview, icon: BadgeCheck },
            { key: "hired", label: "Hired", count: counts.hired, icon: BadgeCheck },
            { key: "rejected", label: "Rejected", count: applications?.filter((a) => a.status === "rejected").length ?? 0, icon: XCircle },
          ].map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors
                ${statusFilter === key
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50"}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusFilter === key ? "bg-white/20" : "bg-muted"}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Application list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading applications…
          </div>
        ) : !applications || applications.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No applications yet</p>
            <p className="text-sm mt-1">Applications submitted on the Jobs page will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <ApplicationRow key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
