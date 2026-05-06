import { useRef, useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CheckCircle, FileText, Loader2, Truck, DollarSign, CalendarDays,
  AlertTriangle, Shield, Hash, Building2, PenLine, Type, Trash2,
  AlertCircle, Calendar
} from "lucide-react";
import type { Rental, Company } from "@shared/schema";
import { COMPANY } from "@shared/constants";

interface TrailerInfo {
  id: string;
  vin: string;
  type: string;
  make: string | null;
  model: string | null;
  year: string | null;
  priceMonthly: number;
  description: string | null;
}

interface AgreementData {
  rental: Rental;
  trailer: TrailerInfo | null;
  company: Company | null;
}

type SignMode = "draw" | "type";

const TRAILER_TYPE_LABELS: Record<string, string> = {
  reefer: "Refrigerated (Reefer) Trailer",
  dry_van: "Dry Van Trailer",
  flatbed: "Flatbed Trailer",
  chassis: "Chassis",
  specialized: "Specialized Trailer",
};

// ── Canvas Signature Pad ─────────────────────────────────────────────────────
function SignatureCanvas({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasContent, setHasContent] = useState(false);

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e && e.touches.length > 0) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    const me = e as MouseEvent;
    return { x: (me.clientX - rect.left) * scaleX, y: (me.clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    lastPoint.current = getPos(e.nativeEvent, canvasRef.current!);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e.nativeEvent, canvas);
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    if (lastPoint.current) {
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pos.x, pos.y);
    }
    ctx.stroke();
    lastPoint.current = pos;
    setHasContent(true);
    onChange(canvas.toDataURL("image/png"));
  }

  function endDraw() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onChange(null);
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        className="w-full rounded-lg border-2 border-dashed border-border bg-zinc-900 cursor-crosshair touch-none select-none"
        style={{ aspectRatio: "600/160" }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {!hasContent && (
        <p className="absolute inset-0 flex items-center justify-center text-muted-foreground/40 text-sm pointer-events-none select-none">
          Draw your signature here
        </p>
      )}
      {hasContent && (
        <button
          onClick={clear}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1.5 rounded bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors"
          title="Clear and redraw"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── Type Signature Renderer ──────────────────────────────────────────────────
function renderTypedSignature(name: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#18181b";
  ctx.fillRect(0, 0, 600, 160);
  ctx.font = "italic 48px Georgia, serif";
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(name, 300, 88);
  // underline
  const metrics = ctx.measureText(name);
  const lineY = 116;
  const lineX = 300 - metrics.width / 2;
  ctx.beginPath();
  ctx.moveTo(lineX, lineY);
  ctx.lineTo(lineX + metrics.width, lineY);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return canvas.toDataURL("image/png");
}

export default function AgreementPage() {
  const { rentalId } = useParams<{ rentalId: string }>();
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [signMode, setSignMode] = useState<SignMode>("draw");
  const [drawDataUrl, setDrawDataUrl] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("09:00");
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/login");
    else if (user.role === "admin") navigate("/admin");
  }, [user, authLoading, navigate]);

  const { data, isLoading, error } = useQuery<AgreementData>({
    queryKey: ["/api/agreements", rentalId],
    queryFn: async () => {
      const res = await fetch(`/api/agreements/${rentalId}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json() as { message: string };
        throw new Error(body.message);
      }
      return res.json() as Promise<AgreementData>;
    },
    enabled: !!rentalId && !!user,
  });

  const signMut = useMutation({
    mutationFn: async () => {
      const sigDataUrl = signMode === "draw" ? drawDataUrl : (typedName.trim() ? renderTypedSignature(typedName.trim()) : null);
      if (!sigDataUrl) throw new Error("Please provide your signature");
      if (!legalName.trim() || legalName.trim().split(" ").length < 2) throw new Error("Please enter your full legal name (first and last)");
      if (!pickupDate) throw new Error("Please select a preferred pickup date");

      const pickupDateTime = new Date(`${pickupDate}T${pickupTime}:00`);

      const res = await apiRequest("POST", `/api/agreements/${rentalId}/sign`, {
        signedByName: legalName.trim(),
        signatureImage: sigDataUrl,
        pickupDate: pickupDateTime.toISOString(),
        agreed: true,
      });

      if (!res.ok) {
        const err = await res.json() as { message: string };
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setSigned(true);
      toast({ title: "Agreement signed!", description: "A confirmation email has been sent. Your next step is to pay the security deposit." });
      setTimeout(() => navigate("/dashboard"), 3000);
    },
    onError: (err: Error) => {
      toast({ title: "Error signing agreement", description: err.message, variant: "destructive" });
    },
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-4xl mx-auto w-full px-4 py-10 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-2xl mx-auto w-full px-4 py-16 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black mb-2 text-red-400">Agreement Not Found</h1>
          <p className="text-muted-foreground mb-6">{error instanceof Error ? error.message : "Unable to load agreement."}</p>
          <Button onClick={() => navigate("/dashboard")} variant="outline">Back to Dashboard</Button>
        </div>
        <Footer />
      </div>
    );
  }

  const { rental, trailer, company } = data;
  const isAlreadySigned = rental.status !== "pending_agreement";
  const depositAmount = rental.monthlyRate * 2;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Success / already signed state
  if (signed || isAlreadySigned) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-2xl mx-auto w-full px-4 py-16 text-center">
          <CheckCircle className="w-14 h-14 text-green-400 mx-auto mb-4" />
          <h1 className="text-3xl font-black mb-3 text-green-400">Agreement Signed</h1>
          <p className="text-muted-foreground mb-2 text-lg">
            {isAlreadySigned && !signed
              ? "This agreement was previously signed."
              : `Signed by ${legalName || (rental.signedByName ?? "you")}.`}
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Our team will contact you to finalize the 2-month security deposit and activate your rental.
          </p>
          <Button className="bg-primary hover:bg-primary/90 text-white gap-2" onClick={() => navigate("/dashboard")}>
            <Building2 className="w-4 h-4" /> Go to Dashboard
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const hasSig = signMode === "draw" ? !!drawDataUrl : typedName.trim().length >= 2;
  const isReady = hasSig && legalName.trim().split(" ").length >= 2 && !!pickupDate && agreed && !signMut.isPending;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        {/* Title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <FileText className="w-4 h-4" />
            <span>Equipment Rental Agreement</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Sign Your Rental Agreement</h1>
          <p className="text-muted-foreground mt-1">Read the full agreement below, provide your signature, and choose a pickup date.</p>
        </div>

        {/* Summary strip */}
        <div className="bg-card border border-border rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Lessee</p>
              <p className="font-semibold text-sm">{company?.name ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Truck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Equipment</p>
              <p className="font-semibold text-sm capitalize">{trailer?.type?.replace(/_/g, " ") ?? "—"} · {trailer?.vin ?? "N/A"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Monthly Rate</p>
              <p className="font-semibold text-sm">${(rental.monthlyRate / 100).toLocaleString()}/mo</p>
            </div>
          </div>
        </div>

        {/* Agreement document */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
          <div className="bg-primary/10 border-b border-border px-8 py-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-black text-lg tracking-tight">{COMPANY.name.toUpperCase()}</p>
                <p className="text-sm text-muted-foreground">{COMPANY.fullAddress}</p>
                <p className="text-sm text-muted-foreground">{COMPANY.email}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Date: {today}</p>
                <p className="text-sm text-muted-foreground font-mono">Ref: {rental.id.slice(-8).toUpperCase()}</p>
              </div>
            </div>
            <div className="mt-4 text-center">
              <h2 className="text-xl font-black tracking-tight uppercase">Equipment Rental Agreement</h2>
            </div>
          </div>

          {/* Parties */}
          <div className="px-8 py-6 border-b border-border">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">Parties</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <p className="font-bold mb-1">LESSOR (Owner)</p>
                <p>{COMPANY.name}</p>
                <p className="text-muted-foreground">{COMPANY.address}</p>
                <p className="text-muted-foreground">{COMPANY.city}, {COMPANY.state} {COMPANY.zip}</p>
              </div>
              <div>
                <p className="font-bold mb-1">LESSEE (Renter)</p>
                <p>{company?.name ?? "N/A"}</p>
                {company?.ownerName && <p className="text-muted-foreground">{company.ownerName}</p>}
                {company?.address && <p className="text-muted-foreground">{company.address}</p>}
                {company?.email && <p className="text-muted-foreground">{company.email}</p>}
                {company?.dotNumber && <p className="text-muted-foreground">DOT: {company.dotNumber}</p>}
              </div>
            </div>
          </div>

          {/* Equipment */}
          <div className="px-8 py-6 border-b border-border">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">Equipment</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Truck className="w-3 h-3" />Type</p>
                <p className="font-semibold">{TRAILER_TYPE_LABELS[trailer?.type ?? ""] ?? trailer?.type ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Hash className="w-3 h-3" />VIN</p>
                <p className="font-mono font-semibold">{trailer?.vin ?? "N/A"}</p>
              </div>
              {trailer?.make && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Make / Model</p>
                  <p className="font-semibold">{trailer.make} {trailer.model ?? ""}</p>
                </div>
              )}
              {trailer?.year && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Year</p>
                  <p className="font-semibold">{trailer.year}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" />Monthly Rate</p>
                <p className="font-semibold">${(rental.monthlyRate / 100).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Shield className="w-3 h-3" />Security Deposit</p>
                <p className="font-semibold">${(depositAmount / 100).toLocaleString()} (2 months)</p>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="px-8 py-6 text-sm space-y-4 text-foreground/90 leading-relaxed max-h-80 overflow-y-auto">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Terms &amp; Conditions</h3>
            <div>
              <p className="font-semibold mb-1">1. RENTAL TERM</p>
              <p>This Agreement is for a month-to-month trailer rental commencing on the pickup date. Either party may terminate with thirty (30) days written notice.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">2. RENTAL RATE &amp; PAYMENT</p>
              <p>Lessee agrees to pay <strong>${(rental.monthlyRate / 100).toLocaleString()}/month</strong>. A <strong>two-month security deposit of ${(depositAmount / 100).toLocaleString()}</strong> is required prior to pickup, fully refundable upon return in satisfactory condition. Payments 10+ days late are subject to a 5% late fee.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">3. NO MILEAGE FEES</p>
              <p>There are <strong>NO mileage fees</strong>, NO per-mile charges, and NO hidden fees. The monthly rate stated above is the complete total rental charge, subject only to engine hour charges if applicable (reefer units only).</p>
            </div>
            <div>
              <p className="font-semibold mb-1">4. INSURANCE</p>
              <p>Lessee shall maintain commercial auto liability insurance with minimum $1,000,000 per occurrence, naming Deluxe Logistics Inc. as an additional insured. Current COI must be on file prior to pickup and kept current throughout the term.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">5. CARE &amp; MAINTENANCE</p>
              <p>Lessee shall maintain the equipment in good working order and shall not make alterations without written consent. Lessee is responsible for routine maintenance and shall promptly notify Lessor of any damage or mechanical issues within 24 hours.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">6. AUTHORIZED USE</p>
              <p>Equipment shall be used only for lawful purposes and within the scope of Lessee's operating authority. Lessee shall comply with all FMCSA and applicable regulations. Subleasing without written permission is strictly prohibited.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">7. RETURN OF EQUIPMENT</p>
              <p>Upon termination, Lessee shall return equipment to Lessor's location in the same condition received, normal wear and tear excepted. Lessee is responsible for all repair costs beyond normal wear and tear.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">8. INDEMNIFICATION</p>
              <p>Lessee shall indemnify, defend, and hold harmless Deluxe Logistics Inc. from any claims, damages, losses, or liabilities arising out of Lessee's use of the equipment.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">9. DEFAULT</p>
              <p>If Lessee fails to make any payment when due, or breaches any provision of this Agreement, Lessor may terminate and repossess the equipment without prior notice.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">10. GOVERNING LAW</p>
              <p>This Agreement shall be governed by the laws of the State of West Virginia. Disputes shall be resolved in Berkeley County, WV courts.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">11. ENTIRE AGREEMENT</p>
              <p>This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations or agreements. Modifications must be in writing and signed by both parties.</p>
            </div>
          </div>
        </div>

        {/* Signature section */}
        <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <PenLine className="w-5 h-5 text-primary" /> Electronic Signature
          </h2>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSignMode("draw")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                signMode === "draw"
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-transparent border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <PenLine className="w-4 h-4" /> Draw Signature
            </button>
            <button
              onClick={() => setSignMode("type")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                signMode === "type"
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-transparent border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Type className="w-4 h-4" /> Type Signature
            </button>
          </div>

          {/* Signature input */}
          {signMode === "draw" ? (
            <div>
              <SignatureCanvas onChange={setDrawDataUrl} />
              <p className="text-xs text-muted-foreground mt-1.5">Draw your signature with mouse or touch. Click the trash icon to clear and redraw.</p>
            </div>
          ) : (
            <div>
              <Input
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                placeholder="Type your name to generate a signature"
                className="bg-zinc-900 border-border text-2xl h-16 text-center italic"
                style={{ fontFamily: "Georgia, serif" }}
              />
              {typedName.trim() && (
                <p className="text-xs text-muted-foreground mt-1.5 text-center">
                  Preview — your name will be rendered as a signature image
                </p>
              )}
            </div>
          )}

          {/* Legal name field */}
          <div>
            <label className="text-sm font-semibold mb-2 block">
              Full Legal Name <span className="text-red-400">*</span>
            </label>
            <Input
              value={legalName}
              onChange={e => setLegalName(e.target.value)}
              placeholder="Type your full legal name as it appears on your ID"
              className="bg-background border-border text-base font-medium"
              style={{ fontFamily: "Georgia, serif" }}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              This will appear on the signed agreement. Enter first and last name.
            </p>
          </div>

          {/* Pickup date/time */}
          <div>
            <label className="text-sm font-bold mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Preferred Pickup Date &amp; Time
            </label>
            <p className="text-xs text-muted-foreground mb-3">Pick up from: {COMPANY.fullAddress} · {COMPANY.hours}</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground block mb-1.5">Date</label>
                <Input
                  type="date"
                  value={pickupDate}
                  min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                  onChange={e => setPickupDate(e.target.value)}
                  className="bg-zinc-900 border-border"
                />
              </div>
              <div className="w-full sm:w-40">
                <label className="text-xs text-muted-foreground block mb-1.5">Time</label>
                <Input
                  type="time"
                  value={pickupTime}
                  min="08:00"
                  max="17:00"
                  onChange={e => setPickupTime(e.target.value)}
                  className="bg-zinc-900 border-border"
                />
              </div>
            </div>
          </div>

          {/* Agreement checkbox */}
          <div className="flex items-start gap-3 bg-muted/40 rounded-lg p-4">
            <input
              type="checkbox"
              id="agree"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
            />
            <label htmlFor="agree" className="text-sm cursor-pointer leading-relaxed">
              I, <strong>{legalName.trim() || "[your full name]"}</strong>, representing{" "}
              <strong>{company?.name ?? "my company"}</strong>, confirm that I have read and agree to all terms of this Rental Agreement. I understand that this constitutes a legally binding electronic signature under the Electronic Signatures in Global and National Commerce Act (ESIGN).
            </label>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="w-4 h-4" />
            <span>Date of signing: <strong className="text-foreground">{today}</strong></span>
          </div>

          {/* Validation hints */}
          <div className="space-y-1">
            {!hasSig && (
              <p className="text-xs text-yellow-400 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> Signature required
              </p>
            )}
            {legalName.trim().split(" ").length < 2 && (
              <p className="text-xs text-yellow-400 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> Full legal name required (first and last)
              </p>
            )}
            {!pickupDate && (
              <p className="text-xs text-yellow-400 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> Pickup date required
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 text-base gap-2"
            onClick={() => signMut.mutate()}
            disabled={!isReady}
          >
            {signMut.isPending ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Submitting Signature…</>
            ) : signMut.isSuccess ? (
              <><CheckCircle className="w-5 h-5" /> Signed — Redirecting to Dashboard…</>
            ) : (
              <><CheckCircle className="w-5 h-5" /> Sign Agreement &amp; Submit</>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Your signature, IP address, and timestamp are recorded securely.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
