import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, FileText, Loader2, Truck, DollarSign, CalendarDays,
  AlertTriangle, Shield, Hash, Building2
} from "lucide-react";
import type { Rental, Company } from "@shared/schema";

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

const TRAILER_TYPE_LABELS: Record<string, string> = {
  reefer: "Refrigerated (Reefer) Trailer",
  dry_van: "Dry Van Trailer",
  flatbed: "Flatbed Trailer",
  chassis: "Chassis",
  specialized: "Specialized Trailer",
};

export default function AgreementPage() {
  const { rentalId } = useParams();
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [signedByName, setSignedByName] = useState("");
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
      const res = await fetch(`/api/agreements/${rentalId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ signedByName: signedByName.trim(), agreed }),
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
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
              : `Signed by ${rental.signedByName ?? signedByName} on ${rental.agreementSignedAt ? new Date(rental.agreementSignedAt).toLocaleDateString() : "today"}.`}
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Our team will contact you shortly to finalize the 2-month security deposit and activate your rental.
          </p>
          <Button className="bg-primary hover:bg-primary/90 text-white gap-2" onClick={() => navigate("/dashboard")}>
            <Building2 className="w-4 h-4" /> Go to Dashboard
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        {/* Page title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <FileText className="w-4 h-4" />
            <span>Equipment Rental Agreement</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Trailer Rental Agreement</h1>
          <p className="text-muted-foreground mt-1">Please read the full agreement below and sign to proceed.</p>
        </div>

        {/* Agreement document */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
          {/* Document header */}
          <div className="bg-primary/10 border-b border-border px-8 py-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-black text-lg tracking-tight">DELUXE LOGISTICS INC.</p>
                <p className="text-sm text-muted-foreground">818 Corning Way, Martinsburg, WV 25401</p>
                <p className="text-sm text-muted-foreground">info@deluxelogistics.com</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Date: {today}</p>
                <p className="text-sm text-muted-foreground font-mono">Ref: {rental.id.slice(-8).toUpperCase()}</p>
              </div>
            </div>
            <div className="mt-4 text-center">
              <h2 className="text-xl font-black tracking-tight uppercase">EQUIPMENT RENTAL AGREEMENT</h2>
            </div>
          </div>

          {/* Parties */}
          <div className="px-8 py-6 border-b border-border">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">Parties</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <p className="font-bold mb-1">LESSOR (Owner)</p>
                <p>Deluxe Logistics Inc.</p>
                <p className="text-muted-foreground">818 Corning Way</p>
                <p className="text-muted-foreground">Martinsburg, WV 25401</p>
              </div>
              <div>
                <p className="font-bold mb-1">LESSEE (Renter)</p>
                <p>{company?.name ?? "N/A"}</p>
                {company?.ownerName && <p className="text-muted-foreground">{company.ownerName}</p>}
                {company?.address && <p className="text-muted-foreground">{company.address}</p>}
                {company?.email && <p className="text-muted-foreground">{company.email}</p>}
              </div>
            </div>
          </div>

          {/* Equipment details */}
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
                  <p className="text-xs text-muted-foreground mb-1">Make/Model</p>
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
          <div className="px-8 py-6 text-sm space-y-4 text-foreground/90 leading-relaxed">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Terms & Conditions</h3>

            <div>
              <p className="font-semibold mb-1">1. RENTAL TERM</p>
              <p>This Agreement is for a month-to-month trailer rental commencing on the pickup date as agreed upon between Lessor and Lessee. Either party may terminate with thirty (30) days written notice.</p>
            </div>

            <div>
              <p className="font-semibold mb-1">2. RENTAL RATE & PAYMENT</p>
              <p>Lessee agrees to pay a monthly rental rate of <strong>${(rental.monthlyRate / 100).toLocaleString()}</strong> per month, due on the 1st of each month. A <strong>two-month security deposit of ${(depositAmount / 100).toLocaleString()}</strong> is required prior to pickup and is fully refundable upon return of equipment in satisfactory condition.</p>
            </div>

            <div>
              <p className="font-semibold mb-1">3. NO MILEAGE FEES</p>
              <p>There are NO mileage fees, NO per-mile charges, and NO hidden fees. The monthly rate stated above is the complete and total rental charge, subject only to engine hour charges if applicable (reefer units only).</p>
            </div>

            <div>
              <p className="font-semibold mb-1">4. INSURANCE</p>
              <p>Lessee shall maintain, at their own expense, comprehensive insurance coverage naming Deluxe Logistics Inc. as an additional insured. A current Certificate of Insurance (COI) must be on file prior to pickup and kept current throughout the rental term. Minimum coverage: $1,000,000 per occurrence.</p>
            </div>

            <div>
              <p className="font-semibold mb-1">5. CARE & MAINTENANCE</p>
              <p>Lessee shall maintain the equipment in good working order and shall not make alterations without prior written consent. Lessee is responsible for routine tire maintenance and shall promptly notify Lessor of any damage or mechanical issues.</p>
            </div>

            <div>
              <p className="font-semibold mb-1">6. AUTHORIZED USE</p>
              <p>Equipment shall be used only for lawful purposes and within the scope of Lessee's operating authority. Lessee shall comply with all federal, state, and local regulations, including FMCSA requirements. Subleasing the equipment without written permission is strictly prohibited.</p>
            </div>

            <div>
              <p className="font-semibold mb-1">7. RETURN OF EQUIPMENT</p>
              <p>Upon termination, Lessee shall return the equipment to Lessor's designated location in the same condition as received, normal wear and tear excepted. Lessee is responsible for all costs to repair damage beyond normal wear and tear.</p>
            </div>

            <div>
              <p className="font-semibold mb-1">8. INDEMNIFICATION</p>
              <p>Lessee shall indemnify, defend, and hold harmless Deluxe Logistics Inc. from any claims, damages, losses, or liabilities arising out of Lessee's use of the equipment.</p>
            </div>

            <div>
              <p className="font-semibold mb-1">9. GOVERNING LAW</p>
              <p>This Agreement shall be governed by the laws of the State of West Virginia. Any disputes shall be resolved in the courts of Berkeley County, West Virginia.</p>
            </div>

            <div>
              <p className="font-semibold mb-1">10. ENTIRE AGREEMENT</p>
              <p>This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements. Modifications must be in writing and signed by both parties.</p>
            </div>
          </div>
        </div>

        {/* Signature section */}
        <div className="bg-card border border-border rounded-2xl p-8">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Electronic Signature
          </h2>

          <p className="text-sm text-muted-foreground mb-6">
            By signing below, you confirm that you have read, understood, and agree to all terms and conditions of this Rental Agreement. This electronic signature is legally binding under the Electronic Signatures in Global and National Commerce Act (ESIGN) and applicable state law.
          </p>

          <div className="space-y-5">
            <div>
              <label className="text-sm font-semibold mb-2 block">
                Full Legal Name <span className="text-red-400">*</span>
              </label>
              <Input
                value={signedByName}
                onChange={e => setSignedByName(e.target.value)}
                placeholder="Type your full legal name exactly as it appears on your ID"
                className="bg-background border-border text-lg font-medium"
                style={{ fontFamily: "Georgia, serif" }}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                This serves as your electronic signature. Type your name exactly as it appears on your driver's license.
              </p>
            </div>

            <div className="flex items-start gap-3 bg-muted/40 rounded-lg p-4">
              <input
                type="checkbox"
                id="agree"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
              />
              <label htmlFor="agree" className="text-sm cursor-pointer leading-relaxed">
                I, <strong>{signedByName || "[your name]"}</strong>, representing <strong>{company?.name ?? "my company"}</strong>, confirm that I have read and agree to all terms of this Rental Agreement. I understand that this constitutes a legally binding electronic signature.
              </label>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="w-4 h-4" />
              <span>Date of signing: <strong className="text-foreground">{today}</strong></span>
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 text-base gap-2"
              onClick={() => signMut.mutate()}
              disabled={
                !signedByName.trim() ||
                signedByName.trim().split(" ").length < 2 ||
                !agreed ||
                signMut.isPending
              }
            >
              {signMut.isPending ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Submitting Signature…</>
              ) : (
                <><CheckCircle className="w-5 h-5" /> Sign Agreement</>
              )}
            </Button>

            {!agreed && signedByName.trim() && (
              <p className="text-xs text-amber-400 text-center">Please check the agreement box to continue.</p>
            )}
            {agreed && signedByName.trim().split(" ").length < 2 && (
              <p className="text-xs text-amber-400 text-center">Please enter your full name (first and last).</p>
            )}

            <p className="text-xs text-center text-muted-foreground">
              Your electronic signature is secured and recorded with your IP address and timestamp.
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
