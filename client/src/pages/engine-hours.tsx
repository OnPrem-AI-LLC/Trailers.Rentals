import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Gauge, Clock, CheckCircle, ArrowLeft } from "lucide-react";
import type { EngineHourEntry, Rental } from "@shared/schema";

interface TrailerInfo { vin: string; type: string; engineHourRate: number | null; }
interface RentalWithTrailer { rental: Rental; trailer: TrailerInfo | null; }

const submitSchema = z.object({
  currentReading: z.number({ invalid_type_error: "Enter a number" }).int().min(0, "Must be 0 or greater"),
  notes: z.string().max(500).optional(),
});
type SubmitForm = z.infer<typeof submitSchema>;

export default function EngineHoursPage() {
  const { rentalId } = useParams<{ rentalId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading: rentalLoading } = useQuery<RentalWithTrailer>({
    queryKey: ["/api/rentals", rentalId, "info"],
    queryFn: async () => {
      const res = await fetch(`/api/rentals/${rentalId}/info`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load rental");
      return res.json() as Promise<RentalWithTrailer>;
    },
    enabled: !!user && !!rentalId,
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery<EngineHourEntry[]>({
    queryKey: ["/api/rentals", rentalId, "engine-hours"],
    queryFn: async () => {
      const res = await fetch(`/api/rentals/${rentalId}/engine-hours`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load engine hours");
      return res.json();
    },
    enabled: !!user && !!rentalId,
  });

  const latest = entries[0];

  const form = useForm<SubmitForm>({
    resolver: zodResolver(submitSchema),
    defaultValues: { currentReading: undefined as unknown as number, notes: "" },
  });

  const submitMut = useMutation({
    mutationFn: async (values: SubmitForm) => {
      const res = await apiRequest("POST", `/api/rentals/${rentalId}/engine-hours`, values);
      if (!res.ok) {
        const err = await res.json() as { message: string };
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/rentals", rentalId, "engine-hours"] });
      form.reset({ currentReading: undefined as unknown as number, notes: "" });
      toast({ title: "Reading submitted!", description: "Your engine hour reading has been logged." });
    },
    onError: (err: Error) => toast({ title: "Submission failed", description: err.message, variant: "destructive" }),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!user) { navigate("/login"); return null; }

  const { rental, trailer } = data ?? {};
  const rate = trailer?.engineHourRate;

  const watchedReading = form.watch("currentReading");
  const previewHoursUsed = (watchedReading != null && latest?.currentReading != null)
    ? Math.max(0, watchedReading - latest.currentReading)
    : null;
  const previewCharge = (previewHoursUsed != null && rate != null)
    ? previewHoursUsed * rate
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        {/* Back */}
        <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Gauge className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Engine Hours</h1>
            <p className="text-sm text-muted-foreground">
              {trailer ? `${trailer.type.replace("_", " ")} — VIN ${trailer.vin}` : "Loading…"}
            </p>
          </div>
        </div>

        {/* Rate info */}
        {rate != null && (
          <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-4 mb-6 text-sm">
            <div className="flex items-center gap-2 text-amber-300 font-semibold mb-1">
              <Clock className="w-4 h-4" /> Engine hour billing active
            </div>
            <div className="text-amber-200/80">
              Your reefer engine hours are billed at <strong>${(rate / 100).toFixed(2)}/hr</strong> above the base monthly rate.
            </div>
          </div>
        )}

        {/* Previous reading */}
        {(rentalLoading || entriesLoading) ? (
          <Skeleton className="h-16 w-full rounded-xl mb-6" />
        ) : latest ? (
          <div className="bg-card border border-border rounded-xl p-4 mb-6 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Last Reading</div>
              <div className="font-bold text-2xl">{latest.currentReading.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">hrs</span></div>
              <div className="text-xs text-muted-foreground mt-0.5">{new Date(latest.createdAt).toLocaleDateString()}</div>
            </div>
            <Badge className="text-xs bg-blue-950 border-blue-800 text-blue-300">
              {latest.entryType === "admin_manual" ? "Admin entered" : "You submitted"}
            </Badge>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-4 mb-6 text-sm text-muted-foreground">
            No previous readings on file.
          </div>
        )}

        {/* Submission form */}
        <div className="bg-card border border-border rounded-xl p-6 mb-8">
          <h2 className="font-bold text-sm uppercase tracking-wide mb-5">Submit Current Reading</h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => submitMut.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="currentReading"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Engine Hours</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder={latest ? `Enter value > ${latest.currentReading}` : "e.g. 12450"}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value, 10))}
                        className="text-lg"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Live charge preview */}
              {previewCharge != null && (
                <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-3 text-sm">
                  <div className="text-amber-300 font-medium">Estimated Surcharge</div>
                  <div className="text-amber-100 mt-1">
                    {previewHoursUsed} hrs × ${(rate! / 100).toFixed(2)}/hr = <strong>${(previewCharge / 100).toFixed(2)}</strong>
                  </div>
                  <div className="text-amber-200/60 text-xs mt-0.5">Admin will issue an invoice once verified.</div>
                </div>
              )}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea placeholder="Any comments about the reading…" rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={submitMut.isPending} className="w-full gap-2">
                {submitMut.isPending ? "Submitting…" : (<><CheckCircle className="w-4 h-4" /> Submit Reading</>)}
              </Button>
            </form>
          </Form>
        </div>

        {/* History */}
        <div>
          <h2 className="font-bold text-sm uppercase tracking-wide mb-3">Reading History</h2>
          {entriesLoading ? (
            <div className="space-y-2">{[0,1,2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : entries.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center py-8">No readings yet.</div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div key={e.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-lg">{e.currentReading.toLocaleString()} hrs</div>
                      {e.hoursUsed != null && (
                        <div className="text-sm text-muted-foreground">
                          {e.hoursUsed} hrs used
                          {e.calculatedCharge != null && (
                            <span className="ml-2 text-amber-400 font-medium">
                              → ${(e.calculatedCharge / 100).toFixed(2)} surcharge
                            </span>
                          )}
                          {e.stripeInvoiceItemId && (
                            <span className="ml-2 text-green-400 text-xs">✓ Billed</span>
                          )}
                        </div>
                      )}
                      {e.notes && <div className="text-xs text-muted-foreground mt-1 italic">"{e.notes}"</div>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Badge className={`text-xs mb-1 ${e.entryType === "admin_manual" ? "bg-purple-950 border-purple-800 text-purple-300" : "bg-blue-950 border-blue-800 text-blue-300"}`}>
                        {e.entryType === "admin_manual" ? "Admin" : "You"}
                      </Badge>
                      <div className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
