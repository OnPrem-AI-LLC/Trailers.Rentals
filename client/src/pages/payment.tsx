import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, serverMessage } from "@/lib/queryClient";
import { ShieldCheck, Lock, ChevronLeft, CheckCircle, Truck, AlertTriangle } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Rental } from "@shared/schema";
import { RENEWAL_TERMS_VERSION, renewalTerms } from "@shared/renewal";
import { SERVICE_PLAN } from "@shared/pricing";

// ── Types ────────────────────────────────────────────────────────────────────

interface IntentData {
  clientSecret: string;
  amount: number;
  trailerLabel: string;
  monthlyRate: number;
  servicePlanMonthly?: number;
}

// ── Shared pieces of the checkout layout ────────────────────────────────────

// Paying the deposit is what enrols the renter in automatic monthly billing
// (the server starts the subscription when the deposit settles), so the
// renewal terms and the consent checkbox sit directly above the Pay button,
// at normal size and colour, and the button stays disabled until ticked.
function RenewalConsentBox({
  monthlyRate,
  servicePlanMonthly = 0,
  agreed,
  onAgreedChange,
}: {
  monthlyRate: number;
  servicePlanMonthly?: number;
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
}) {
  const checkboxId = "deposit-renewal-consent";
  return (
    <div className="border border-border rounded-xl p-4 space-y-3 text-sm text-foreground">
      <p className="leading-relaxed">
        <span className="font-bold">Automatic monthly billing.</span> {renewalTerms(monthlyRate, servicePlanMonthly)}
      </p>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={checkboxId}
          checked={agreed}
          onCheckedChange={v => onAgreedChange(v === true)}
          className="mt-0.5"
        />
        <label htmlFor={checkboxId} className="leading-snug cursor-pointer">
          I agree to these automatic renewal terms
        </label>
      </div>
    </div>
  );
}

function DepositSummary({ monthly, servicePlan = 0, depositTotal }: { monthly: number; servicePlan?: number; depositTotal: number }) {
  return (
    <div className="bg-secondary/40 border border-border rounded-xl p-4 space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">First month's rent</span>
        <span>${(monthly / 100).toLocaleString()}</span>
      </div>
      {servicePlan > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{SERVICE_PLAN.name}, first month</span>
          <span>${(servicePlan / 100).toLocaleString()}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Security deposit (1 month)</span>
        <span>${(monthly / 100).toLocaleString()}</span>
      </div>
      <div className="border-t border-border my-2 pt-2 flex justify-between font-bold">
        <span>Total due today</span>
        <span className="text-primary">${(depositTotal / 100).toLocaleString()}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Security deposit is fully refundable at lease end. No mileage fees. Reefer hours included. No hidden charges.
      </p>
    </div>
  );
}

function PayButton({ depositTotal, disabled, processing }: { depositTotal: number; disabled: boolean; processing?: boolean }) {
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full bg-primary hover:bg-primary/90 text-white font-bold gap-2"
      disabled={disabled}
    >
      <Lock className="w-4 h-4" />
      {processing ? "Processing payment…" : `Pay $${(depositTotal / 100).toLocaleString()} securely`}
    </Button>
  );
}

function TrustLine() {
  return (
    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> SSL encrypted</span>
      <span>·</span>
      <span>Powered by Stripe</span>
      <span>·</span>
      <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> PCI compliant</span>
    </div>
  );
}

// ── Pre-consent layout ──────────────────────────────────────────────────────

// The PaymentIntent cannot be created until the renter has agreed to the
// renewal terms, and Stripe's PaymentElement cannot mount without one, so
// until then the same layout is shown with the card slot explained and the
// Pay button disabled. The server computes the deposit as two months' rent.
function PreConsentForm({
  monthlyRate,
  servicePlanMonthly,
  agreed,
  onAgreedChange,
  preparing,
}: {
  monthlyRate: number;
  servicePlanMonthly: number;
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
  preparing: boolean;
}) {
  const depositTotal = monthlyRate * 2 + servicePlanMonthly;
  return (
    <form onSubmit={e => e.preventDefault()} className="space-y-6">
      <DepositSummary monthly={monthlyRate} servicePlan={servicePlanMonthly} depositTotal={depositTotal} />

      <div className="bg-background border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Card Details</p>
        {preparing ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : (
          <p className="text-sm text-muted-foreground">
            Card details load after you agree to the automatic renewal terms below.
          </p>
        )}
      </div>

      <RenewalConsentBox monthlyRate={monthlyRate} servicePlanMonthly={servicePlanMonthly} agreed={agreed} onAgreedChange={onAgreedChange} />

      <PayButton depositTotal={depositTotal} disabled />
      <TrustLine />
    </form>
  );
}

// ── Stripe checkout form ────────────────────────────────────────────────────

function CheckoutForm({
  rentalId,
  intentData,
  agreed,
  onAgreedChange,
  onSuccess,
}: {
  rentalId: string;
  intentData: IntentData;
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !agreed) return;
    setIsProcessing(true);
    setErrorMsg(null);

    // Confirm the payment using Stripe.js
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + "/dashboard?payment=success" },
      redirect: "if_required",
    });

    if (error) {
      setErrorMsg(error.message ?? "Payment failed. Please check your card details.");
      setIsProcessing(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      // Notify our backend to activate the rental
      try {
        const res = await apiRequest("POST", "/api/stripe/payment-succeeded", {
          rentalId,
          paymentIntentId: paymentIntent.id,
        });
        if (!res.ok) {
          const data = await res.json() as { message: string };
          throw new Error(data.message);
        }
        onSuccess();
      } catch (err: unknown) {
        // Payment succeeded in Stripe, but activation call failed — show partial success
        toast({
          title: "Payment received!",
          description: "Your deposit was processed. Contact us if your rental doesn't activate shortly.",
        });
        onSuccess();
      }
    } else {
      setErrorMsg("Payment could not be completed. Please try again.");
      setIsProcessing(false);
    }
  };

  const depositTotal = intentData.amount;
  const monthly = intentData.monthlyRate;
  const plan = intentData.servicePlanMonthly ?? 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <DepositSummary monthly={monthly} servicePlan={plan} depositTotal={depositTotal} />

      {/* Stripe card element */}
      <div className="bg-background border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Card Details</p>
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-900 rounded-lg text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      <RenewalConsentBox monthlyRate={monthly} servicePlanMonthly={plan} agreed={agreed} onAgreedChange={onAgreedChange} />

      <PayButton
        depositTotal={depositTotal}
        disabled={isProcessing || !stripe || !elements || !agreed}
        processing={isProcessing}
      />
      <TrustLine />
    </form>
  );
}

// ── Main payment page ────────────────────────────────────────────────────────

export default function PaymentPage() {
  const { rentalId } = useParams<{ rentalId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [intentData, setIntentData] = useState<IntentData | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Consent to the automatic renewal terms. Lives here because it gates the
  // PaymentIntent request and is also the Pay button's enable condition.
  const [agreed, setAgreed] = useState(false);
  // One create-deposit-intent request at a time: tick / untick / tick before
  // the first response would otherwise create a second PaymentIntent.
  const creatingIntent = useRef(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/login");
    else if (user.role === "admin") navigate("/admin");
  }, [user, authLoading, navigate]);

  // Load Stripe publishable key
  const { data: configData } = useQuery<{ publishableKey: string }>({
    queryKey: ["/api/stripe/config"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/config", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load Stripe config");
      return res.json() as Promise<{ publishableKey: string }>;
    },
    enabled: !!user,
  });

  // Load rental info
  const { data: rental } = useQuery<Rental>({
    queryKey: ["/api/rentals", rentalId, "payment-status"],
    queryFn: async () => {
      const res = await fetch(`/api/rentals/${rentalId}/payment-status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load rental");
      return res.json() as Promise<Rental>;
    },
    enabled: !!user && !!rentalId,
  });

  // Initialize Stripe
  useEffect(() => {
    if (configData?.publishableKey) {
      setStripePromise(loadStripe(configData.publishableKey));
    }
  }, [configData]);

  // Create PaymentIntent once the renter has agreed to the renewal terms
  // (only once — guard prevents duplicate creation if rental data re-fetches
  // or the checkbox is toggled). The consent and terms version travel with
  // the request so the server records them before the intent exists.
  useEffect(() => {
    if (!stripePromise || !rentalId || !user) return;
    if (intentData) return; // already have a live PaymentIntent, don't create another
    if (rental && rental.depositPaid) {
      setSuccess(true);
      return;
    }
    if (rental && rental.status !== "pending_payment") {
      setIntentError(`Rental is not awaiting payment (status: ${rental.status})`);
      return;
    }
    if (!rental) return; // wait until rental data loads before creating PI
    if (!rental.monthlyRate || rental.monthlyRate <= 0) {
      // Same check the server makes; surfaced here because the terms box needs the rate
      setIntentError("Monthly rate not set on this rental. Contact us before paying.");
      return;
    }
    if (!agreed) return; // the server refuses to create an intent without consent
    if (creatingIntent.current) return;

    creatingIntent.current = true;
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/stripe/create-deposit-intent", {
          rentalId,
          renewalConsent: true,
          renewalTermsVersion: RENEWAL_TERMS_VERSION,
        });
        const data = await res.json() as IntentData;
        setIntentData(data);
      } catch (err) {
        // apiRequest throws on every non-2xx; the server's own message
        // ("Renewal terms changed; reload and review them", "Deposit already
        // paid", ...) is what the renter needs to see.
        setIntentError(serverMessage(err, "Failed to initialize payment. Please refresh the page."));
      } finally {
        creatingIntent.current = false;
      }
    })();
  }, [stripePromise, rentalId, user, rental, intentData, agreed]);

  function handleSuccess() {
    setSuccess(true);
    // The dashboard caches under this key with staleTime Infinity; without the
    // invalidation it would still show "Pay Security Deposit" after paying.
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
    toast({ title: "Payment successful!", description: "Your security deposit has been received and your rental is now active." });
    setTimeout(() => navigate("/dashboard"), 3000);
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  const monthlyRate = rental?.monthlyRate ?? 0;
  const servicePlanMonthly = rental?.servicePlanMonthly ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="max-w-lg mx-auto w-full px-4 py-12">
        {/* Back link */}
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
          onClick={() => navigate("/dashboard")}
        >
          <ChevronLeft className="w-4 h-4" /> Back to dashboard
        </button>

        {/* Success state */}
        {success ? (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h1 className="text-2xl font-black mb-2">Payment Received!</h1>
            <p className="text-muted-foreground mb-6">
              Your security deposit has been processed and your rental is now active. You'll receive a confirmation email shortly.
            </p>
            <Button
              className="bg-primary hover:bg-primary/90 text-white"
              onClick={() => navigate("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold uppercase tracking-wider text-primary">Security Deposit</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight">
                {intentData ? intentData.trailerLabel : "Trailer Rental"}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                2-month security deposit required to activate your rental
              </p>
            </div>

            {/* Trust badges */}
            <div className="flex gap-3 mb-6">
              {[
                { icon: ShieldCheck, text: "No mileage fees" },
                { icon: Lock, text: "Secure payment" },
                { icon: CheckCircle, text: "Fully refundable deposit" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/40 border border-border rounded-lg px-3 py-2">
                  <Icon className="w-3 h-3 text-primary flex-shrink-0" />
                  {text}
                </div>
              ))}
            </div>

            {/* Error state */}
            {intentError ? (
              <div className="bg-red-950/40 border border-red-900 rounded-xl p-6 text-center">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                <p className="text-red-300 font-medium">{intentError}</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate("/dashboard")}
                >
                  Return to Dashboard
                </Button>
              </div>
            ) : !stripePromise || !rental ? (
              <div className="space-y-4">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
              </div>
            ) : !intentData ? (
              <PreConsentForm
                monthlyRate={monthlyRate}
                servicePlanMonthly={servicePlanMonthly}
                agreed={agreed}
                onAgreedChange={setAgreed}
                preparing={agreed}
              />
            ) : (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: intentData.clientSecret,
                  appearance: {
                    theme: "night",
                    variables: {
                      colorPrimary: "#e63946",
                      colorBackground: "#0f0608",
                      colorText: "#f8fafc",
                      colorDanger: "#ef4444",
                      fontFamily: "system-ui, sans-serif",
                      borderRadius: "8px",
                    },
                  },
                }}
              >
                <CheckoutForm
                  rentalId={rentalId!}
                  intentData={intentData}
                  agreed={agreed}
                  onAgreedChange={setAgreed}
                  onSuccess={handleSuccess}
                />
              </Elements>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
