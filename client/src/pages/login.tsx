import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import logoPath from "@assets/Deluxe Logo_1758417985453.jpg";
import { Lock, Mail, ArrowLeft } from "lucide-react";

export default function Login() {
  const { login, user } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Parse optional redirect query param (e.g. ?redirect=/dashboard/engine-hours/123)
  const redirectTo = new URLSearchParams(location.split("?")[1] ?? "").get("redirect");

  // Redirect if already logged in
  if (user) {
    navigate(redirectTo && redirectTo.startsWith("/") ? redirectTo : (user.role === "admin" ? "/admin" : "/dashboard"));
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      // login redirects via query cache update — navigate after
      const updated = await fetch("/api/auth/me", { credentials: "include" });
      const me = await updated.json();
      const dest = redirectTo && redirectTo.startsWith("/") ? redirectTo : (me.role === "admin" ? "/admin" : "/dashboard");
      navigate(dest);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      toast({
        title: "Sign in failed",
        description: msg.includes("401") ? "Invalid email or password." : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Back link */}
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

          {/* Card */}
          <div className="bg-card border border-border rounded-xl p-8 shadow-xl">
            <div className="mb-6">
              <h1 className="text-2xl font-black tracking-tight">Sign in</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Access your rental account or admin portal
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="pl-9 bg-background border-border"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 bg-background border-border"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </div>

          <div className="mt-4 text-center">
            <a href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Forgot your password?
            </a>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">
            Don't have an account?{" "}
            <a href="mailto:info@deluxelogistics.com" className="text-primary hover:underline">
              Contact us to get started
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
