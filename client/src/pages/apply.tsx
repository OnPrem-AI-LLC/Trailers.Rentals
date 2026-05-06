import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Truck, Thermometer, CheckCircle, AlertCircle, Building2 } from "lucide-react";
import type { TrailerWithPhotos } from "@shared/schema";
import { formatTrailerName } from "@/lib/trailer-utils";
import { useAuth } from "@/hooks/use-auth";
import type { Company } from "@shared/schema";

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
  const { trailerId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState<ApplicationForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  // Fetch existing company for logged-in users who have one on file
  const { data: existingCompany, isLoading: companyLoading } = useQuery<Company>({
    queryKey: ["/api/my/company"],
    queryFn: async () => {
      const res = await fetch("/api/my/company");
      if (!res.ok) throw new Error("No company");
      return res.json();
    },
    enabled: !!user?.companyId,
    retry: false,
  });

  // Pre-fill form from logged-in user's account (fallback for users without a company)
  useEffect(() => {
    if (user && !existingCompany) {
      setForm((prev) => ({
        ...prev,
        email: user.email,
        ownerName: prev.ownerName || `${user.firstName} ${user.lastName}`.trim(),
      }));
    }
  }, [user, existingCompany]);

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

  const [intendedUseError, setIntendedUseError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trailerId) return;
    if (!form.intendedUse) {
      setIntendedUseError("Please select a primary use for the trailer.");
      return;
    }
    setIntendedUseError(null);
    mutation.mutate({ ...form, trailerId });
  };

  if (isLoading || (user?.companyId && companyLoading)) {
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
              <strong>{formatTrailerName(trailer)}</strong>.
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

  // Logged-in users with an existing company skip the form entirely
  if (existingCompany && trailer && !submitted) {
    const submitAsCompany = () => {
      mutation.mutate({
        trailerId: trailerId!,
        companyName: existingCompany.name,
        ownerName: existingCompany.ownerName,
        authorizedUser: existingCompany.authorizedUser ?? "",
        email: existingCompany.email,
        mcNumber: existingCompany.mcNumber ?? "",
        dotNumber: existingCompany.dotNumber ?? "",
        phone: existingCompany.phone,
        intendedUse: "Returning customer",
        intendedUseDetails: "",
      });
    };

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
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
              <div className="font-bold text-foreground">{formatTrailerName(trailer)}</div>
              <div className="text-sm text-muted-foreground">
                {formatPrice(trailer.priceMonthly)}/month · No mileage fees
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-950 text-green-400 flex-shrink-0">
              Available
            </span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-black tracking-tight">Confirm Rental Request</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your company info is already on file. Confirm to submit.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 mb-6 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Company on file</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Company: </span><span className="font-medium">{existingCompany.name}</span></div>
              <div><span className="text-muted-foreground">Owner: </span><span className="font-medium">{existingCompany.ownerName}</span></div>
              <div><span className="text-muted-foreground">Email: </span><span className="font-medium">{existingCompany.email}</span></div>
              <div><span className="text-muted-foreground">Phone: </span><span className="font-medium">{existingCompany.phone}</span></div>
              {existingCompany.dotNumber && (
                <div><span className="text-muted-foreground">DOT: </span><span className="font-medium">{existingCompany.dotNumber}</span></div>
              )}
              {existingCompany.mcNumber && (
                <div><span className="text-muted-foreground">MC: </span><span className="font-medium">{existingCompany.mcNumber}</span></div>
              )}
            </div>
          </div>

          <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground mb-6">
            <strong className="text-foreground">Deposit note:</strong> Upon approval, a security deposit
            equal to 2 months' rent ({formatPrice(trailer.priceMonthly * 2)}) is required — billed as
            first month + deposit. No mileage fees, ever.
          </div>

          <Button
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12"
            onClick={submitAsCompany}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Submitting..." : "Submit Rental Request"}
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-3">
            Application typically reviewed within 24 hours
          </p>
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
              {formatTrailerName(trailer)}
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
                  readOnly={!!user}
                  disabled={!!user}
                />
                {user && (
                  <p className="text-xs text-muted-foreground">
                    Linked to your account. <Link href="/login"><span className="text-primary hover:underline cursor-pointer">Sign out</span></Link> to use a different email.
                  </p>
                )}
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
              <Select
                value={form.intendedUse}
                onValueChange={(val) => { setForm((prev) => ({ ...prev, intendedUse: val })); setIntendedUseError(null); }}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select primary use..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Regional dry freight">Regional dry freight</SelectItem>
                  <SelectItem value="Produce / perishable hauling">Produce / perishable hauling</SelectItem>
                  <SelectItem value="Refrigerated / cold chain">Refrigerated / cold chain</SelectItem>
                  <SelectItem value="Spot loads / brokered freight">Spot loads / brokered freight</SelectItem>
                  <SelectItem value="Retail distribution">Retail distribution</SelectItem>
                  <SelectItem value="Construction / building materials">Construction / building materials</SelectItem>
                  <SelectItem value="Flatbed / heavy haul">Flatbed / heavy haul</SelectItem>
                  <SelectItem value="Intermodal / port operations">Intermodal / port operations</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {intendedUseError && (
                <p className="text-xs text-destructive">{intendedUseError}</p>
              )}
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
