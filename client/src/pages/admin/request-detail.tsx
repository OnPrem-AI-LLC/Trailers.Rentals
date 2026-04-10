import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileCheck,
  RefreshCw,
  Shield,
  AlertTriangle,
  Info,
  Truck,
  Clock,
  User,
  Phone,
  Mail,
  Building,
  StickyNote,
  Activity,
  MessageSquare,
} from "lucide-react";
import type { RentalApplication, AdminNote, AuditLog } from "@shared/schema";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-950 text-yellow-400 border-yellow-800",
  approved: "bg-green-950 text-green-400 border-green-800",
  rejected: "bg-red-950 text-red-400 border-red-800",
  needs_info: "bg-blue-950 text-blue-400 border-blue-800",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
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

interface SaferCarrier {
  dotNumber?: string;
  legalName?: string;
  dbaName?: string;
  allowedToOperate?: string;
  bipdInsuranceOnFile?: number;
  cargoInsuranceOnFile?: number;
  safetyRating?: string;
  safetyRatingDate?: string;
  operatingStatus?: string;
  totalDrivers?: number;
  totalPowerUnits?: number;
  entityType?: string;
}

interface SaferResult {
  success: boolean;
  carrier?: SaferCarrier;
  error?: string;
  source: "fmcsa_api" | "unavailable";
}

function SaferPanel({ saferData, onRefresh, refreshing }: { saferData?: string | null; onRefresh: () => void; refreshing: boolean }) {
  let result: SaferResult | null = null;
  try { if (saferData) result = JSON.parse(saferData) as SaferResult; } catch { /* ignore */ }

  if (!result) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm uppercase tracking-wider">FMCSA SAFER Data</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-2 text-muted-foreground">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Looking up..." : "Run Lookup"}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>SAFER lookup pending. Click "Run Lookup" to query FMCSA.</span>
        </div>
      </div>
    );
  }

  if (!result.success) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm uppercase tracking-wider">FMCSA SAFER Data</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-2 text-muted-foreground">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-semibold">Lookup unavailable</p>
            <p className="text-muted-foreground mt-0.5">{result.error}</p>
            {result.source === "unavailable" && (
              <p className="text-muted-foreground mt-2 text-xs">
                Set the <code className="bg-muted px-1 rounded">FMCSA_API_KEY</code> environment variable to enable automatic SAFER lookups.
                Register at <a href="https://ai.fmcsa.dot.gov/SMS/Tools/Downloads.aspx" target="_blank" rel="noreferrer" className="text-primary hover:underline">ai.fmcsa.dot.gov</a>.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const c = result.carrier!;
  const allowed = c.allowedToOperate === "Y";
  const safetyColor = c.safetyRating === "Satisfactory"
    ? "text-green-400"
    : c.safetyRating === "Conditional"
    ? "text-yellow-400"
    : c.safetyRating === "Unsatisfactory"
    ? "text-red-400"
    : "text-muted-foreground";

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-wider">FMCSA SAFER Data</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-2 text-muted-foreground">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg ${allowed ? "bg-green-950 border border-green-800" : "bg-red-950 border border-red-800"}`}>
          {allowed ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
          <div>
            <div className={`text-xs font-bold ${allowed ? "text-green-400" : "text-red-400"}`}>
              {allowed ? "Allowed to Operate" : "NOT Allowed to Operate"}
            </div>
          </div>
        </div>
        {c.safetyRating && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted border border-border">
            <Shield className={`w-4 h-4 ${safetyColor}`} />
            <div>
              <div className="text-xs text-muted-foreground">Safety Rating</div>
              <div className={`text-xs font-bold ${safetyColor}`}>{c.safetyRating}</div>
            </div>
          </div>
        )}
      </div>

      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {([
            ["Legal Name", c.legalName],
            c.dbaName ? ["DBA Name", c.dbaName] : null,
            ["DOT Number", c.dotNumber],
            ["Entity Type", c.entityType],
            ["Operating Status", c.operatingStatus],
            c.totalPowerUnits != null ? ["Power Units", String(c.totalPowerUnits)] : null,
            c.totalDrivers != null ? ["Total Drivers", String(c.totalDrivers)] : null,
            c.bipdInsuranceOnFile != null ? ["BIPD Insurance", `$${c.bipdInsuranceOnFile.toLocaleString()}`] : null,
            c.cargoInsuranceOnFile != null ? ["Cargo Insurance", `$${c.cargoInsuranceOnFile.toLocaleString()}`] : null,
            c.safetyRatingDate ? ["Rating Date", c.safetyRatingDate] : null,
          ] as ([string, string | undefined] | null)[])
            .filter((row): row is [string, string | undefined] => row !== null && !!row[1])
            .map(([label, value]) => (
              <tr key={label}>
                <td className="py-2 text-muted-foreground w-40">{label}</td>
                <td className="py-2 font-medium text-foreground">{value}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono" : "font-medium"}`}>{value}</span>
    </div>
  );
}

export default function AdminRequestDetail() {
  const { id } = useParams();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [needsInfoOpen, setNeedsInfoOpen] = useState(false);
  const [needsInfoMsg, setNeedsInfoMsg] = useState("");
  const [noteBody, setNoteBody] = useState("");

  // Always call all hooks first — redirect in effect
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  const { data: app, isLoading } = useQuery<RentalApplication>({
    queryKey: ["/api/admin/applications", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/applications/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json() as Promise<RentalApplication>;
    },
    enabled: !!id && !!user && user.role === "admin",
  });

  const { data: notes } = useQuery<AdminNote[]>({
    queryKey: ["/api/admin/notes", "rental_application", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/notes/rental_application/${id}`, { credentials: "include" });
      return res.json() as Promise<AdminNote[]>;
    },
    enabled: !!id && !!user && user.role === "admin",
  });

  const { data: auditLogs } = useQuery<AuditLog[]>({
    queryKey: ["/api/admin/audit", "rental_application", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit/rental_application/${id}`, { credentials: "include" });
      return res.json() as Promise<AuditLog[]>;
    },
    enabled: !!id && !!user && user.role === "admin",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/applications", id] });
    qc.invalidateQueries({ queryKey: ["/api/admin/applications"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/notes", "rental_application", id] });
    qc.invalidateQueries({ queryKey: ["/api/admin/audit", "rental_application", id] });
  };

  const approveMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/applications/${id}/approve`, {}),
    onSuccess: () => { toast({ title: "Application approved" }); invalidate(); },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: (reason: string) => apiRequest("POST", `/api/admin/applications/${id}/reject`, { reason }),
    onSuccess: () => { toast({ title: "Application rejected — renter notified by email" }); setRejectOpen(false); invalidate(); },
    onError: () => toast({ title: "Failed to reject", variant: "destructive" }),
  });

  const needsInfoMut = useMutation({
    mutationFn: (message: string) => apiRequest("POST", `/api/admin/applications/${id}/needs-info`, { message }),
    onSuccess: () => { toast({ title: "Questions sent to renter by email" }); setNeedsInfoOpen(false); setNeedsInfoMsg(""); invalidate(); },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const coiMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/applications/${id}/coi-request`, {}),
    onSuccess: () => { toast({ title: "COI request sent to renter by email" }); invalidate(); },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const saferRefreshMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/applications/${id}/safer-refresh`, {}),
    onSuccess: () => { toast({ title: "SAFER data refreshed" }); invalidate(); },
    onError: () => toast({ title: "SAFER lookup failed", variant: "destructive" }),
  });

  const addNoteMut = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", "/api/admin/notes", {
        body,
        entityType: "rental_application",
        entityId: id,
      }),
    onSuccess: () => { setNoteBody(""); invalidate(); },
    onError: () => toast({ title: "Failed to save note", variant: "destructive" }),
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card px-4 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Application not found.</p>
          <Link href="/admin/requests">
            <Button variant="outline" className="mt-4">Back to requests</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isPending = app.status === "pending" || app.status === "needs_info";

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/requests">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <ArrowLeft className="w-4 h-4" />
                Applications
              </Button>
            </Link>
            <span className="text-border">/</span>
            <span className="font-black">{app.companyName}</span>
            <Badge className={`text-xs border ${STATUS_STYLES[app.status] ?? ""}`}>
              {STATUS_LABELS[app.status] ?? app.status}
            </Badge>
          </div>
          {/* Action buttons */}
          {isPending && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-blue-700 text-blue-400 hover:bg-blue-950"
                onClick={() => setNeedsInfoOpen(true)}
                disabled={needsInfoMut.isPending}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Request Info
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-border text-muted-foreground hover:text-foreground"
                onClick={() => coiMut.mutate()}
                disabled={coiMut.isPending}
              >
                <FileCheck className="w-3.5 h-3.5" />
                {coiMut.isPending ? "Sending..." : "Send COI Request"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-red-800 text-red-400 hover:bg-red-950"
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-green-700 hover:bg-green-600 text-white"
                onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {approveMut.isPending ? "Approving..." : "Approve"}
              </Button>
            </div>
          )}
          {app.status === "approved" && (
            <Badge className="bg-green-950 text-green-400 border border-green-800 text-sm px-3 py-1">
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Approved
            </Badge>
          )}
          {app.status === "rejected" && (
            <Badge className="bg-red-950 text-red-400 border border-red-800 text-sm px-3 py-1">
              <XCircle className="w-3.5 h-3.5 mr-1.5" /> Rejected
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: applicant info */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Building className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm uppercase tracking-wider">Company</h3>
            </div>
            <InfoRow label="Company" value={app.companyName} />
            <InfoRow label="Owner" value={app.ownerName} />
            {app.authorizedUser && <InfoRow label="Auth. User" value={app.authorizedUser} />}
            <InfoRow label="DOT" value={app.dotNumber} mono />
            {app.mcNumber && <InfoRow label="MC" value={app.mcNumber} mono />}
          </div>

          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm uppercase tracking-wider">Contact</h3>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <a href={`mailto:${app.email}`} className="text-primary hover:underline truncate">{app.email}</a>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span>{app.phone}</span>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm uppercase tracking-wider">Intended Use</h3>
            </div>
            <p className="text-sm text-foreground">{app.intendedUse}</p>
            {app.intendedUseDetails && (
              <p className="text-sm text-muted-foreground mt-2">{app.intendedUseDetails}</p>
            )}
          </div>

          {/* Renter response link (shown when needs_info) */}
          {app.status === "needs_info" && (
            <div className="bg-blue-950/30 border border-blue-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-blue-400">Renter Response Link</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Share this link with the renter to let them respond through the site:
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded break-all block">
                {window.location.origin}/applications/{app.id}/respond
              </code>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Submitted {formatDate(app.createdAt)}
            </div>
          </div>
        </div>

        {/* Right column: SAFER, notes, audit */}
        <div className="lg:col-span-2 space-y-5">
          <SaferPanel
            saferData={app.saferData}
            onRefresh={() => saferRefreshMut.mutate()}
            refreshing={saferRefreshMut.isPending}
          />

          {/* Admin Notes / Correspondence */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <StickyNote className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm uppercase tracking-wider">Notes & Correspondence</h3>
            </div>

            {notes && notes.length > 0 ? (
              <div className="space-y-3 mb-4">
                {notes.map((note) => {
                  const isInfoReq = note.body.startsWith("[More Info Request]");
                  const isCOI = note.body.startsWith("[COI Request]");
                  const isRenterReply = note.body.startsWith("[Renter Reply]");
                  const body = note.body
                    .replace(/^\[More Info Request\]\s*/, "")
                    .replace(/^\[COI Request\]\s*/, "")
                    .replace(/^\[Renter Reply\]\s*/, "");
                  const bg = isInfoReq
                    ? "bg-blue-950/40 border-blue-800"
                    : isCOI
                    ? "bg-orange-950/40 border-orange-800"
                    : isRenterReply
                    ? "bg-green-950/40 border-green-800"
                    : "bg-muted border-border";
                  const label = isInfoReq
                    ? "More Info Requested"
                    : isCOI
                    ? "COI Request Sent"
                    : isRenterReply
                    ? "Renter Response"
                    : null;
                  const labelColor = isInfoReq
                    ? "text-blue-400"
                    : isCOI
                    ? "text-orange-400"
                    : isRenterReply
                    ? "text-green-400"
                    : "";
                  return (
                    <div key={note.id} className={`rounded-lg p-3 text-sm border ${bg}`}>
                      {label && <div className={`text-xs font-bold mb-1 ${labelColor}`}>{label}</div>}
                      <p className="text-foreground whitespace-pre-line">{body}</p>
                      <p className="text-muted-foreground text-xs mt-1">{formatDate(note.createdAt)}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">No notes yet.</p>
            )}

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Add internal note (not sent to renter)</Label>
              <Textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Internal note..."
                className="bg-background border-border resize-none text-sm"
                rows={3}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => noteBody.trim() && addNoteMut.mutate(noteBody.trim())}
                disabled={!noteBody.trim() || addNoteMut.isPending}
                className="gap-2"
              >
                <StickyNote className="w-3.5 h-3.5" />
                Save Note
              </Button>
            </div>
          </div>

          {/* Audit trail */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm uppercase tracking-wider">Audit Trail</h3>
            </div>
            {auditLogs && auditLogs.length > 0 ? (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-foreground">{log.description}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{formatDate(log.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Reject modal */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" />
              Reject Application
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              The renter will receive a rejection email. Optionally include a reason.
            </p>
            <Label>Reason (optional)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Unable to verify operating authority at this time."
              className="bg-background border-border resize-none"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMut.mutate(rejectReason)}
              disabled={rejectMut.isPending}
            >
              {rejectMut.isPending ? "Rejecting..." : "Reject & Notify Renter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Needs Info modal */}
      <Dialog open={needsInfoOpen} onOpenChange={setNeedsInfoOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-400" />
              Request More Information
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Your questions will be emailed to the applicant. They can also respond directly through the site.
            </p>
            <Label>Questions / Information Needed *</Label>
            <Textarea
              value={needsInfoMsg}
              onChange={(e) => setNeedsInfoMsg(e.target.value)}
              placeholder="e.g. Please provide your certificate of authority number and confirm your primary lanes."
              className="bg-background border-border resize-none"
              rows={5}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNeedsInfoOpen(false)}>Cancel</Button>
            <Button
              onClick={() => needsInfoMut.mutate(needsInfoMsg.trim())}
              disabled={!needsInfoMsg.trim() || needsInfoMut.isPending}
              className="bg-blue-700 hover:bg-blue-600 text-white"
            >
              {needsInfoMut.isPending ? "Sending..." : "Send to Renter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
