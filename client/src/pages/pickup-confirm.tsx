import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CheckCircle2, Truck, AlertCircle, Loader2, Camera, Upload, X, ChevronRight, ChevronLeft as ChevronLeftIcon, ImageIcon, LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

interface PhotoItem {
  id: string;
  url: string;
  label: string | null;
}

interface PickupInfo {
  rentalId: string;
  alreadyConfirmed: boolean;
  confirmedAt: string | null;
  trailerVin: string;
  trailerType: string;
  trailerMake: string;
  trailerYear: string;
  companyName: string;
  startDate: string | null;
  requiresLogin: boolean;
  isAuthorized: boolean;
  existingPhotos: PhotoItem[];
}

const STEP_LABELS = ["Confirm Trailer", "Pre-Inspection Photos", "Complete Check-in"];

export default function PickupConfirmPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<PickupInfo>({
    queryKey: ["/api/pickup", token, user?.id ?? "anon"],
    queryFn: async () => {
      const res = await fetch(`/api/pickup/${token}`);
      if (!res.ok) throw new Error("Invalid link");
      return res.json();
    },
    enabled: !!token,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (data?.alreadyConfirmed) {
      setConfirmed(true);
      setConfirmedAt(data.confirmedAt ?? null);
    }
    if (data?.existingPhotos) {
      setPhotos(data.existingPhotos);
    }
  }, [data]);

  const uploadPhoto = async (file: File, label?: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      if (label) formData.append("label", label);
      const res = await fetch(`/api/pickup/${token}/photos`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      const photo = await res.json() as PhotoItem;
      setPhotos(prev => [...prev, photo]);
    } finally {
      setUploading(false);
    }
  };

  const confirmMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pickup/${token}/confirm`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to confirm pickup");
      }
      return res.json() as Promise<{ success: boolean; confirmedAt: string }>;
    },
    onSuccess: (result) => {
      setConfirmed(true);
      setConfirmedAt(result.confirmedAt);
    },
  });

  const trailerLabel = data
    ? [data.trailerYear, data.trailerMake, data.trailerType?.replace("_", " ")].filter(Boolean).join(" ").trim() || "Trailer"
    : "Trailer";

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 10 * 1024 * 1024) return;
      uploadPhoto(file);
    });
    e.target.value = "";
  };

  const handleLoginRedirect = () => {
    const redirectPath = `/pickup/${token}`;
    navigate(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-black text-xl tracking-tight">DELUXE LOGISTICS</span>
          </div>
          <p className="text-muted-foreground text-sm">Trailer Check-in</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading check-in details…</p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="w-10 h-10 text-destructive" />
              <p className="font-semibold">Invalid or expired pickup link</p>
              <p className="text-sm text-muted-foreground">This QR code is no longer valid. Please contact Deluxe Logistics.</p>
            </div>
          )}

          {data && data.requiresLogin && !confirmed && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-14 h-14 bg-amber-950 border border-amber-800 rounded-full flex items-center justify-center">
                <LogIn className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <h2 className="text-xl font-black mb-1">Sign In Required</h2>
                <p className="text-muted-foreground text-sm">
                  Please sign in to your renter account to complete the check-in for this trailer.
                </p>
              </div>
              <div className="bg-secondary/30 border border-border rounded-xl p-4 w-full text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trailer</span>
                  <span className="font-semibold capitalize">{trailerLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VIN</span>
                  <span className="font-mono font-semibold">{data.trailerVin}</span>
                </div>
              </div>
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12 text-base"
                onClick={handleLoginRedirect}
              >
                <LogIn className="w-4 h-4 mr-2" /> Sign In to Check In
              </Button>
            </div>
          )}

          {data && !data.requiresLogin && !data.isAuthorized && !confirmed && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="w-10 h-10 text-destructive" />
              <p className="font-semibold">Not Authorized</p>
              <p className="text-sm text-muted-foreground">
                Your account is not associated with this rental. Please sign in with the correct renter account.
              </p>
              <Button variant="outline" onClick={handleLoginRedirect} className="mt-2">
                Switch Account
              </Button>
            </div>
          )}

          {data && !data.requiresLogin && data.isAuthorized && !confirmed && (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-1 mb-6">
                {STEP_LABELS.map((label, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full h-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
                    <span className={`text-[10px] ${i <= step ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Step 0: Confirm trailer details */}
              {step === 0 && (
                <>
                  <div className="mb-5">
                    <div className="inline-block bg-amber-950 border border-amber-800 text-amber-400 text-xs font-bold px-3 py-1 rounded-full mb-3">
                      STEP 1 OF 3
                    </div>
                    <h1 className="text-xl font-black mb-1">Confirm Trailer Details</h1>
                    <p className="text-muted-foreground text-sm">
                      Verify the trailer information below matches the unit you are picking up.
                    </p>
                  </div>

                  <div className="bg-secondary/30 border border-border rounded-xl p-4 mb-5 space-y-2">
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
                        <span className="text-muted-foreground">Rental Start</span>
                        <span className="font-semibold">{new Date(data.startDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11"
                    onClick={() => setStep(1)}
                  >
                    Confirm &amp; Continue <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </>
              )}

              {/* Step 1: Pre-inspection photos */}
              {step === 1 && (
                <>
                  <div className="mb-5">
                    <div className="inline-block bg-amber-950 border border-amber-800 text-amber-400 text-xs font-bold px-3 py-1 rounded-full mb-3">
                      STEP 2 OF 3
                    </div>
                    <h1 className="text-xl font-black mb-1">Pre-Inspection Photos</h1>
                    <p className="text-muted-foreground text-sm">
                      Take or upload at least <strong className="text-foreground">2 photos</strong> of the trailer exterior for the pre-inspection record.
                    </p>
                  </div>

                  {/* Photo grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {photos.map((photo) => (
                      <div key={photo.id} className="relative rounded-xl overflow-hidden border border-border bg-secondary/20 aspect-square">
                        <img src={photo.url} alt={photo.label || "Inspection photo"} className="w-full h-full object-cover" />
                        {photo.label && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[10px] text-white uppercase tracking-wider">
                            {photo.label}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Upload placeholder */}
                    <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-secondary/10 cursor-pointer aspect-square transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleFileSelect}
                        disabled={uploading}
                      />
                      {uploading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      ) : (
                        <>
                          <Camera className="w-6 h-6 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase">Take Photo</span>
                        </>
                      )}
                    </label>

                    {/* Upload from gallery */}
                    <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-secondary/10 cursor-pointer aspect-square transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                        disabled={uploading}
                      />
                      {uploading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase">Upload</span>
                        </>
                      )}
                    </label>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    <span className={`text-sm font-semibold ${photos.length >= 2 ? "text-green-400" : "text-amber-400"}`}>
                      {photos.length} of 2 minimum photos uploaded
                    </span>
                    {photos.length >= 2 && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep(0)} className="flex-1 h-11">
                      <ChevronLeftIcon className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <Button
                      className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold h-11"
                      disabled={photos.length < 2 || uploading}
                      onClick={() => setStep(2)}
                    >
                      Continue <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>

                  {photos.length < 2 && (
                    <p className="text-xs text-muted-foreground text-center mt-3">
                      You need at least 2 photos to proceed.
                    </p>
                  )}
                </>
              )}

              {/* Step 2: Final confirmation */}
              {step === 2 && (
                <>
                  <div className="mb-5">
                    <div className="inline-block bg-green-950 border border-green-800 text-green-400 text-xs font-bold px-3 py-1 rounded-full mb-3">
                      STEP 3 OF 3
                    </div>
                    <h1 className="text-xl font-black mb-1">Complete Check-in</h1>
                    <p className="text-muted-foreground text-sm">
                      Review your details and photos, then confirm pickup.
                    </p>
                  </div>

                  <div className="bg-secondary/30 border border-border rounded-xl p-4 mb-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Trailer</span>
                      <span className="font-semibold capitalize">{trailerLabel}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">VIN</span>
                      <span className="font-mono font-semibold">{data.trailerVin}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Photos</span>
                      <span className="font-semibold text-green-400">{photos.length} uploaded</span>
                    </div>
                  </div>

                  {/* Photo thumbnails */}
                  <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
                    {photos.map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.url}
                        alt="Pre-inspection"
                        className="w-16 h-16 object-cover rounded-lg border border-border flex-shrink-0"
                      />
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-11">
                      <ChevronLeftIcon className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <Button
                      className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold h-11"
                      disabled={confirmMut.isPending}
                      onClick={() => confirmMut.mutate()}
                    >
                      {confirmMut.isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" />Confirming…</>
                      ) : (
                        <>Confirm Pickup</>
                      )}
                    </Button>
                  </div>

                  {confirmMut.isError && (
                    <p className="text-destructive text-xs text-center mt-3">
                      {(confirmMut.error as Error)?.message || "Failed to confirm. Please try again."}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground text-center mt-4">
                    By tapping "Confirm Pickup" you acknowledge physical receipt of this trailer and that the pre-inspection photos are accurate.
                  </p>
                </>
              )}
            </>
          )}

          {confirmed && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-16 h-16 bg-green-950 border border-green-800 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-green-400 mb-1">Check-in Complete!</h2>
                <p className="text-muted-foreground text-sm">
                  Your pickup has been recorded with {photos.length || "your"} pre-inspection photos. Deluxe Logistics has been notified.
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
              {user && (
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => navigate("/dashboard")}
                >
                  Go to Dashboard
                </Button>
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
