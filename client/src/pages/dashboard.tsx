import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Truck, FileText, Clock, CircleDollarSign, LogOut, Upload, CheckCircle,
  AlertCircle, ExternalLink, Trash2, Shield, FileCheck, CreditCard,
  Building2, Phone, Mail, Hash, Loader2, MessageSquare, ChevronDown, ChevronUp, Send,
  Receipt, Download, ClipboardList, MapPin, Calendar,
} from "lucide-react";
import type { Rental, Document, Company, AdminNote } from "@shared/schema";
import { COMPANY } from "@shared/constants";
import { CANCELLATION_POLICY, RENEWAL_TERMS_VERSION, renewalTerms } from "@shared/renewal";
import { apiRequest, serverMessage } from "@/lib/queryClient";

interface ApplicationTrailer {
  id: string; vin: string; type: string; make: string | null; model: string | null;
  year: string | null; priceMonthly: number | null; location: string | null; primaryPhoto: string | null;
}

interface ApplicationNote {
  id: string; body: string; authorId: string; createdAt: string;
}

interface ApplicationAuditEntry {
  id: string; actionType: string; description: string; createdAt: string;
}

interface DashboardApplication {
  id: string; trailerId: string; companyName: string; ownerName: string;
  email: string; dotNumber: string; mcNumber: string | null; phone: string;
  intendedUse: string; status: string; adminNotes: string | null;
  renterToken: string | null; createdAt: string;
  trailer: ApplicationTrailer | null;
  notes: ApplicationNote[];
  auditHistory: ApplicationAuditEntry[];
}

// Rental row as /api/dashboard serializes it: timestamps arrive as ISO strings.
type DashboardRental = Omit<Rental, "subscriptionEndsAt" | "subscriptionCancelRequestedAt"> & {
  subscriptionEndsAt?: string | null;
  subscriptionCancelRequestedAt?: string | null;
};

interface DashboardData {
  user: { id: string; email: string; firstName: string; lastName: string; role: string; companyId: string | null | undefined };
  rentals: DashboardRental[];
  documents: Document[];
  company: Company | null;
  applications: DashboardApplication[];
}

const DOC_TYPES = [
  { key: "coi", label: "Certificate of Insurance (COI)", icon: Shield, required: true },
  { key: "certificate_of_authority", label: "Certificate of Authority", icon: FileCheck, required: true },
  { key: "drivers_license", label: "Driver's License", icon: CreditCard, required: false },
] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
  coi: "Certificate of Insurance",
  certificate_of_authority: "Certificate of Authority",
  drivers_license: "Driver's License",
  agreement: "Rental Agreement",
};

const RENTAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_agreement: { label: "Pending Agreement", color: "text-yellow-400 bg-yellow-950 border-yellow-800" },
  pending_payment: { label: "Pending Payment", color: "text-orange-400 bg-orange-950 border-orange-800" },
  active: { label: "Active", color: "text-green-400 bg-green-950 border-green-800" },
  active_in_use: { label: "In Use", color: "text-blue-400 bg-blue-950 border-blue-800" },
  completed: { label: "Completed", color: "text-muted-foreground bg-muted border-border" },
  cancelled: { label: "Cancelled", color: "text-red-400 bg-red-950 border-red-800" },
};

const APP_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: "Under Review",    color: "text-yellow-400 bg-yellow-950 border-yellow-800", icon: <Clock className="w-3 h-3" /> },
  needs_info: { label: "Info Needed",     color: "text-blue-400 bg-blue-950 border-blue-800",       icon: <AlertCircle className="w-3 h-3" /> },
  approved:   { label: "Approved",        color: "text-green-400 bg-green-950 border-green-800",    icon: <CheckCircle className="w-3 h-3" /> },
  rejected:   { label: "Not Approved",    color: "text-red-400 bg-red-950 border-red-800",          icon: <AlertCircle className="w-3 h-3" /> },
};

const TRAILER_TYPE_LABELS: Record<string, string> = {
  dry_van: "Dry Van", reefer: "Reefer", flatbed: "Flatbed",
  chassis: "Chassis", specialized: "Specialized",
};

function RentalMessageThread({ rentalId, currentUserId }: { rentalId: string; currentUserId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [newMsg, setNewMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: messages, isLoading } = useQuery<AdminNote[]>({
    queryKey: ["/api/rentals", rentalId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/rentals/${rentalId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json() as Promise<AdminNote[]>;
    },
    enabled: expanded,
    refetchInterval: expanded ? 30000 : false,
  });

  const sendMut = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/rentals/${rentalId}/messages`, { body });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      setNewMsg("");
      qc.invalidateQueries({ queryKey: ["/api/rentals", rentalId, "messages"] });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const unreadCount = messages?.filter(m => m.authorId !== currentUserId && !m.isPinned).length ?? 0;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <MessageSquare className="w-4 h-4" />
        <span>Messages{messages && messages.length > 0 ? ` (${messages.length})` : ""}</span>
        {!expanded && unreadCount > 0 && (
          <Badge className="text-xs bg-primary/20 text-primary border-primary/30 ml-1">{unreadCount} new</Badge>
        )}
        {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !messages || messages.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No messages yet. Use this thread to communicate with Deluxe Logistics.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {[...messages].reverse().map(msg => {
                const isMe = msg.authorId === currentUserId;
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`rounded-lg px-3 py-2 text-xs max-w-[80%] ${isMe ? "bg-primary/20 text-primary-foreground border border-primary/30" : "bg-secondary text-foreground border border-border"}`}>
                      <p className={`text-[10px] mb-1 ${isMe ? "text-primary/70" : "text-muted-foreground"}`}>
                        {isMe ? "You" : "Deluxe Logistics"} · {new Date(msg.createdAt).toLocaleDateString()}
                      </p>
                      <p className="leading-snug whitespace-pre-wrap">{msg.body}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              className="text-xs min-h-0 h-16 resize-none"
              placeholder="Type a message to Deluxe Logistics…"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && newMsg.trim()) {
                  e.preventDefault();
                  sendMut.mutate(newMsg.trim());
                }
              }}
            />
            <Button
              size="sm"
              className="self-end"
              disabled={!newMsg.trim() || sendMut.isPending}
              onClick={() => newMsg.trim() && sendMut.mutate(newMsg.trim())}
            >
              {sendMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface InvoiceEntry {
  id: string; amount: number; description: string | null;
  createdAt: string; receiptUrl?: string | null; invoiceUrl?: string | null; pdfUrl?: string | null;
}

interface InvoiceData {
  charges: (InvoiceEntry & { status: string | null })[];
  invoices: (InvoiceEntry & { status: string | null })[];
}

function RentalInvoiceHistory({ rentalId }: { rentalId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery<InvoiceData>({
    queryKey: ["/api/rentals", rentalId, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/rentals/${rentalId}/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<InvoiceData>;
    },
    enabled: expanded,
  });

  const totalEntries = (data?.charges.length ?? 0) + (data?.invoices.length ?? 0);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <Receipt className="w-4 h-4" />
        <span>Payment History{totalEntries > 0 ? ` (${totalEntries})` : ""}</span>
        {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {expanded && (
        <div className="mt-3">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !data || totalEntries === 0 ? (
            <p className="text-xs text-muted-foreground italic">No payment records found yet.</p>
          ) : (
            <div className="space-y-2">
              {[...data.charges, ...data.invoices].sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              ).map(entry => (
                <div key={entry.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                  <div>
                    <div className="font-medium text-foreground">{entry.description ?? "Payment"}</div>
                    <div className="text-muted-foreground">{new Date(entry.createdAt).toLocaleDateString()}</div>
                    {entry.status && entry.status !== "succeeded" && (
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        entry.status === "paid" ? "bg-green-950 text-green-400" :
                        entry.status === "open" ? "bg-orange-950 text-orange-400" :
                        entry.status === "void" ? "bg-red-950 text-red-400" :
                        "bg-muted text-muted-foreground"
                      }`}>{entry.status}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`font-semibold ${entry.status === "open" ? "text-orange-400" : "text-green-400"}`}>
                      ${(entry.amount / 100).toLocaleString()}
                    </span>
                    {(entry.receiptUrl ?? entry.invoiceUrl ?? entry.pdfUrl) && (
                      <a
                        href={(entry.receiptUrl ?? entry.invoiceUrl ?? entry.pdfUrl)!}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-primary"
                        title="View receipt"
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ApplicationCard({ app, currentUserId }: { app: DashboardApplication; currentUserId: string }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const status = APP_STATUS[app.status] ?? { label: app.status, color: "text-muted-foreground bg-muted border-border", icon: null };
  const t = app.trailer;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <ClipboardList className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold truncate">Application #{app.id.slice(-8).toUpperCase()}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3" />
              Submitted {new Date(app.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
        </div>
        <Badge className={`text-xs border flex items-center gap-1 flex-shrink-0 ${status.color}`}>
          {status.icon}{status.label}
        </Badge>
      </div>

      {/* Trailer info */}
      {t ? (
        <div className="flex gap-3 bg-secondary/30 rounded-lg p-3 mb-3">
          {t.primaryPhoto ? (
            <img src={t.primaryPhoto} alt="Trailer" className="w-20 h-14 object-cover rounded-md flex-shrink-0" />
          ) : (
            <div className="w-20 h-14 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
              <Truck className="w-6 h-6 text-muted-foreground/30" />
            </div>
          )}
          <div className="min-w-0 text-sm">
            <div className="font-semibold">
              {[t.year, t.make, t.model].filter(Boolean).join(" ") || TRAILER_TYPE_LABELS[t.type] || t.type}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">VIN: {t.vin}</div>
            {t.location && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />{t.location}
              </div>
            )}
            {t.priceMonthly != null && (
              <div className="text-xs font-semibold text-primary mt-1">
                ${(t.priceMonthly / 100).toLocaleString()}/month
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Admin message if rejected/needs_info */}
      {app.status === "rejected" && app.adminNotes && (
        <div className="bg-red-950/30 border border-red-800/50 rounded-lg px-3 py-2 mb-3 text-xs text-red-300">
          <span className="font-semibold block mb-0.5">Reason:</span>
          {app.adminNotes}
        </div>
      )}
      {app.status === "needs_info" && (
        <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg px-3 py-2 mb-3 text-xs text-blue-300">
          Additional information is required. Check the correspondence below for details.
        </div>
      )}
      {app.status === "approved" && (
        <div className="bg-green-950/30 border border-green-800/50 rounded-lg px-3 py-2 mb-3 text-xs text-green-300">
          Your application has been approved. Check your rentals above for next steps.
        </div>
      )}

      {/* Correspondence */}
      {app.notes.length > 0 && (
        <div className="border-t border-border pt-3 mt-1">
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full text-left"
            onClick={() => setNotesOpen(v => !v)}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Correspondence ({app.notes.length})</span>
            {notesOpen ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {notesOpen && (
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
              {[...app.notes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(note => {
                const isMe = note.authorId === currentUserId;
                return (
                  <div key={note.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`rounded-lg px-3 py-2 text-xs max-w-[80%] ${isMe ? "bg-primary/20 border border-primary/30" : "bg-secondary border border-border"}`}>
                      <p className="text-[10px] mb-1 text-muted-foreground">
                        {isMe ? "You" : "Deluxe Logistics"} · {new Date(note.createdAt).toLocaleDateString()}
                      </p>
                      <p className="leading-snug whitespace-pre-wrap">{note.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Activity history */}
      {app.auditHistory.length > 0 && (
        <div className="border-t border-border pt-3 mt-3">
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full text-left"
            onClick={() => setHistoryOpen(v => !v)}
          >
            <Clock className="w-4 h-4" />
            <span>Activity ({app.auditHistory.length})</span>
            {historyOpen ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {historyOpen && (
            <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {[...app.auditHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(entry => (
                <div key={entry.id} className="flex items-start gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                  <span className="text-muted-foreground whitespace-nowrap tabular-nums min-w-[80px]">
                    {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-foreground/80">{entry.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Same zone as the emails (COMPANY.timeZone), so the renter sees one date everywhere.
function formatEndDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: COMPANY.timeZone });
}

// Renewal terms + consent checkbox directly above the Stripe Checkout button.
// The consent and the terms version travel with the request so the server can
// record what the renter agreed to before the subscription is created.
function MonthlyBillingSetup({ rental }: { rental: DashboardRental }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);

  async function start() {
    if (!agreed) return;
    setStarting(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/create-subscription-session", {
        rentalId: rental.id,
        renewalConsent: true,
        renewalTermsVersion: RENEWAL_TERMS_VERSION,
      });
      const data = await res.json() as { url?: string; alreadyActive?: boolean };
      if (data.alreadyActive || !data.url) {
        // Stripe already had a live subscription for this rental (its webhook
        // had not landed yet); the server attached it, so just refresh.
        toast({ title: "Monthly billing is already active", description: "Your earlier setup went through. No second subscription was created." });
        qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
        setStarting(false);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      toast({ title: "Error", description: serverMessage(err, "Could not start subscription setup."), variant: "destructive" });
      setStarting(false);
    }
  }

  const checkboxId = `renewal-consent-${rental.id}`;
  return (
    <div className="mt-4 border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Monthly billing</span>
      </div>
      {/* Terms at normal size and colour so the consent is conspicuous, not fine print */}
      <div className="border border-border rounded-lg p-3 space-y-3 text-sm text-foreground">
        <p className="leading-relaxed">
          <span className="font-bold">Automatic monthly billing.</span> {renewalTerms(rental.monthlyRate)}
        </p>
        <div className="flex items-start gap-2.5">
          <Checkbox id={checkboxId} checked={agreed} onCheckedChange={v => setAgreed(v === true)} className="mt-0.5" />
          <label htmlFor={checkboxId} className="leading-snug cursor-pointer">
            I agree to these automatic renewal terms
          </label>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="gap-2 border-green-700 text-green-400"
        disabled={!agreed || starting}
        onClick={start}
      >
        {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Set Up Monthly Billing
      </Button>
    </div>
  );
}

// Shown once a subscription exists: the renewal cadence plus a confirm-first cancel.
// A cancellation is immediate and binding; rent stops after the later of the end
// of the current billing month and 30 days from the request (the signed agreement
// is month-to-month with 30 days' written notice), so the server decides the date.
function MonthlyBillingStatus({ rental }: { rental: DashboardRental }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [endsAt, setEndsAt] = useState<string | null>(rental.subscriptionEndsAt ?? null);
  const cancelRequested = !!rental.subscriptionCancelRequestedAt || !!endsAt;
  // Only show an end date for a subscription that still exists; a stale date on a
  // rental whose subscription was cleared would be misleading.
  const showsEndDate = !!rental.stripeSubscriptionId && !!endsAt;

  const cancelMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rentals/${rental.id}/cancel-subscription`);
      return res.json() as Promise<{ endsAt: string }>;
    },
    onSuccess: (data) => {
      setEndsAt(data.endsAt);
      qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: "Monthly billing cancelled",
        description: `Monthly rent stops after ${formatEndDate(data.endsAt)}. Return the trailer by that date under your rental agreement.`,
      });
    },
    onError: (err) => toast({ title: "Could not cancel billing", description: serverMessage(err, "Please try again or contact us."), variant: "destructive" }),
  });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Calendar className="w-3.5 h-3.5" />
      {showsEndDate ? (
        <span>Monthly billing ends {formatEndDate(endsAt!)}</span>
      ) : cancelRequested ? (
        <span>Monthly billing cancellation requested</span>
      ) : (
        <>
          <span>Monthly billing: renews on the same day each month</span>
          <span aria-hidden>·</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="text-primary hover:underline" disabled={cancelMut.isPending}>
                {cancelMut.isPending ? "Cancelling…" : "Cancel monthly billing"}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel monthly billing?</AlertDialogTitle>
                <AlertDialogDescription>
                  This request is immediate and binding. {CANCELLATION_POLICY}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep billing</AlertDialogCancel>
                <AlertDialogAction onClick={() => cancelMut.mutate()}>Cancel monthly billing</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

// After the subscription has actually ended (Stripe's customer.subscription.deleted),
// say so instead of silently offering to set billing up again; a renter who
// changed their mind can still restart, which collects a fresh consent.
function MonthlyBillingEnded({ rental }: { rental: DashboardRental }) {
  const [restart, setRestart] = useState(false);
  if (restart) return <MonthlyBillingSetup rental={rental} />;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Calendar className="w-3.5 h-3.5" />
      <span>Monthly billing ended {formatEndDate(rental.subscriptionEndsAt!)}. Return the trailer by that date under your rental agreement.</span>
      <span aria-hidden>·</span>
      <button className="text-primary hover:underline" onClick={() => setRestart(true)}>Set up monthly billing again</button>
    </div>
  );
}

export default function Dashboard() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  // Check for payment return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      toast({ title: "Payment received!", description: "Your security deposit has been processed. Your rental is now active." });
      qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
      window.history.replaceState({}, "", "/dashboard");
    } else if (params.get("payment") === "cancelled") {
      toast({ title: "Payment cancelled", description: "Your payment was not completed.", variant: "destructive" });
      window.history.replaceState({}, "", "/dashboard");
    } else if (params.get("subscription") === "success") {
      const sessionId = params.get("session_id");
      window.history.replaceState({}, "", "/dashboard");
      // Attach the subscription now rather than waiting for Stripe's webhook,
      // so the setup box does not reappear for the next few seconds.
      (async () => {
        let outcome: string | null = null;
        if (sessionId) {
          try {
            const res = await apiRequest("POST", "/api/stripe/subscription-session-complete", { sessionId });
            outcome = ((await res.json()) as { outcome?: string }).outcome ?? null;
          } catch {
            // The webhook attaches it; the dashboard refreshes below either way.
          }
        }
        qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
        if (outcome === "duplicate_kept_existing") {
          toast({
            title: "Monthly billing was already active",
            description: "This rental already had monthly billing, so we kept the existing one and alerted our team to cancel and refund the duplicate.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Monthly billing set up", description: "Your monthly rental billing is now active." });
        }
      })();
    }
  }, []);

  // Navigate to the Stripe Elements payment page
  function startDepositPayment(rentalId: string) {
    navigate(`/dashboard/payment/${rentalId}`);
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/login");
    else if (user.role === "admin") navigate("/admin");
  }, [user, authLoading, navigate]);

  const { data: dashData, isLoading: dataLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    enabled: !!user && user.role === "renter",
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Document removed" });
    },
    onError: () => toast({ title: "Failed to remove document", variant: "destructive" }),
  });

  async function handleUpload(type: string, file: File) {
    setUploadingType(type);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("type", type);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json() as { message: string };
        throw new Error(err.message);
      }
      await qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Document uploaded successfully" });
    } catch (e: unknown) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploadingType(null);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  const rentals: DashboardRental[] = dashData?.rentals ?? [];
  const docs: Document[] = dashData?.documents ?? [];
  const company: Company | null = dashData?.company ?? null;
  const applications: DashboardApplication[] = dashData?.applications ?? [];

  const docsByType = docs.reduce<Record<string, Document[]>>((acc, d) => {
    if (!acc[d.type]) acc[d.type] = [];
    acc[d.type].push(d);
    return acc;
  }, {});

  const pendingActions: string[] = [];
  if (!docsByType["coi"]?.length) pendingActions.push("Upload Certificate of Insurance");
  if (!docsByType["certificate_of_authority"]?.length) pendingActions.push("Upload Certificate of Authority");
  rentals.forEach(r => {
    if (r.status === "pending_agreement") pendingActions.push("Sign rental agreement");
    if (r.status === "pending_payment") pendingActions.push("Submit payment");
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              Welcome back, {user.firstName}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{user.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => logout().then(() => navigate("/"))} className="text-muted-foreground gap-2">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>

        {/* Pending actions banner */}
        {pendingActions.length > 0 && (
          <div className="bg-yellow-950/40 border border-yellow-800 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-yellow-300 text-sm mb-1">Action Required</p>
                <ul className="space-y-0.5">
                  {pendingActions.map(a => (
                    <li key={a} className="text-sm text-yellow-200">• {a}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Company info */}
            {dataLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : company ? (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-primary" />
                  <h2 className="font-bold text-sm uppercase tracking-wider">Company Profile</h2>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Company</span>
                    <p className="font-semibold">{company.name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Owner</span>
                    <p>{company.ownerName}</p>
                  </div>
                  {company.dotNumber && (
                    <div>
                      <span className="text-muted-foreground text-xs flex items-center gap-1"><Hash className="w-3 h-3" />DOT</span>
                      <p className="font-mono">{company.dotNumber}</p>
                    </div>
                  )}
                  {company.mcNumber && (
                    <div>
                      <span className="text-muted-foreground text-xs flex items-center gap-1"><Hash className="w-3 h-3" />MC</span>
                      <p className="font-mono">{company.mcNumber}</p>
                    </div>
                  )}
                  {company.phone && (
                    <div>
                      <span className="text-muted-foreground text-xs flex items-center gap-1"><Phone className="w-3 h-3" />Phone</span>
                      <p>{company.phone}</p>
                    </div>
                  )}
                  {company.email && (
                    <div>
                      <span className="text-muted-foreground text-xs flex items-center gap-1"><Mail className="w-3 h-3" />Email</span>
                      <p>{company.email}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Applications */}
            {(dataLoading || applications.length > 0) && (
              <div>
                <h2 className="text-lg font-bold mb-4">Your Applications</h2>
                {dataLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {applications.map(app => (
                      <ApplicationCard key={app.id} app={app} currentUserId={user.id} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Active rentals */}
            <div>
              <h2 className="text-lg font-bold mb-4">Your Rentals</h2>
              {dataLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : rentals.length === 0 ? (
                <div className="border border-dashed border-border rounded-xl p-10 text-center">
                  <Truck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">No active rentals</p>
                  <p className="text-sm text-muted-foreground/70 mt-1 mb-5">
                    Browse available trailers and submit an application to get started.
                  </p>
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={() => navigate("/")}>
                    Browse Trailers
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {rentals.map((rental) => {
                    const statusInfo = RENTAL_STATUS_LABELS[rental.status] ?? { label: rental.status, color: "text-muted-foreground bg-muted border-border" };
                    return (
                      <div key={rental.id} className="bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Truck className="w-5 h-5 text-primary" />
                            <div>
                              <div className="font-semibold">Rental #{rental.id.slice(-8).toUpperCase()}</div>
                              <div className="text-sm text-muted-foreground">
                                ${(rental.monthlyRate / 100).toLocaleString()}/month
                              </div>
                            </div>
                          </div>
                          <Badge className={`text-xs border ${statusInfo.color}`}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {rental.status === "pending_agreement" && (
                            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white gap-2" onClick={() => navigate(`/agreement/${rental.id}`)}>
                              <FileText className="w-4 h-4" /> Sign Agreement
                            </Button>
                          )}
                          {rental.status === "pending_payment" && !rental.depositPaid && (
                            <Button
                              size="sm"
                              className="bg-primary hover:bg-primary/90 text-white gap-2"
                              onClick={() => startDepositPayment(rental.id)}
                            >
                              <CircleDollarSign className="w-4 h-4" /> Pay Security Deposit
                            </Button>
                          )}
                          {(rental.status === "active" || rental.status === "active_in_use") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => navigate(`/dashboard/engine-hours/${rental.id}`)}
                            >
                              <Clock className="w-4 h-4" /> Submit Engine Hours
                            </Button>
                          )}
                        </div>
                        {/* Monthly billing: consent + setup before a subscription exists, status + cancel while
                            one is live, the end date once it has ended */}
                        {rental.depositPaid && rental.status !== "completed" && rental.status !== "cancelled" && !rental.stripeSubscriptionId && (
                          rental.subscriptionEndsAt
                            ? <MonthlyBillingEnded rental={rental} />
                            : <MonthlyBillingSetup rental={rental} />
                        )}
                        {rental.stripeSubscriptionId && rental.status !== "completed" && rental.status !== "cancelled" && (
                          <MonthlyBillingStatus rental={rental} />
                        )}
                        {/* Message thread for each rental */}
                        <RentalMessageThread rentalId={rental.id} currentUserId={user.id} />
                        {/* Payment history (only if stripe customer exists) */}
                        {rental.stripeCustomerId && (
                          <RentalInvoiceHistory rentalId={rental.id} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">

            {/* Document checklist */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-bold text-sm uppercase tracking-wider mb-4">Required Documents</h2>
              {dataLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <div className="space-y-3">
                  {DOC_TYPES.map(({ key, label, icon: Icon, required }) => {
                    const uploaded = docsByType[key] ?? [];
                    const hasDoc = uploaded.length > 0;
                    return (
                      <div key={key} className={`rounded-lg border p-3 ${hasDoc ? "border-green-800 bg-green-950/20" : "border-border"}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {hasDoc ? (
                              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                            ) : (
                              <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <div>
                              <span className="text-sm font-medium">{label}</span>
                              {required && !hasDoc && (
                                <span className="text-xs text-red-400 ml-1">*required</span>
                              )}
                            </div>
                          </div>
                          <input
                            ref={el => { fileRefs.current[key] = el; }}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(key, file);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                            disabled={uploadingType === key}
                            onClick={() => fileRefs.current[key]?.click()}
                          >
                            <Upload className="w-3 h-3" />
                            {uploadingType === key ? "Uploading…" : hasDoc ? "Replace" : "Upload"}
                          </Button>
                        </div>
                        {/* Uploaded file list */}
                        {uploaded.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {uploaded.map(doc => (
                              <div key={doc.id} className="flex items-center justify-between text-xs text-muted-foreground">
                                <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary truncate max-w-[160px]">
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{doc.fileName}</span>
                                </a>
                                <button
                                  className="text-red-500 hover:text-red-400 ml-2 flex-shrink-0"
                                  onClick={() => deleteMut.mutate(doc.id)}
                                  title="Remove"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* All other uploaded docs */}
            {docs.filter(d => !DOC_TYPES.some(t => t.key === d.type)).length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-bold text-sm uppercase tracking-wider mb-3">Other Documents</h2>
                <div className="space-y-2">
                  {docs.filter(d => !DOC_TYPES.some(t => t.key === d.type)).map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</p>
                        <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline truncate">
                          <ExternalLink className="w-3 h-3" />
                          <span className="truncate">{doc.fileName}</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Support */}
            <div className="bg-card border border-border rounded-xl p-5 text-sm">
              <h2 className="font-bold text-sm uppercase tracking-wider mb-3">Need Help?</h2>
              <p className="text-muted-foreground text-xs mb-3">Contact Deluxe Logistics for questions about your rental, documents, or payments.</p>
              <a href={`mailto:${COMPANY.email}`} className="text-primary hover:underline text-xs flex items-center gap-1">
                <Mail className="w-3 h-3" /> {COMPANY.email}
              </a>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
