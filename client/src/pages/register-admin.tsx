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
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2, AlertTriangle, Lock, ShieldCheck } from "lucide-react";

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type Form = z.infer<typeof schema>;

interface InviteInfo {
  email: string;
  firstName: string;
  lastName: string;
}

export default function RegisterAdmin() {
  const { inviteToken } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (user?.role === "admin") navigate("/admin");
  }, [user, navigate]);

  const { data: inviteInfo, isLoading, error } = useQuery<InviteInfo>({
    queryKey: ["/api/admin-invite", inviteToken],
    queryFn: async () => {
      const res = await fetch(`/api/admin-invite/${inviteToken}`);
      if (!res.ok) {
        const body = await res.json() as { message: string };
        throw new Error(body.message);
      }
      return res.json() as Promise<InviteInfo>;
    },
    enabled: !!inviteToken,
    retry: false,
  });

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (inviteInfo) {
      form.setValue("firstName", inviteInfo.firstName ?? "");
      form.setValue("lastName", inviteInfo.lastName ?? "");
    }
  }, [inviteInfo, form]);

  const activate = useMutation({
    mutationFn: (data: Form) =>
      apiRequest("POST", "/api/auth/admin-activate", {
        inviteToken,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setDone(true);
      setTimeout(() => navigate("/admin"), 1500);
    },
    onError: (err: Error) => {
      toast({ title: "Activation failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !inviteInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-card border border-red-800 rounded-2xl p-8">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-black mb-2 text-red-400">Invalid Invite</h1>
            <p className="text-muted-foreground mb-6">
              {error instanceof Error ? error.message : "This invite link is invalid or has expired."}
            </p>
            <p className="text-sm text-muted-foreground">
              Contact <a href="mailto:info@deluxelogistics.com" className="text-primary hover:underline">info@deluxelogistics.com</a> for a new link.
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
            <h1 className="text-2xl font-black mb-2 text-green-400">Admin Account Activated!</h1>
            <p className="text-muted-foreground">Redirecting to the admin portal…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center">
              <span className="text-white font-black text-xs">DL</span>
            </div>
            <span className="font-black text-lg tracking-tight">DELUXE LOGISTICS</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Admin Account Setup</h1>
          <p className="text-muted-foreground mt-2">
            Welcome to the team. Set your password to activate your admin account.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8">
          <div className="flex items-center gap-2 bg-blue-950/30 border border-blue-800 rounded-lg px-4 py-3 mb-6 text-sm text-blue-300">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Internal admin portal — Deluxe Logistics staff only</span>
          </div>

          <div className="mb-5">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Account Email</Label>
            <Input
              value={inviteInfo.email}
              readOnly
              className="bg-muted border-border text-muted-foreground cursor-not-allowed"
            />
          </div>

          <form onSubmit={form.handleSubmit(d => activate.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">First Name</Label>
                <Input {...form.register("firstName")} placeholder="Jane" className="bg-background border-border" />
                {form.formState.errors.firstName && (
                  <p className="text-xs text-red-400 mt-1">{form.formState.errors.firstName.message}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Last Name</Label>
                <Input {...form.register("lastName")} placeholder="Doe" className="bg-background border-border" />
                {form.formState.errors.lastName && (
                  <p className="text-xs text-red-400 mt-1">{form.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>

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

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 gap-2"
              disabled={activate.isPending}
            >
              {activate.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Activating…</>
              ) : (
                <><ShieldCheck className="w-4 h-4" /> Activate Admin Account</>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
