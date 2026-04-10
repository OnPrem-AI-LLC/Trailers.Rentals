import { useState } from "react";
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
import {
  Truck, Building2, ChevronLeft, FileText, ExternalLink, CheckCircle,
  CreditCard, Calendar, Clock, AlertTriangle, Receipt, Download,
  Activity, DollarSign, User, Hash, Mail, Phone
} from "lucide-react";
import type { Rental, Document, AuditLog, Company } from "@shared/schema";

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
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">${(inv.amount / 100).toLocaleString()}</span>
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
                    <div className="pt-2 border-t border-border">
                      <div className="text-xs text-muted-foreground mb-1">Stripe Customer</div>
                      <div className="font-mono text-xs text-muted-foreground truncate">{rental.stripeCustomerId}</div>
                    </div>
                  )}
                </div>
              </div>

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
