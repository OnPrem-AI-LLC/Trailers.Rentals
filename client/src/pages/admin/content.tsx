import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft, Star, Plus, Trash2, Eye, EyeOff, LayoutTemplate } from "lucide-react";
import type { Testimonial } from "@shared/schema";

const testimonialSchema = z.object({
  customerName: z.string().min(1, "Name required"),
  companyName: z.string().optional(),
  quote: z.string().min(10, "Quote too short"),
  rating: z.coerce.number().int().min(1).max(5).default(5),
  isActive: z.boolean().default(true),
  displayOrder: z.coerce.number().int().default(0),
});
type TestimonialForm = z.infer<typeof testimonialSchema>;

function StarRating({ rating = 5 }: { rating?: number | null }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3 h-3 ${i < (rating ?? 5) ? "fill-primary text-primary" : "fill-muted text-muted"}`} />
      ))}
    </div>
  );
}

export default function AdminContentPage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "admin") navigate("/login");
  }, [user, authLoading, navigate]);

  const isAdmin = !!user && user.role === "admin";

  const { data: testimonials = [], isLoading } = useQuery<Testimonial[]>({
    queryKey: ["/api/admin/testimonials"],
    enabled: isAdmin,
  });

  const form = useForm<TestimonialForm>({
    resolver: zodResolver(testimonialSchema),
    defaultValues: { customerName: "", companyName: "", quote: "", rating: 5, isActive: true, displayOrder: 0 },
  });

  const createMut = useMutation({
    mutationFn: (data: TestimonialForm) => apiRequest("POST", "/api/admin/testimonials", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      toast({ title: "Testimonial added" });
      form.reset();
      setShowForm(false);
    },
    onError: () => toast({ title: "Error adding testimonial", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TestimonialForm> }) =>
      apiRequest("PATCH", `/api/admin/testimonials/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      toast({ title: "Testimonial updated" });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/testimonials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      toast({ title: "Testimonial removed" });
    },
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" />Back
            </Button>
          </Link>
          <LayoutTemplate className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Content Management</h1>
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => { setShowForm(!showForm); setEditingId(null); }}
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? "Cancel" : "Add Testimonial"}
          </Button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <h2 className="font-semibold text-sm mb-4">New Testimonial</h2>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => createMut.mutate(d))} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Customer Name</FormLabel>
                      <FormControl><Input placeholder="Mike T." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="companyName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Company (optional)</FormLabel>
                      <FormControl><Input placeholder="MT Freight Solutions" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="quote" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Quote</FormLabel>
                    <FormControl><Textarea placeholder="What did they say about Deluxe?" rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid sm:grid-cols-3 gap-4">
                  <FormField control={form.control} name="rating" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Rating (1-5)</FormLabel>
                      <FormControl><Input type="number" min={1} max={5} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="displayOrder" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Display Order</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMut.isPending} size="sm" className="bg-primary hover:bg-primary/90 text-white">
                    {createMut.isPending ? "Saving..." : "Add Testimonial"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        {/* Testimonials List */}
        <div className="mb-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            Testimonials
            <span className="text-muted-foreground font-normal">({testimonials.length})</span>
          </h2>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : testimonials.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <Star className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No testimonials yet. Add one above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {testimonials.map((t) => (
              <div key={t.id} className="bg-card border border-border rounded-xl p-5">
                {editingId === t.id ? (
                  <QuickEditForm
                    testimonial={t}
                    onSave={(data) => updateMut.mutate({ id: t.id, data })}
                    onCancel={() => setEditingId(null)}
                    isPending={updateMut.isPending}
                  />
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{t.customerName}</span>
                        {t.companyName && <span className="text-xs text-muted-foreground">{t.companyName}</span>}
                        <StarRating rating={t.rating} />
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ml-auto ${t.isActive ? "border-green-500/30 text-green-600" : "border-border text-muted-foreground"}`}>
                          {t.isActive ? "Active" : "Hidden"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">&ldquo;{t.quote}&rdquo;</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title={t.isActive ? "Hide" : "Show"}
                        onClick={() => updateMut.mutate({ id: t.id, data: { isActive: !t.isActive } })}
                        disabled={updateMut.isPending}
                      >
                        {t.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setEditingId(t.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMut.mutate(t.id)}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function QuickEditForm({
  testimonial,
  onSave,
  onCancel,
  isPending,
}: {
  testimonial: Testimonial;
  onSave: (data: { customerName?: string; companyName?: string; quote?: string; rating?: number; displayOrder?: number }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(testimonial.customerName);
  const [company, setCompany] = useState(testimonial.companyName ?? "");
  const [quote, setQuote] = useState(testimonial.quote);
  const [rating, setRating] = useState(testimonial.rating ?? 5);
  const [order, setOrder] = useState(testimonial.displayOrder ?? 0);

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Name</label>
          <Input className="h-8 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Company</label>
          <Input className="h-8 text-sm" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Quote</label>
        <Textarea className="text-sm" rows={2} value={quote} onChange={(e) => setQuote(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Rating</label>
          <Input className="h-8 text-sm" type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Order</label>
          <Input className="h-8 text-sm" type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs bg-primary hover:bg-primary/90 text-white" disabled={isPending}
          onClick={() => onSave({ customerName: name, companyName: company || undefined, quote, rating, displayOrder: order })}>
          Save
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
