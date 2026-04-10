import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Truck, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PickupInfo {
  rentalId: string;
  alreadyConfirmed: boolean;
  confirmedAt: string | null;
  trailerVin: string;
  trailerType: string;
  trailerMake: string;
  companyName: string;
  startDate: string | null;
}

export default function PickupConfirmPage() {
  const { token } = useParams<{ token: string }>();
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<PickupInfo>({
    queryKey: ["/api/pickup", token],
    queryFn: async () => {
      const res = await fetch(`/api/pickup/${token}`);
      if (!res.ok) throw new Error("Invalid link");
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (data?.alreadyConfirmed) {
      setConfirmed(true);
      setConfirmedAt(data.confirmedAt ?? null);
    }
  }, [data]);

  const confirmMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pickup/${token}/confirm`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to confirm pickup");
      return res.json() as Promise<{ success: boolean; confirmedAt: string }>;
    },
    onSuccess: (result) => {
      setConfirmed(true);
      setConfirmedAt(result.confirmedAt);
    },
  });

  const trailerLabel = data
    ? [data.trailerMake, data.trailerType?.replace("_", " ")].filter(Boolean).join(" ").trim() || "Trailer"
    : "Trailer";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-black text-xl tracking-tight">DELUXE LOGISTICS</span>
          </div>
          <p className="text-muted-foreground text-sm">Trailer Pickup Confirmation</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading pickup details…</p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="w-10 h-10 text-destructive" />
              <p className="font-semibold">Invalid or expired pickup link</p>
              <p className="text-sm text-muted-foreground">This QR code is no longer valid. Please contact Deluxe Logistics.</p>
            </div>
          )}

          {data && !confirmed && (
            <>
              <div className="mb-6">
                <div className="inline-block bg-amber-950 border border-amber-800 text-amber-400 text-xs font-bold px-3 py-1 rounded-full mb-4">
                  AWAITING PICKUP CONFIRMATION
                </div>
                <h1 className="text-2xl font-black mb-1">Ready to pick up?</h1>
                <p className="text-muted-foreground text-sm">
                  Confirm you have received the trailer below.
                </p>
              </div>

              <div className="bg-secondary/30 border border-border rounded-xl p-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Trailer</span>
                  <span className="font-semibold capitalize">{trailerLabel}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VIN</span>
                  <span className="font-mono font-semibold">{data.trailerVin}</span>
                </div>
                {data.companyName && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Renter</span>
                    <span className="font-semibold">{data.companyName}</span>
                  </div>
                )}
                {data.startDate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Start Date</span>
                    <span className="font-semibold">{new Date(data.startDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              <Button
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12 text-base"
                disabled={confirmMut.isPending}
                onClick={() => confirmMut.mutate()}
              >
                {confirmMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Confirming…</>
                ) : (
                  "Confirm Pickup"
                )}
              </Button>

              {confirmMut.isError && (
                <p className="text-destructive text-xs text-center mt-3">
                  Failed to confirm. Please try again or contact Deluxe Logistics.
                </p>
              )}

              <p className="text-xs text-muted-foreground text-center mt-4">
                By tapping "Confirm Pickup" you acknowledge physical receipt of this trailer.
              </p>
            </>
          )}

          {confirmed && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-16 h-16 bg-green-950 border border-green-800 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-green-400 mb-1">Pickup Confirmed!</h2>
                <p className="text-muted-foreground text-sm">
                  Your pickup has been recorded. Deluxe Logistics has been notified.
                </p>
                {confirmedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Confirmed at {new Date(confirmedAt).toLocaleString()}
                  </p>
                )}
              </div>
              {data && (
                <div className="bg-secondary/30 border border-border rounded-xl p-4 w-full text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trailer</span>
                    <span className="font-semibold capitalize">{trailerLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VIN</span>
                    <span className="font-mono font-semibold">{data.trailerVin}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} Deluxe Logistics Inc. · No Mileage Fees · No BS Fees
        </p>
      </div>
    </div>
  );
}
