import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2, AlertTriangle, Lock, CreditCard, User } from "lucide-react";
import { COMPANY } from "@shared/constants";

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
  driverLicenseNumber: z.string().min(1, "Driver's license number is required"),
  ageConfirmed: z.boolean().refine(v => v === true, { message: "You must confirm you are 18 or older" }),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

// apiRequest throws "<status>: <body>"; pull the server's own message out of the JSON body.
function serverMessage(err: Error, fallback: string): string {
  try {
    const body = JSON.parse(err.message.replace(/^\d{3}:\s*/, "")) as {
      message?: string;
      errors?: { message?: string }[];
    };
    return body.errors?.[0]?.message || body.message || fallback;
  } catch {
    return err.message || fallback;
  }
}

interface InviteInfo {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
}

export default function Register() {
  const { inviteToken } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (user?.role === "renter") navigate("/dashboard");
    else if (user?.role === "admin") navigate("/admin");
  }, [user, navigate]);

  const { data: inviteInfo, isLoading: inviteLoading, error: inviteError } = useQuery<InviteInfo>({
    queryKey: ["/api/invite", inviteToken],
    queryFn: async () => {
      const res = await fetch(`/api/invite/${inviteToken}`);
      if (!res.ok) {
        const body = await res.json() as { message: string };
        throw new Error(body.message);
      }
      return res.json() as Promise<InviteInfo>;
    },
    enabled: !!inviteToken,
    retry: false,
  });

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", password: "", confirmPassword: "", driverLicenseNumber: "", ageConfirmed: false },
  });
  const ageConfirmed = form.watch("ageConfirmed");

  useEffect(() => {
    if (inviteInfo) {
      form.setValue("firstName", inviteInfo.firstName);
      form.setValue("lastName", inviteInfo.lastName);
    }
  }, [inviteInfo, form]);

  const registerMut = useMutation({
    mutationFn: (data: RegisterForm) =>
      apiRequest("POST", "/api/auth/register-invite", {
        inviteToken,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        driverLicenseNumber: data.driverLicenseNumber,
        ageConfirmed: true,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setDone(true);
      setTimeout(() => navigate("/dashboard"), 1500);
    },
    onError: (err: Error) => {
      toast({ title: "Registration failed", description: serverMessage(err, "Please try again."), variant: "destructive" });
    },
  });

  if (inviteLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (inviteError || !inviteInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-card border border-red-800 rounded-2xl p-8">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-black mb-2 text-red-400">Invalid Invite</h1>
            <p className="text-muted-foreground mb-6">
              {inviteError instanceof Error ? inviteError.message : "This invite link is invalid or has expired."}
            </p>
            <p className="text-sm text-muted-foreground">
              Please contact <a href={`mailto:${COMPANY.email}`} className="text-primary hover:underline">{COMPANY.email}</a> for assistance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-card border border-green-800 rounded-2xl p-10">
            <CheckCircle className="w-14 h-14 text-green-400 mx-auto mb-4" />
            <h1 className="text-2xl font-black mb-2 text-green-400">Account Created!</h1>
            <p className="text-muted-foreground">Redirecting to your dashboard…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center">
              <span className="text-white font-black text-xs">DL</span>
            </div>
            <span className="font-black text-lg tracking-tight">DELUXE LOGISTICS</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Create Your Account</h1>
          <p className="text-muted-foreground mt-2">
            Welcome, <strong>{inviteInfo.companyName}</strong>! Complete registration to access your renter portal.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8">
          {/* Email (read-only) */}
          <div className="mb-5">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Account Email</Label>
            <Input
              value={inviteInfo.email}
              readOnly
              className="bg-muted border-border text-muted-foreground cursor-not-allowed"
            />
          </div>

          <form onSubmit={form.handleSubmit(d => registerMut.mutate(d))} className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">First Name</Label>
                <Input
                  {...form.register("firstName")}
                  placeholder="John"
                  className="bg-background border-border"
                />
                {form.formState.errors.firstName && (
                  <p className="text-xs text-red-400 mt-1">{form.formState.errors.firstName.message}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Last Name</Label>
                <Input
                  {...form.register("lastName")}
                  placeholder="Smith"
                  className="bg-background border-border"
                />
                {form.formState.errors.lastName && (
                  <p className="text-xs text-red-400 mt-1">{form.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Password
              </Label>
              <Input
                {...form.register("password")}
                type="password"
                placeholder="Minimum 8 characters"
                className="bg-background border-border"
              />
              {form.formState.errors.password && (
                <p className="text-xs text-red-400 mt-1">{form.formState.errors.password.message}</p>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Confirm Password
              </Label>
              <Input
                {...form.register("confirmPassword")}
                type="password"
                placeholder="Repeat password"
                className="bg-background border-border"
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-red-400 mt-1">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Driver's License */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <CreditCard className="w-3 h-3" /> Driver's License Number
              </Label>
              <Input
                {...form.register("driverLicenseNumber")}
                placeholder="e.g. WV123456789"
                className="bg-background border-border font-mono"
              />
              {form.formState.errors.driverLicenseNumber && (
                <p className="text-xs text-red-400 mt-1">{form.formState.errors.driverLicenseNumber.message}</p>
              )}
            </div>

            {/* Required docs note */}
            <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-3 text-sm text-blue-300">
              <p className="font-semibold mb-1">Documents required after registration:</p>
              <ul className="space-y-0.5 text-blue-400 text-xs list-disc list-inside">
                <li>Certificate of Insurance (COI) — naming Deluxe Logistics Inc.</li>
                <li>Certificate of Authority</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">You can upload these from your dashboard.</p>
            </div>

            {/* Age attestation */}
            <div>
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="ageConfirmed"
                  checked={ageConfirmed}
                  onCheckedChange={v => form.setValue("ageConfirmed", v === true, { shouldValidate: true })}
                  className="mt-0.5"
                />
                <Label htmlFor="ageConfirmed" className="text-sm font-normal leading-snug cursor-pointer">
                  I confirm that I am 18 years of age or older
                </Label>
              </div>
              {form.formState.errors.ageConfirmed && (
                <p className="text-xs text-red-400 mt-1">{form.formState.errors.ageConfirmed.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 gap-2"
              disabled={registerMut.isPending || !ageConfirmed}
            >
              {registerMut.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account…</>
              ) : (
                <><User className="w-4 h-4" /> Create Account & Go to Dashboard</>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
