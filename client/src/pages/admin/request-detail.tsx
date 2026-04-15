import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  Building2,
  StickyNote,
  Activity,
  MessageSquare,
  Edit,
  Hash,
  ExternalLink,
  FileText,
  CreditCard,
  Loader2,
  UserCheck,
  Send,
  ClipboardSignature,
} from "lucide-react";
import type { Rental, RentalApplication, AdminNote, AuditLog, Company, Document } from "@shared/schema";

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
  mcNumber?: string;
  dotStatus?: string;
  mcAuthority?: string;
}

interface SaferResult {
  success: boolean;
  carrier?: SaferCarrier;
  error?: string;
  source: "fmcsa_api" | "unavailable";
}

function SaferPanel({ saferData, onRefresh, refreshing, readOnly }: { saferData?: string | null; onRefresh: () => void; refreshing: boolean; readOnly?: boolean }) {
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
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-2 text-muted-foreground">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Looking up..." : "Run Lookup"}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>SAFER lookup pending.</span>
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
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-2 text-muted-foreground">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Retry
            </Button>
          )}
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
        {!readOnly && (
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-2 text-muted-foreground">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg ${allowed ? "bg-green-950 border border-green-800" : "bg-red-950 border border-red-800"}`}>
          {allowed ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
          <div>
            <div className="text-xs text-muted-foreground">DOT Authority Status</div>
            <div className={`text-xs font-bold ${allowed ? "text-green-400" : "text-red-400"}`}>
              {allowed ? "Authorized to Operate" : "NOT Authorized"}
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
            c.mcNumber ? ["MC Number", c.mcNumber] : null,
            ["Entity Type", c.entityType],
            ["DOT Operating Status", c.operatingStatus],
            c.mcAuthority ? ["MC Authority Status", c.mcAuthority] : null,
            c.totalPowerUnits != null ? ["Power Units", String(c.totalPowerUnits)] : null,
            c.totalDrivers != null ? ["Total Drivers", String(c.totalDrivers)] : null,
            c.bipdInsuranceOnFile != null ? ["BIPD Insurance", `$${c.bipdInsuranceOnFile.toLocaleString()}`] : null,
            c.cargoInsuranceOnFile != null ? ["Cargo Insurance", `$${c.cargoInsuranceOnFile.toLocaleString()}`] : null,
            c.safetyRatingDate ? ["Safety Rating Date", c.safetyRatingDate] : null,
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
  const searchStr = useSearch();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [needsInfoOpen, setNeedsInfoOpen] = useState(false);
  const [needsInfoMsg, setNeedsInfoMsg] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState<{
    name: string; ownerName: string; authorizedUser: string; email: string;
    phone: string; address: string; mcNumber: string; dotNumber: string; driverLicenseNumber: string;
  }>({ name: "", ownerName: "", authorizedUser: "", email: "", phone: "", address: "", mcNumber: "", dotNumber: "", driverLicenseNumber: "" });

  // Parse ?tk= admin magic-link token from URL
  const adminLinkToken = new URLSearchParams(searchStr).get("tk") ?? null;
  const isTokenView = !!adminLinkToken && !user;

  // Redirect to login only when no session AND no valid token
  useEffect(() => {
    if (!authLoading && !isTokenView && (!user || user.role !== "admin")) {
      navigate("/login");
    }
  }, [user, authLoading, navigate, isTokenView]);

  // Session-based query (requires admin login)
  const { data: sessionApp, isLoading } = useQuery<RentalApplication>({
    queryKey: ["/api/admin/applications", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/applications/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json() as Promise<RentalApplication>;
    },
    enabled: !!id && !!user && user.role === "admin",
  });

  // Token-based query for magic-link (read-only, no session needed)
  const { data: tokenData, isLoading: tokenLoading } = useQuery<{
    application: RentalApplication;
    notes: AdminNote[];
    auditLogs: AuditLog[];
  }>({
    queryKey: ["/api/applications/admin-token", adminLinkToken],
    queryFn: async () => {
      const res = await fetch(`/api/applications/admin-token/${adminLinkToken}`);
      if (!res.ok) throw new Error("Invalid or expired token");
      return res.json();
    },
    enabled: isTokenView && !!adminLinkToken,
  });

  const { data: sessionNotes } = useQuery<AdminNote[]>({
    queryKey: ["/api/admin/notes", "rental_application", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/notes/rental_application/${id}`, { credentials: "include" });
      return res.json() as Promise<AdminNote[]>;
    },
    enabled: !!id && !!user && user.role === "admin",
  });

  const { data: sessionAuditLogs } = useQuery<AuditLog[]>({
    queryKey: ["/api/admin/audit", "rental_application", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit/rental_application/${id}`, { credentials: "include" });
      return res.json() as Promise<AuditLog[]>;
    },
    enabled: !!id && !!user && user.role === "admin",
  });

  // Merge: prefer session data, fall back to token data for read-only magic-link views
  const app = sessionApp ?? tokenData?.application;
  const notes = sessionNotes ?? tokenData?.notes;
  const auditLogs = sessionAuditLogs ?? tokenData?.auditLogs;

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

  // Company profile (only after approval when companyId is available)
  const { data: companyProfile, isLoading: companyLoading } = useQuery<{
    company: Company; documents: Document[];
  }>({
    queryKey: ["/api/admin/companies", app?.companyId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/companies/${app!.companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!app?.companyId && !!user && user.role === "admin",
  });

  const updateCompanyMut = useMutation({
    mutationFn: (data: typeof companyForm) =>
      apiRequest("PATCH", `/api/admin/companies/${app?.companyId}`, data),
    onSuccess: () => {
      toast({ title: "Company profile updated" });
      setEditCompanyOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/companies", app?.companyId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/audit/company", app?.companyId] });
    },
    onError: () => toast({ title: "Failed to update company", variant: "destructive" }),
  });

  type CompanyAuditLog = { id: string; actionType: string; description: string; createdAt: string; isAdminEntry: boolean; actorName: string };
  const { data: companyAuditData } = useQuery<{ logs: CompanyAuditLog[]; total: number }>({
    queryKey: ["/api/admin/audit/company", app?.companyId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit?entityType=company&entityId=${app!.companyId}&limit=50`, { credentials: "include" });
      if (!res.ok) return { logs: [], total: 0 };
      return res.json();
    },
    enabled: !!app?.companyId && !!user && user.role === "admin",
  });

  // Linked rentals (only when application is approved and has a companyId)
  type EnrichedRental = Rental & { trailerType: string | null; trailerVin: string | null };
  const { data: linkedRentals, refetch: refetchRentals } = useQuery<EnrichedRental[]>({
    queryKey: ["/api/admin/rentals", "company", app?.companyId],
    queryFn: async (): Promise<EnrichedRental[]> => {
      const res = await fetch(`/api/admin/rentals?companyId=${app!.companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<EnrichedRental[]>;
    },
    enabled: !!app?.companyId && app?.status === "approved" && !!user && user.role === "admin",
  });

  const sendAgreementMut = useMutation({
    mutationFn: (rentalId: string) =>
      apiRequest("POST", `/api/admin/rentals/${rentalId}/send-agreement`, {}),
    onSuccess: () => {
      toast({ title: "Agreement sent", description: "The renter has been emailed a link to sign their agreement." });
      refetchRentals();
    },
    onError: () => toast({ title: "Failed to send agreement", variant: "destructive" }),
  });

  const RENTAL_STATUS_LABELS: Record<string, string> = {
    pending_agreement: "Awaiting Signature",
    pending_payment: "Awaiting Payment",
    active: "Active",
    ended: "Ended",
    cancelled: "Cancelled",
  };

  const RENTAL_STATUS_COLORS: Record<string, string> = {
    pending_agreement: "bg-yellow-950 text-yellow-400 border-yellow-800",
    pending_payment: "bg-blue-950 text-blue-400 border-blue-800",
    active: "bg-green-950 text-green-400 border-green-800",
    ended: "bg-zinc-800 text-zinc-400 border-zinc-600",
    cancelled: "bg-red-950 text-red-400 border-red-800",
  };

  const DOC_TYPE_LABELS: Record<string, string> = {
    coi: "Certificate of Insurance",
    certificate_of_authority: "Certificate of Authority",
    drivers_license: "Driver's License",
    registration: "Vehicle Registration",
    agreement: "Rental Agreement",
  };

  if (authLoading || (!user && !isTokenView)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (isLoading || tokenLoading) {
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
      {/* Magic-link read-only banner */}
      {isTokenView && (
        <div className="bg-blue-950 border-b border-blue-800 px-4 py-2 text-center">
          <p className="text-xs text-blue-300">
            You are viewing this application via a secure email link.{" "}
            <Link href="/login" className="underline font-semibold hover:text-blue-100">
              Log in
            </Link>{" "}
            to approve, reject, or take action.
          </p>
        </div>
      )}

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
          {/* Action buttons — hidden in read-only token view */}
          {isPending && !isTokenView && (
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

          {/* Renter response link (shown when needs_info and renterToken available) */}
          {app.status === "needs_info" && app.renterToken && (
            <div className="bg-blue-950/30 border border-blue-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-blue-400">Renter Response Link</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Share this link with the renter to let them respond through the site:
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded break-all block">
                {window.location.origin}/applications/respond/{app.renterToken}
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
            readOnly={isTokenView}
          />

          {/* Company Profile Panel — shown after approval when companyId exists */}
          {app.companyId && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <h3 className="font-bold text-sm uppercase tracking-wider">Renter Company Profile</h3>
                </div>
                {!isTokenView && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      const c = companyProfile?.company;
                      if (c) {
                        setCompanyForm({
                          name: c.name ?? "",
                          ownerName: c.ownerName ?? "",
                          authorizedUser: c.authorizedUser ?? "",
                          email: c.email ?? "",
                          phone: c.phone ?? "",
                          address: c.address ?? "",
                          mcNumber: c.mcNumber ?? "",
                          dotNumber: c.dotNumber ?? "",
                          driverLicenseNumber: c.driverLicenseNumber ?? "",
                        });
                      }
                      setEditCompanyOpen(true);
                    }}
                    disabled={companyLoading}
                  >
                    <Edit className="w-3 h-3" />
                    Edit
                  </Button>
                )}
              </div>

              {companyLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : companyProfile ? (
                <>
                  {/* Admin-entered field indicators */}
                  {(() => {
                    let overrides: Record<string, boolean> = {};
                    try { overrides = JSON.parse(companyProfile.company.adminOverrideFields ?? "{}"); } catch { overrides = {}; }
                    const AdminBadge = ({ field }: { field: string }) =>
                      overrides[field] ? (
                        <Badge variant="outline" className="text-[9px] border-primary/40 text-primary px-1 py-0 ml-1 align-middle">Admin</Badge>
                      ) : null;
                    return (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm mb-5">
                        <div>
                          <span className="text-xs text-muted-foreground">Legal Name<AdminBadge field="name" /></span>
                          <p className="font-semibold">{companyProfile.company.name}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Owner<AdminBadge field="ownerName" /></span>
                          <p>{companyProfile.company.ownerName}</p>
                        </div>
                        {companyProfile.company.authorizedUser && (
                          <div className="col-span-2">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <UserCheck className="w-3 h-3" />Authorized User<AdminBadge field="authorizedUser" />
                            </span>
                            <p>{companyProfile.company.authorizedUser}</p>
                          </div>
                        )}
                        {companyProfile.company.dotNumber && (
                          <div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Hash className="w-3 h-3" />DOT<AdminBadge field="dotNumber" />
                            </span>
                            <p className="font-mono">{companyProfile.company.dotNumber}</p>
                          </div>
                        )}
                        {companyProfile.company.mcNumber && (
                          <div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Hash className="w-3 h-3" />MC<AdminBadge field="mcNumber" />
                            </span>
                            <p className="font-mono">{companyProfile.company.mcNumber}</p>
                          </div>
                        )}
                        {companyProfile.company.phone && (
                          <div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" />Phone<AdminBadge field="phone" />
                            </span>
                            <p>{companyProfile.company.phone}</p>
                          </div>
                        )}
                        {companyProfile.company.email && (
                          <div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="w-3 h-3" />Email<AdminBadge field="email" />
                            </span>
                            <p>{companyProfile.company.email}</p>
                          </div>
                        )}
                        {companyProfile.company.driverLicenseNumber && (
                          <div className="col-span-2">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CreditCard className="w-3 h-3" />Driver's License<AdminBadge field="driverLicenseNumber" />
                            </span>
                            <p className="font-mono">{companyProfile.company.driverLicenseNumber}</p>
                          </div>
                        )}
                        {companyProfile.company.address && (
                          <div className="col-span-2">
                            <span className="text-xs text-muted-foreground">Address<AdminBadge field="address" /></span>
                            <p>{companyProfile.company.address}</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Documents */}
                  <div className="mb-5">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Documents on File</p>
                    {companyProfile.documents.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No documents uploaded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {companyProfile.documents.map(doc => (
                          <div key={doc.id} className="flex items-center gap-3 text-sm bg-muted/40 rounded-lg px-3 py-2">
                            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</span>
                                <span className="text-[10px] text-muted-foreground/60">·</span>
                                <span className="text-[10px] text-muted-foreground/60">{formatDate(doc.createdAt)}</span>
                              </div>
                              <a href={doc.url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 truncate">
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{doc.fileName}</span>
                              </a>
                            </div>
                            {doc.isAdminOnly && (
                              <Badge className="text-xs bg-yellow-950 text-yellow-400 border border-yellow-800 flex-shrink-0">Admin only</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Company-scoped audit log */}
                  {companyAuditData && companyAuditData.logs.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Company Audit Trail</p>
                      <div className="space-y-2">
                        {companyAuditData.logs.map(log => (
                          <div key={log.id} className="flex gap-2.5 text-xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 flex-shrink-0" />
                            <div>
                              <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                              <span className="mx-1.5 text-border">·</span>
                              <span>{log.description}</span>
                              {log.isAdminEntry && (
                                <Badge variant="outline" className="text-[9px] border-primary/40 text-primary px-1 py-0 ml-1.5">Admin</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Company profile not available.</p>
              )}
            </div>
          )}

          {/* Linked Rentals — shown when application is approved */}
          {app.status === "approved" && !isTokenView && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardSignature className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm uppercase tracking-wider">Linked Rentals</h3>
              </div>
              {!linkedRentals || linkedRentals.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No rentals linked to this company yet.</p>
              ) : (
                <div className="space-y-3">
                  {linkedRentals.map((rental) => (
                    <div key={rental.id} className="bg-muted/40 border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{rental.trailerType ?? "Trailer"}</span>
                            <span className="text-xs text-muted-foreground font-mono">VIN: {rental.trailerVin ?? "—"}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ${((rental.monthlyRate ?? 0) / 100).toLocaleString()}/month
                            {rental.pickupDate && (
                              <span className="ml-2">· Pickup: {new Date(rental.pickupDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                            )}
                          </p>
                        </div>
                        <Badge className={`text-xs border flex-shrink-0 ${RENTAL_STATUS_COLORS[rental.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-600"}`}>
                          {RENTAL_STATUS_LABELS[rental.status] ?? rental.status}
                        </Badge>
                      </div>

                      {/* Signature info */}
                      {rental.signatureUrl && (
                        <div className="flex items-center gap-2 text-xs text-green-400 mb-3">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Signed · {rental.agreementSignedAt ? new Date(rental.agreementSignedAt).toLocaleDateString() : ""}
                          <a href={rental.signatureUrl} target="_blank" rel="noreferrer" className="underline ml-1">View signature</a>
                        </div>
                      )}

                      {/* Send Agreement button — only for pending_agreement rentals */}
                      {rental.status === "pending_agreement" && (
                        <Button
                          size="sm"
                          className="gap-2 bg-primary hover:bg-primary/90 text-white w-full sm:w-auto"
                          onClick={() => sendAgreementMut.mutate(rental.id)}
                          disabled={sendAgreementMut.isPending}
                        >
                          {sendAgreementMut.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          {sendAgreementMut.isPending ? "Sending..." : "Send Agreement to Renter"}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

            {!isTokenView && (
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
            )}
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

      {/* Edit Company modal */}
      <Dialog open={editCompanyOpen} onOpenChange={setEditCompanyOpen}>
        <DialogContent className="bg-card border-border max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Edit Company Profile
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Legal Company Name</Label>
              <Input value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))} className="bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Owner Name</Label>
              <Input value={companyForm.ownerName} onChange={e => setCompanyForm(f => ({ ...f, ownerName: e.target.value }))} className="bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Authorized User</Label>
              <Input value={companyForm.authorizedUser} onChange={e => setCompanyForm(f => ({ ...f, authorizedUser: e.target.value }))} className="bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">DOT Number</Label>
              <Input value={companyForm.dotNumber} onChange={e => setCompanyForm(f => ({ ...f, dotNumber: e.target.value }))} className="bg-background border-border font-mono" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">MC Number</Label>
              <Input value={companyForm.mcNumber} onChange={e => setCompanyForm(f => ({ ...f, mcNumber: e.target.value }))} className="bg-background border-border font-mono" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Email</Label>
              <Input type="email" value={companyForm.email} onChange={e => setCompanyForm(f => ({ ...f, email: e.target.value }))} className="bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Phone</Label>
              <Input value={companyForm.phone} onChange={e => setCompanyForm(f => ({ ...f, phone: e.target.value }))} className="bg-background border-border" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Driver's License Number</Label>
              <Input value={companyForm.driverLicenseNumber} onChange={e => setCompanyForm(f => ({ ...f, driverLicenseNumber: e.target.value }))} className="bg-background border-border font-mono" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Address</Label>
              <Input value={companyForm.address} onChange={e => setCompanyForm(f => ({ ...f, address: e.target.value }))} className="bg-background border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCompanyOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updateCompanyMut.mutate(companyForm)}
              disabled={updateCompanyMut.isPending}
              className="bg-primary hover:bg-primary/90 text-white gap-2"
            >
              {updateCompanyMut.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
