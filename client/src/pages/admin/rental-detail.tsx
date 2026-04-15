import { useState } from "react";
import QRCode from "qrcode";
import { useLocation, Link, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import {
  Truck, Building2, ChevronLeft, FileText, ExternalLink, CheckCircle,
  CreditCard, Calendar, Clock, AlertTriangle, Receipt, Download,
  Activity, DollarSign, User, Hash, Mail, Phone, PlusCircle, XCircle,
  Gauge, Send, QrCode, PackageCheck, RotateCcw, Camera,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { Rental, Document, AuditLog, Company, EngineHourEntry, CheckinPhoto } from "@shared/schema";

interface TrailerInfo {
  id: string;
  vin: string;
  type: string;
  make: string | null;
  year: string | null;
  priceMonthly: number;
}

interface RentalDetailData {
  rental: Rental;
  company: Company | null;
  trailer: TrailerInfo | null;
  docs: Document[];
  auditLogs: AuditLog[];
}

interface InvoiceData {
  nextBillingDate: string | null;
  stripeCustomerUrl: string | null;
  stripeSubscriptionUrl: string | null;
  charges: {
    id: string; amount: number; currency: string; status: string | null;
    description: string | null; createdAt: string; receiptUrl: string | null;
  }[];
  invoices: {
    id: string; amount: number; currency: string; status: string | null;
    description: string; createdAt: string; invoiceUrl: string | null; pdfUrl: string | null;
  }[];
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending_agreement: { label: "Pending Agreement", cls: "text-yellow-400 bg-yellow-950 border-yellow-800" },
  pending_payment:   { label: "Pending Payment",   cls: "text-orange-400 bg-orange-950 border-orange-800" },
  active:            { label: "Active",             cls: "text-green-400 bg-green-950 border-green-800" },
  active_in_use:     { label: "In Use",             cls: "text-blue-400 bg-blue-950 border-blue-800" },
  completed:         { label: "Completed",          cls: "text-muted-foreground bg-muted border-border" },
  cancelled:         { label: "Cancelled",          cls: "text-red-400 bg-red-950 border-red-800" },
};

const STATUS_OPTIONS = [
  "pending_agreement", "pending_payment", "active", "active_in_use", "completed", "cancelled"
] as const;

export default function AdminRentalDetail() {
  const { id: rentalId } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDesc, setInvoiceDesc] = useState("");
  const [cancelSubConfirm, setCancelSubConfirm] = useState(false);
  const [showManualHoursForm, setShowManualHoursForm] = useState(false);
  const [manualReading, setManualReading] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [pickupQR, setPickupQR] = useState<{ url: string; dataUrl: string } | null>(null);
  const [returnQR, setReturnQR] = useState<{ url: string; dataUrl: string } | null>(null);

  const { data, isLoading } = useQuery<RentalDetailData>({
    queryKey: ["/api/admin/rentals", rentalId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/rentals/${rentalId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load rental");
      return res.json() as Promise<RentalDetailData>;
    },
    enabled: !!user && user.role === "admin" && !!rentalId,
  });

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery<InvoiceData>({
    queryKey: ["/api/rentals", rentalId, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/rentals/${rentalId}/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load invoices");
      return res.json() as Promise<InvoiceData>;
    },
    enabled: !!user && user.role === "admin" && !!data?.rental?.stripeCustomerId,
  });

  const updateMut = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/admin/rentals/${rentalId}`, payload);
      if (!res.ok) {
        const err = await res.json() as { message: string };
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/rentals", rentalId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/rentals"] });
      setPendingStatus(null);
      toast({ title: "Rental updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const confirmDepositMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/confirm-deposit", { rentalId });
      if (!res.ok) {
        const err = await res.json() as { message: string };
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/rentals", rentalId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/rentals"] });
      toast({ title: "Deposit confirmed", description: "Rental is now active." });
    },
    onError: (err: Error) => toast({ title: "Failed to confirm deposit", description: err.message, variant: "destructive" }),
  });

  const createInvoiceMut = useMutation({
    mutationFn: async ({ amount, description }: { amount: number; description: string }) => {
      const res = await apiRequest("POST", `/api/admin/rentals/${rentalId}/create-invoice`, { amount, description });
      if (!res.ok) {
        const err = await res.json() as { message: string };
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/rentals", rentalId, "invoices"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/rentals", rentalId] });
      setShowInvoiceForm(false);
      setInvoiceAmount("");
      setInvoiceDesc("");
      toast({ title: "Invoice sent!", description: "The customer has been emailed a Stripe invoice." });
    },
    onError: (err: Error) => toast({ title: "Invoice failed", description: err.message, variant: "destructive" }),
  });

  const cancelSubMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/rentals/${rentalId}/cancel-subscription`, {});
      if (!res.ok) {
        const err = await res.json() as { message: string };
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/rentals", rentalId] });
      setCancelSubConfirm(false);
      toast({ title: "Subscription cancelled" });
    },
    onError: (err: Error) => toast({ title: "Failed to cancel subscription", description: err.message, variant: "destructive" }),
  });

  const createSubMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/rentals/${rentalId}/create-subscription`, {});
      if (!res.ok) {
        const err = await res.json() as { message: string };
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/rentals", rentalId] });
      toast({ title: "Subscription created", description: "Monthly billing is now active." });
    },
    onError: (err: Error) => toast({ title: "Failed to create subscription", description: err.message, variant: "destructive" }),
  });

  const { data: checkinPhotos = [] } = useQuery<CheckinPhoto[]>({
    queryKey: ["/api/admin/rentals", rentalId, "checkin-photos"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/rentals/${rentalId}/checkin-photos`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user && user.role === "admin" && !!rentalId,
  });

  // Engine Hours
  const { data: engineHours = [], isLoading: hoursLoading } = useQuery<EngineHourEntry[]>({
    queryKey: ["/api/rentals", rentalId, "engine-hours"],
    queryFn: async () => {
      const res = await fetch(`/api/rentals/${rentalId}/engine-hours`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load engine hours");
      return res.json();
    },
    enabled: !!user && !!rentalId,
  });

  const requestHoursMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/rentals/${rentalId}/request-engine-hours`, {});
      if (!res.ok) { const e = await res.json() as { message: string }; throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => toast({ title: "Request sent!", description: "Renter emailed a link to submit their engine hours." }),
    onError: (err: Error) => toast({ title: "Failed to send request", description: err.message, variant: "destructive" }),
  });

  const manualEntryMut = useMutation({
    mutationFn: async (payload: { currentReading: number; notes?: string }) => {
      const res = await apiRequest("POST", `/api/admin/rentals/${rentalId}/engine-hours/manual`, payload);
      if (!res.ok) { const e = await res.json() as { message: string }; throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/rentals", rentalId, "engine-hours"] });
      setShowManualHoursForm(false);
      setManualReading("");
      setManualNotes("");
      toast({ title: "Entry logged!", description: "Manual engine hour entry saved." });
    },
    onError: (err: Error) => toast({ title: "Failed to log entry", description: err.message, variant: "destructive" }),
  });

  const billHoursMut = useMutation({
    mutationFn: async (entryId: string) => {
      const res = await apiRequest("POST", `/api/admin/rentals/${rentalId}/engine-hours/${entryId}/bill`, {});
      if (!res.ok) { const e = await res.json() as { message: string }; throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/rentals", rentalId, "engine-hours"] });
      qc.invalidateQueries({ queryKey: ["/api/rentals", rentalId, "invoices"] });
      toast({ title: "Queued for next invoice!", description: "Engine hour surcharge will appear on the customer's next billing cycle invoice." });
    },
    onError: (err: Error) => toast({ title: "Billing failed", description: err.message, variant: "destructive" }),
  });

  const genPickupQRMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/rentals/${rentalId}/generate-pickup-qr`, {});
      if (!res.ok) { const e = await res.json() as { message: string }; throw new Error(e.message); }
      return res.json() as Promise<{ token: string; url: string }>;
    },
    onSuccess: async (data) => {
      const dataUrl = await QRCode.toDataURL(data.url, { width: 240, margin: 2 });
      setPickupQR({ url: data.url, dataUrl });
    },
    onError: (err: Error) => toast({ title: "Failed to generate QR", description: err.message, variant: "destructive" }),
  });

  const genReturnQRMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/rentals/${rentalId}/generate-return-qr`, {});
      if (!res.ok) { const e = await res.json() as { message: string }; throw new Error(e.message); }
      return res.json() as Promise<{ token: string; url: string }>;
    },
    onSuccess: async (data) => {
      const dataUrl = await QRCode.toDataURL(data.url, { width: 240, margin: 2 });
      setReturnQR({ url: data.url, dataUrl });
    },
    onError: (err: Error) => toast({ title: "Failed to generate QR", description: err.message, variant: "destructive" }),
  });

  if (authLoading || !user) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Skeleton className="h-8 w-48" /></div>;
  }
  if (user.role !== "admin") { navigate("/dashboard"); return null; }

  const { rental, company, trailer, docs, auditLogs } = data ?? {};
  const s = rental ? STATUS_STYLES[rental.status] ?? { label: rental.status, cls: "text-muted-foreground bg-muted border-border" } : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <Link href="/admin/rentals">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" /> Rentals
            </Button>
          </Link>
          {rental && (
            <span className="text-xs text-muted-foreground font-mono">#{rental.id.slice(-8).toUpperCase()}</span>
          )}
        </div>

        {isLoading || !rental ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main column */}
            <div className="lg:col-span-2 space-y-5">

              {/* Rental header */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-4 h-4 text-primary" />
                      <span className="font-black text-lg">{company?.name ?? "Unknown Company"}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {trailer ? `${trailer.year ? trailer.year + " " : ""}${trailer.make ? trailer.make + " " : ""}${trailer.type.replace("_"," ")} — VIN: ${trailer.vin}` : "Trailer details unavailable"}
                    </div>
                  </div>
                  {s && <Badge className={`text-xs border ${s.cls}`}>{s.label}</Badge>}
                </div>

                {/* Company info grid */}
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {company?.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-3 h-3" />
                      <a href={`mailto:${company.email}`} className="hover:text-foreground">{company.email}</a>
                    </div>
                  )}
                  {company?.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      <span>{company.phone}</span>
                    </div>
                  )}
                  {company?.dotNumber && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Hash className="w-3 h-3" />
                      <span>DOT {company.dotNumber}</span>
                    </div>
                  )}
                  {company?.mcNumber && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Hash className="w-3 h-3" />
                      <span>MC {company.mcNumber}</span>
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide mb-0.5">Created</div>
                    <div>{new Date(rental.createdAt).toLocaleDateString()}</div>
                  </div>
                  {rental.agreementSignedAt && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide mb-0.5">Signed</div>
                      <div>{new Date(rental.agreementSignedAt).toLocaleDateString()}</div>
                    </div>
                  )}
                  {rental.pickupDate && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide mb-0.5">Pickup</div>
                      <div className="text-orange-300">{new Date(rental.pickupDate).toLocaleDateString()}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment info */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <h2 className="font-bold text-sm uppercase tracking-wider">Payment</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Monthly Rate</div>
                    <div className="font-bold text-lg">${(rental.monthlyRate / 100).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">2-Month Deposit</div>
                    <div className="font-bold text-lg">${(rental.monthlyRate * 2 / 100).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Deposit Status</div>
                    {rental.depositPaid ? (
                      <div className="flex items-center gap-1 text-green-400 font-semibold"><CheckCircle className="w-4 h-4" /> Paid</div>
                    ) : (
                      <div className="flex items-center gap-1 text-orange-400 font-semibold"><Clock className="w-4 h-4" /> Not paid</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Subscription</div>
                    {rental.stripeSubscriptionId ? (
                      <div className="flex items-center gap-1 text-green-400 text-xs font-mono truncate"><CheckCircle className="w-3 h-3 flex-shrink-0" />{rental.stripeSubscriptionId}</div>
                    ) : (
                      <div className="text-muted-foreground text-xs">Not set up</div>
                    )}
                  </div>
                </div>

                {/* Agreement link */}
                {rental.agreementUrl && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <a href={rental.agreementUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <FileText className="w-4 h-4" /> View Signed Agreement
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {rental.signedByName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <User className="w-3 h-3" /> Signed by {rental.signedByName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Stripe payment history */}
              {rental.stripeCustomerId && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="w-4 h-4 text-primary" />
                    <h2 className="font-bold text-sm uppercase tracking-wider">Payment History</h2>
                  </div>
                  {invoicesLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : !invoiceData || (invoiceData.charges.length === 0 && invoiceData.invoices.length === 0) ? (
                    <p className="text-sm text-muted-foreground italic">No payment records found in Stripe.</p>
                  ) : (
                    <div className="space-y-2">
                      {invoiceData.charges.map(c => (
                        <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-sm">
                          <div>
                            <div className="font-medium">{c.description ?? "Charge"}</div>
                            <div className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">${(c.amount / 100).toLocaleString()}</span>
                            {c.receiptUrl && (
                              <a href={c.receiptUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80">
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                      {invoiceData.invoices.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-sm">
                          <div>
                            <div className="font-medium">{inv.description}</div>
                            <div className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</div>
                            {inv.status && (
                              <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                inv.status === "paid" ? "bg-green-950 text-green-400" :
                                inv.status === "open" ? "bg-orange-950 text-orange-400" :
                                inv.status === "void" ? "bg-red-950 text-red-400" :
                                "bg-muted text-muted-foreground"
                              }`}>{inv.status}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-semibold ${inv.status === "open" ? "text-orange-400" : ""}`}>
                              ${(inv.amount / 100).toLocaleString()}
                            </span>
                            {inv.invoiceUrl && (
                              <a href={inv.invoiceUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Documents */}
              {docs && docs.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-4 h-4 text-primary" />
                    <h2 className="font-bold text-sm uppercase tracking-wider">Documents</h2>
                  </div>
                  <div className="space-y-2">
                    {docs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 text-sm">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground capitalize">{doc.type.replace(/_/g, " ")}</p>
                          <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline truncate">
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{doc.fileName}</span>
                          </a>
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit log */}
              {auditLogs && auditLogs.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-primary" />
                    <h2 className="font-bold text-sm uppercase tracking-wider">Audit Log</h2>
                  </div>
                  <div className="space-y-3">
                    {auditLogs.map(log => (
                      <div key={log.id} className="flex gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 flex-shrink-0" />
                        <div>
                          <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                          <span className="mx-2 text-border">·</span>
                          <span>{log.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* QR Code Pickup / Return */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <QrCode className="w-4 h-4 text-primary" />
                  <h2 className="font-bold text-sm uppercase tracking-wider">Pickup &amp; Return QR Codes</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Pickup QR */}
                  <div className="bg-secondary/20 border border-border rounded-xl p-4 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-1.5 text-amber-400">
                      <PackageCheck className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Pickup</span>
                    </div>
                    {rental?.pickupConfirmedAt ? (
                      <div className="flex flex-col items-center gap-1 text-center">
                        <CheckCircle className="w-8 h-8 text-green-400" />
                        <span className="text-xs text-green-400 font-semibold">Picked Up</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(rental.pickupConfirmedAt).toLocaleString()}</span>
                      </div>
                    ) : pickupQR ? (
                      <>
                        <img src={pickupQR.dataUrl} alt="Pickup QR Code" className="rounded-lg w-40 h-40 bg-white p-1" />
                        <p className="text-[10px] text-muted-foreground text-center break-all">{pickupQR.url}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] gap-1"
                            onClick={() => window.open(`/api/admin/rentals/${rental!.id}/qr/pickup`, "_blank")}
                          >
                            <Download className="w-3 h-3" />Download
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] text-muted-foreground gap-1"
                            onClick={() => genPickupQRMut.mutate()}
                            disabled={genPickupQRMut.isPending}
                          >
                            <RotateCcw className="w-3 h-3" />Refresh
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-800 text-amber-400 hover:bg-amber-950 text-xs gap-1.5"
                        disabled={genPickupQRMut.isPending}
                        onClick={() => genPickupQRMut.mutate()}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        {genPickupQRMut.isPending ? "Generating…" : "Generate Pickup QR"}
                      </Button>
                    )}
                  </div>

                  {/* Return QR */}
                  <div className="bg-secondary/20 border border-border rounded-xl p-4 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-1.5 text-blue-400">
                      <RotateCcw className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Return</span>
                    </div>
                    {rental?.returnConfirmedAt ? (
                      <div className="flex flex-col items-center gap-1 text-center">
                        <CheckCircle className="w-8 h-8 text-green-400" />
                        <span className="text-xs text-green-400 font-semibold">Returned</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(rental.returnConfirmedAt).toLocaleString()}</span>
                      </div>
                    ) : returnQR ? (
                      <>
                        <img src={returnQR.dataUrl} alt="Return QR Code" className="rounded-lg w-40 h-40 bg-white p-1" />
                        <p className="text-[10px] text-muted-foreground text-center break-all">{returnQR.url}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] gap-1"
                            onClick={() => window.open(`/api/admin/rentals/${rental!.id}/qr/return`, "_blank")}
                          >
                            <Download className="w-3 h-3" />Download
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] text-muted-foreground gap-1"
                            onClick={() => genReturnQRMut.mutate()}
                            disabled={genReturnQRMut.isPending}
                          >
                            <RotateCcw className="w-3 h-3" />Refresh
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-800 text-blue-400 hover:bg-blue-950 text-xs gap-1.5"
                        disabled={genReturnQRMut.isPending}
                        onClick={() => genReturnQRMut.mutate()}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        {genReturnQRMut.isPending ? "Generating…" : "Generate Return QR"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Pre-Inspection Photos */}
              {checkinPhotos.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Camera className="w-4 h-4 text-primary" />
                    <h2 className="font-bold text-sm uppercase tracking-wider">Pre-Inspection Photos</h2>
                    <span className="text-xs text-muted-foreground ml-auto">{checkinPhotos.length} photo{checkinPhotos.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {checkinPhotos.map(photo => (
                      <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="group relative rounded-xl overflow-hidden border border-border bg-secondary/20 aspect-square">
                        <img src={photo.url} alt={photo.label || "Pre-inspection"} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[10px] text-white">
                          {photo.label ? photo.label.toUpperCase() : "INSPECTION"} · {new Date(photo.createdAt).toLocaleString()}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Engine Hours */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-primary" />
                    <h2 className="font-bold text-sm uppercase tracking-wider">Engine Hours</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 border-border"
                      disabled={requestHoursMut.isPending}
                      onClick={() => requestHoursMut.mutate()}
                    >
                      <Send className="w-3 h-3" />
                      {requestHoursMut.isPending ? "Sending…" : "Request Reading"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 border-border"
                      onClick={() => setShowManualHoursForm((v) => !v)}
                    >
                      <PlusCircle className="w-3 h-3" />
                      Manual Entry
                    </Button>
                  </div>
                </div>

                {/* Manual entry form */}
                {showManualHoursForm && (
                  <div className="mb-4 p-3 bg-secondary/30 rounded-lg space-y-2 border border-border">
                    <p className="text-xs text-muted-foreground">Enter the current engine hour reading from the trailer.</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 12450"
                        value={manualReading}
                        onChange={(e) => setManualReading(e.target.value)}
                        className="h-8 text-sm w-36"
                      />
                      <span className="text-xs text-muted-foreground">hours</span>
                    </div>
                    <Textarea
                      placeholder="Notes (optional)"
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-white"
                        disabled={manualEntryMut.isPending || !manualReading}
                        onClick={() => {
                          const val = parseInt(manualReading, 10);
                          if (isNaN(val) || val < 0) {
                            toast({ title: "Invalid reading", description: "Enter a valid hour reading", variant: "destructive" });
                            return;
                          }
                          manualEntryMut.mutate({ currentReading: val, notes: manualNotes || undefined });
                        }}
                      >
                        {manualEntryMut.isPending ? "Saving…" : "Save Entry"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowManualHoursForm(false); setManualReading(""); setManualNotes(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Entries list */}
                {hoursLoading ? (
                  <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
                ) : engineHours.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No engine hour readings recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {engineHours.map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between gap-3 p-3 bg-secondary/20 rounded-lg border border-border/50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-base">{entry.currentReading.toLocaleString()} hrs</span>
                            <Badge className={`text-[10px] ${entry.entryType === "admin_manual" ? "bg-purple-950 border-purple-800 text-purple-300" : "bg-blue-950 border-blue-800 text-blue-300"}`}>
                              {entry.entryType === "admin_manual" ? "Admin" : "Renter"}
                            </Badge>
                          </div>
                          {entry.hoursUsed != null && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {entry.hoursUsed} hrs used
                              {entry.calculatedCharge != null && (
                                <span className="ml-1.5 text-amber-400 font-medium">
                                  → ${(entry.calculatedCharge / 100).toFixed(2)} surcharge
                                </span>
                              )}
                              {entry.stripeInvoiceItemId && (
                                <span className="ml-1.5 text-green-400">✓ Billed</span>
                              )}
                            </div>
                          )}
                          {entry.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">"{entry.notes}"</div>}
                          <div className="text-xs text-muted-foreground mt-0.5">{new Date(entry.createdAt).toLocaleString()}</div>
                        </div>
                        {/* Bill button */}
                        {entry.calculatedCharge != null && entry.calculatedCharge > 0 && !entry.stripeInvoiceItemId && rental?.stripeCustomerId && (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-amber-700 hover:bg-amber-600 text-white flex-shrink-0"
                            disabled={billHoursMut.isPending}
                            onClick={() => billHoursMut.mutate(entry.id)}
                          >
                            Queue ${(entry.calculatedCharge / 100).toFixed(2)} to Next Invoice
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right sidebar — admin controls */}
            <div className="space-y-5">

              {/* Status update */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-bold text-sm uppercase tracking-wider mb-4">Update Status</h2>
                <div className="space-y-2">
                  {STATUS_OPTIONS.map(st => {
                    const info = STATUS_STYLES[st];
                    const isCurrent = rental.status === st;
                    const isPending = pendingStatus === st;
                    return (
                      <button
                        key={st}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                          isCurrent
                            ? `${info.cls} opacity-100`
                            : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                        onClick={() => {
                          if (!isCurrent) {
                            if (isPending) {
                              updateMut.mutate({ status: st });
                            } else {
                              setPendingStatus(st);
                            }
                          }
                        }}
                        disabled={updateMut.isPending}
                      >
                        {info.label}
                        {isPending && !isCurrent && (
                          <span className="ml-2 text-primary font-bold">← Click again to confirm</span>
                        )}
                        {isCurrent && <span className="ml-2 opacity-60">current</span>}
                      </button>
                    );
                  })}
                  {pendingStatus && (
                    <button
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                      onClick={() => setPendingStatus(null)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Payment controls */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-bold text-sm uppercase tracking-wider mb-4">Payment Controls</h2>
                <div className="space-y-3">
                  {!rental.depositPaid ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-3">
                        If the renter paid outside Stripe or via check, manually confirm their deposit to activate the rental.
                      </p>
                      <Button
                        size="sm"
                        className="w-full bg-green-700 hover:bg-green-600 text-white gap-2"
                        disabled={confirmDepositMut.isPending}
                        onClick={() => confirmDepositMut.mutate()}
                      >
                        <CreditCard className="w-4 h-4" />
                        {confirmDepositMut.isPending ? "Confirming…" : "Confirm Deposit Paid"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <CheckCircle className="w-4 h-4" />
                      Deposit confirmed
                    </div>
                  )}

                  {rental.status === "pending_payment" && (
                    <div className="flex items-start gap-2 p-3 bg-orange-950/30 border border-orange-900 rounded-lg text-xs text-orange-300">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      Awaiting renter to pay deposit via Stripe Checkout or manual confirmation above.
                    </div>
                  )}

                  {rental.stripeCustomerId && (
                    <div className="pt-2 border-t border-border space-y-2">
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Stripe Customer</div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-muted-foreground truncate">{rental.stripeCustomerId}</span>
                          {invoiceData?.stripeCustomerUrl && (
                            <a href={invoiceData.stripeCustomerUrl} target="_blank" rel="noreferrer" title="Open in Stripe" className="text-muted-foreground hover:text-primary flex-shrink-0">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      {rental.stripeSubscriptionId && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-0.5">Monthly Subscription</div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-green-400 truncate">{rental.stripeSubscriptionId}</span>
                            {invoiceData?.stripeSubscriptionUrl && (
                              <a href={invoiceData.stripeSubscriptionUrl} target="_blank" rel="noreferrer" title="Open in Stripe" className="text-muted-foreground hover:text-primary flex-shrink-0">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                      {invoiceData?.nextBillingDate && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-0.5">Next Billing Date</div>
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-primary" />
                            {new Date(invoiceData.nextBillingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Admin Billing Actions */}
              {rental.stripeCustomerId && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h2 className="font-bold text-sm uppercase tracking-wider mb-4">Billing Actions</h2>
                  <div className="space-y-3">

                    {/* One-off invoice */}
                    {!showInvoiceForm ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-2 border-border"
                        onClick={() => setShowInvoiceForm(true)}
                      >
                        <PlusCircle className="w-4 h-4" />
                        Create One-Off Invoice
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Enter amount and description. The customer will receive an emailed Stripe invoice due in 7 days.</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-muted-foreground">$</span>
                          <Input
                            type="number"
                            min="1"
                            step="0.01"
                            placeholder="0.00"
                            value={invoiceAmount}
                            onChange={e => setInvoiceAmount(e.target.value)}
                            className="h-8 text-sm w-28"
                          />
                        </div>
                        <Input
                          placeholder="Description (e.g. Damage fee)"
                          value={invoiceDesc}
                          onChange={e => setInvoiceDesc(e.target.value)}
                          className="h-8 text-sm"
                          maxLength={200}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-primary hover:bg-primary/90 text-white"
                            disabled={createInvoiceMut.isPending || !invoiceAmount || !invoiceDesc}
                            onClick={() => {
                              const cents = Math.round(parseFloat(invoiceAmount) * 100);
                              if (isNaN(cents) || cents < 100) {
                                toast({ title: "Invalid amount", description: "Minimum $1.00", variant: "destructive" });
                                return;
                              }
                              createInvoiceMut.mutate({ amount: cents, description: invoiceDesc });
                            }}
                          >
                            {createInvoiceMut.isPending ? "Sending…" : "Send Invoice"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setShowInvoiceForm(false); setInvoiceAmount(""); setInvoiceDesc(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Retry subscription if missing on active rental */}
                    {rental.depositPaid && !rental.stripeSubscriptionId && (
                      <div className="pt-2 border-t border-border">
                        <div className="flex items-start gap-2 p-2 bg-orange-950/20 border border-orange-900/50 rounded-lg text-xs text-orange-300 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          No monthly subscription on file. Auto-creation may have failed. Retry below.
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-2 border-green-700 text-green-400 hover:text-green-300 hover:bg-green-950/20"
                          disabled={createSubMut.isPending}
                          onClick={() => createSubMut.mutate()}
                        >
                          {createSubMut.isPending ? "Creating…" : "Create Monthly Subscription"}
                        </Button>
                      </div>
                    )}

                    {/* Cancel subscription */}
                    {rental.stripeSubscriptionId && (
                      <div className="pt-2 border-t border-border">
                        {!cancelSubConfirm ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full gap-2 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                            onClick={() => setCancelSubConfirm(true)}
                          >
                            <XCircle className="w-4 h-4" />
                            Cancel Monthly Subscription
                          </Button>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-orange-300">This immediately cancels the subscription and stops future billing. Confirm?</p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 bg-red-800 hover:bg-red-700 text-white"
                                disabled={cancelSubMut.isPending}
                                onClick={() => cancelSubMut.mutate()}
                              >
                                {cancelSubMut.isPending ? "Cancelling…" : "Yes, Cancel"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setCancelSubConfirm(false)}>
                                Keep
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quick links */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-bold text-sm uppercase tracking-wider mb-3">Quick Links</h2>
                <div className="space-y-2 text-sm">
                  {rental.agreementUrl && (
                    <a href={rental.agreementUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                      <FileText className="w-4 h-4" /> Signed Agreement
                    </a>
                  )}
                  {rental.applicationId && (
                    <Link href={`/admin/requests/${rental.applicationId}`}>
                      <span className="flex items-center gap-2 text-primary hover:underline cursor-pointer">
                        <Calendar className="w-4 h-4" /> View Application
                      </span>
                    </Link>
                  )}
                  {trailer && (
                    <Link href={`/admin/inventory/${trailer.id}`}>
                      <span className="flex items-center gap-2 text-primary hover:underline cursor-pointer">
                        <Truck className="w-4 h-4" /> Manage Trailer
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
