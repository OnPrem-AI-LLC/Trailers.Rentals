import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Truck, Thermometer, CheckCircle, AlertCircle } from "lucide-react";
import type { TrailerWithPhotos } from "@shared/schema";

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

interface ApplicationForm {
  companyName: string;
  ownerName: string;
  authorizedUser: string;
  email: string;
  mcNumber: string;
  dotNumber: string;
  phone: string;
  intendedUse: string;
  intendedUseDetails: string;
}

const EMPTY_FORM: ApplicationForm = {
  companyName: "",
  ownerName: "",
  authorizedUser: "",
  email: "",
  mcNumber: "",
  dotNumber: "",
  phone: "",
  intendedUse: "",
  intendedUseDetails: "",
};

export default function Apply() {
  const { id: trailerId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<ApplicationForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  const { data: trailer, isLoading, isError } = useQuery<TrailerWithPhotos>({
    queryKey: ["/api/trailers", trailerId],
    queryFn: async () => {
      const res = await fetch(`/api/trailers/${trailerId}`);
      if (!res.ok) throw new Error("Trailer not found");
      return res.json() as Promise<TrailerWithPhotos>;
    },
    enabled: !!trailerId,
  });

  const mutation = useMutation({
    mutationFn: async (data: ApplicationForm & { trailerId: string }) => {
      const res = await apiRequest("POST", "/api/applications", data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Submission failed" }));
        throw new Error((err as { message: string }).message);
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Submission failed", description: message, variant: "destructive" });
    },
  });

  const handleChange = (field: keyof ApplicationForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trailerId) return;
    mutation.mutate({ ...form, trailerId });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-2xl mx-auto w-full px-4 py-12 space-y-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !trailer) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Trailer not found</h2>
            <Link href="/">
              <Button variant="outline">Back to inventory</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (trailer.status !== "available") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto" />
            <h2 className="text-xl font-bold">Trailer not available</h2>
            <p className="text-muted-foreground text-sm">This trailer is currently unavailable.</p>
            <Link href="/">
              <Button variant="outline">See available trailers</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-5 max-w-md">
            <div className="w-16 h-16 rounded-full bg-green-950 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-black">Application submitted!</h2>
            <p className="text-muted-foreground">
              We've received your application for the{" "}
              <strong>{trailer.make && trailer.model ? `${trailer.make} ${trailer.model}` : trailer.type}</strong>.
              Our team will review it and contact you within 24 hours at{" "}
              <strong>{form.email}</strong>.
            </p>
            <Link href="/">
              <Button className="bg-primary hover:bg-primary/90 text-white">
                Back to inventory
              </Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Back */}
        <Link href={`/trailers/${trailerId}`}>
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 mb-6 -ml-1">
            <ArrowLeft className="w-4 h-4" />
            Back to trailer
          </Button>
        </Link>

        {/* Trailer summary */}
        <div className="bg-card border border-border rounded-xl p-5 mb-8 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            {trailer.type === "reefer" ? (
              <Thermometer className="w-6 h-6 text-primary" />
            ) : (
              <Truck className="w-6 h-6 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-foreground">
              {trailer.make && trailer.model
                ? `${trailer.year || ""} ${trailer.make} ${trailer.model}`.trim()
                : `${trailer.type === "reefer" ? "Refrigerated" : "Dry Van"} Trailer`}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatPrice(trailer.priceMonthly)}/month · No mileage fees
            </div>
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-950 text-green-400 flex-shrink-0">
            Available
          </span>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-black tracking-tight">Rental Application</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Typically reviewed within 24 hours. We'll reach out to your email to confirm.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Company */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
              Company Information
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={handleChange("companyName")}
                  placeholder="ABC Trucking LLC"
                  className="bg-background border-border"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerName">Owner / Officer Name *</Label>
                <Input
                  id="ownerName"
                  value={form.ownerName}
                  onChange={handleChange("ownerName")}
                  placeholder="John Smith"
                  className="bg-background border-border"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="authorizedUser">Authorized User (if different from owner)</Label>
              <Input
                id="authorizedUser"
                value={form.authorizedUser}
                onChange={handleChange("authorizedUser")}
                placeholder="Driver/Manager name"
                className="bg-background border-border"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
              Contact Details
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange("email")}
                  placeholder="john@abctrucking.com"
                  className="bg-background border-border"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange("phone")}
                  placeholder="(555) 000-0000"
                  className="bg-background border-border"
                  required
                />
              </div>
            </div>
          </div>

          {/* DOT/MC */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
              Operating Authority
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dotNumber">DOT Number *</Label>
                <Input
                  id="dotNumber"
                  value={form.dotNumber}
                  onChange={handleChange("dotNumber")}
                  placeholder="1234567"
                  className="bg-background border-border"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcNumber">MC Number (if applicable)</Label>
                <Input
                  id="mcNumber"
                  value={form.mcNumber}
                  onChange={handleChange("mcNumber")}
                  placeholder="MC-000000"
                  className="bg-background border-border"
                />
              </div>
            </div>
          </div>

          {/* Intended Use */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
              Intended Use
            </h2>

            <div className="space-y-1.5">
              <Label htmlFor="intendedUse">Primary Use *</Label>
              <Input
                id="intendedUse"
                value={form.intendedUse}
                onChange={handleChange("intendedUse")}
                placeholder="e.g., Regional dry freight, produce hauling, spot loads"
                className="bg-background border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="intendedUseDetails">Additional Details</Label>
              <Textarea
                id="intendedUseDetails"
                value={form.intendedUseDetails}
                onChange={handleChange("intendedUseDetails")}
                placeholder="Lanes, typical freight type, estimated monthly usage, etc."
                className="bg-background border-border resize-none"
                rows={3}
              />
            </div>
          </div>

          {/* Deposit info */}
          <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground">
            <strong className="text-foreground">Deposit note:</strong> Upon approval, a security deposit
            equal to 2 months' rent ({formatPrice(trailer.priceMonthly * 2)}) is required — billed as
            first month + deposit. No mileage fees, ever.
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Submitting..." : "Submit Application"}
          </Button>
        </form>
      </div>

      <Footer />
    </div>
  );
}
