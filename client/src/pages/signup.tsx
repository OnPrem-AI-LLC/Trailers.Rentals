import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoPath from "@assets/Deluxe Logo_1758417985453.jpg";
import { Lock, Mail, User, ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

// apiRequest throws "<status>: <body>"; pull the server's own message out of the JSON body.
function serverMessage(err: Error, fallback: string): string {
  try {
    const body = JSON.parse(err.message.replace(/^\d{3}:\s*/, "")) as {
      message?: string;
      errors?: { message?: string }[];
    };
    return body.errors?.[0]?.message || body.message || fallback;
  } catch {
    return fallback;
  }
}

export default function Signup() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate(user.role === "admin" ? "/admin" : "/dashboard");
    return null;
  }

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (!ageConfirmed) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/signup", {
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        password: form.password,
        ageConfirmed: true,
      });
      const data = await res.json();
      queryClient.setQueryData(["/api/auth/me"], data);
      navigate("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.includes("409")
          ? "An account with this email already exists."
          : err instanceof Error && err.message.startsWith("400:")
            ? serverMessage(err, "Please check the form and try again.")
            : "Something went wrong. Please try again.";
      toast({ title: "Sign up failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to site
          </Button>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <img src={logoPath} alt="Deluxe Logistics" className="w-12 h-12 object-contain" />
            <div className="text-left">
              <div className="text-xl font-black tracking-widest">DELUXE</div>
              <div className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground -mt-0.5">
                LOGISTICS INC.
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-8 shadow-xl">
            <div className="mb-6">
              <h1 className="text-2xl font-black tracking-tight">Create account</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Set up your renter account to manage your trailers
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-sm font-medium">First name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="firstName"
                      value={form.firstName}
                      onChange={handleChange("firstName")}
                      placeholder="Jane"
                      className="pl-9 bg-background border-border"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-sm font-medium">Last name</Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={handleChange("lastName")}
                    placeholder="Smith"
                    className="bg-background border-border"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={form.username}
                    onChange={handleChange("username")}
                    placeholder="you@company.com"
                    className="pl-9 bg-background border-border"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange("password")}
                    placeholder="Min. 8 characters"
                    className="pl-9 bg-background border-border"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={form.confirmPassword}
                    onChange={handleChange("confirmPassword")}
                    placeholder="Repeat password"
                    className="pl-9 bg-background border-border"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <Checkbox
                  id="ageConfirmed"
                  checked={ageConfirmed}
                  onCheckedChange={(v) => setAgeConfirmed(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="ageConfirmed" className="text-sm font-normal leading-snug cursor-pointer">
                  I confirm that I am 18 years of age or older
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11"
                disabled={loading || !ageConfirmed}
              >
                {loading ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link href="/login">
              <span className="text-primary hover:underline cursor-pointer">Sign in</span>
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
