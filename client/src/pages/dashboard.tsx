import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, FileText, Clock, CircleDollarSign, LogOut } from "lucide-react";
import type { Rental } from "@shared/schema";

interface DashboardData {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    companyId: string | null | undefined;
  };
  rentals: Rental[];
}

export default function Dashboard() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/login");
    else if (user.role === "admin") navigate("/admin");
  }, [user, authLoading, navigate]);

  const { data: dashData, isLoading: dataLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    enabled: !!user && user.role === "renter",
    queryFn: async () => {
      const res = await fetch("/api/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json() as Promise<DashboardData>;
    },
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  const rentals: Rental[] = dashData?.rentals ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              Welcome back, {user.firstName}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{user.email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout().then(() => navigate("/"))}
            className="text-muted-foreground gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>

        {/* Active rentals */}
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-4">Your Rentals</h2>
          {dataLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : rentals.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center">
              <Truck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No active rentals</p>
              <p className="text-sm text-muted-foreground/70 mt-1 mb-5">
                Browse available trailers and submit an application to get started.
              </p>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => navigate("/")}
              >
                Browse Trailers
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {rentals.map((rental) => (
                <div key={rental.id} className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Truck className="w-5 h-5 text-primary" />
                      <div>
                        <div className="font-semibold">Rental #{rental.id.slice(-8)}</div>
                        <div className="text-sm text-muted-foreground capitalize">
                          Status: {rental.status.replace(/_/g, " ")}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">
                        ${(rental.monthlyRate / 100).toLocaleString()}/mo
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {rental.status === "pending_agreement" && (
                      <Button size="sm" className="bg-primary hover:bg-primary/90 text-white gap-2">
                        <FileText className="w-4 h-4" />
                        Sign Agreement
                      </Button>
                    )}
                    {rental.status === "pending_payment" && (
                      <Button size="sm" className="bg-primary hover:bg-primary/90 text-white gap-2">
                        <CircleDollarSign className="w-4 h-4" />
                        Make Payment
                      </Button>
                    )}
                    {rental.status === "active" && (
                      <Button size="sm" variant="outline" className="gap-2">
                        <Clock className="w-4 h-4" />
                        Submit Engine Hours
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents placeholder */}
        <div>
          <h2 className="text-lg font-bold mb-4">Documents</h2>
          <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
            Your uploaded documents (COI, Certificate of Authority, Driver's License) will appear
            here.
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
