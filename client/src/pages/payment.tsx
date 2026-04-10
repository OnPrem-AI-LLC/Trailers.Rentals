import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ShieldCheck, Lock, ChevronLeft, CheckCircle, Truck, AlertTriangle } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Rental } from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────────

interface IntentData {
  clientSecret: string;
  amount: number;
  trailerLabel: string;
  monthlyRate: number;
}

// ── Stripe checkout form ────────────────────────────────────────────────────

function CheckoutForm({
  rentalId,
  intentData,
  onSuccess,
}: {
  rentalId: string;
  intentData: IntentData;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Summary */}
      <div className="bg-secondary/40 border border-border rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">First month's rent</span>
          <span>${(monthly / 100).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Security deposit (1 month)</span>
          <span>${(monthly / 100).toLocaleString()}</span>
        </div>
        <div className="border-t border-border my-2 pt-2 flex justify-between font-bold">
          <span>Total due today</span>
          <span className="text-primary">${(depositTotal / 100).toLocaleString()}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Security deposit is fully refundable at lease end. No mileage fees. No hidden charges.
        </p>
      </div>

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

      <Button
        type="submit"
        size="lg"
        className="w-full bg-primary hover:bg-primary/90 text-white font-bold gap-2"
        disabled={isProcessing || !stripe || !elements}
      >
        <Lock className="w-4 h-4" />
        {isProcessing ? "Processing payment…" : `Pay $${(depositTotal / 100).toLocaleString()} securely`}
      </Button>

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> SSL encrypted</span>
        <span>·</span>
        <span>Powered by Stripe</span>
        <span>·</span>
        <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> PCI compliant</span>
      </div>
    </form>
  );
}

// ── Main payment page ────────────────────────────────────────────────────────

export default function PaymentPage() {
  const { rentalId } = useParams<{ rentalId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [intentData, setIntentData] = useState<IntentData | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  // Create PaymentIntent
  useEffect(() => {
    if (!stripePromise || !rentalId || !user) return;
    if (rental && rental.depositPaid) {
      setSuccess(true);
      return;
    }
    if (rental && rental.status !== "pending_payment") {
      setIntentError(`Rental is not awaiting payment (status: ${rental.status})`);
      return;
    }

    (async () => {
      try {
        const res = await apiRequest("POST", "/api/stripe/create-deposit-intent", { rentalId });
        if (!res.ok) {
          const err = await res.json() as { message: string };
          setIntentError(err.message);
          return;
        }
        const data = await res.json() as IntentData;
        setIntentData(data);
      } catch {
        setIntentError("Failed to initialize payment. Please refresh the page.");
      }
    })();
  }, [stripePromise, rentalId, user, rental]);

  function handleSuccess() {
    setSuccess(true);
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
            ) : !stripePromise || !intentData ? (
              <div className="space-y-4">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
              </div>
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
